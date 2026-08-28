/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { RecoverySessionKeys } from '../breakGlass';
import { StorageManager } from '../storageManager';
import { TransportFactory } from '../transportFactory';
import { VaultKeys } from '../vaultKeys';
import { accountFromTargetOrPick } from '../accountPick';
import { readVaultWraps } from '../cryptoUtils';
import * as vscode from 'vscode';
import { EscrowInvite } from '../orgRecoveryClient';
import { SharePayload as EscrowShareShape } from '../orgShareEnvelope';
import { openSharePayload } from '../orgShareEnvelope';
import { describeError } from '../describeError';
import { StoredAccount } from '../types';
import { OrgRecoveryClient } from '../orgRecoveryClient';
import { judgeOrgRecovery } from '../orgRecoveryPinning';
import { showOrgRecoveryView } from '../orgRecoveryPanel';
import { orgRecoveryNotice } from '../orgRecoveryPinning';
import { shareMatchesCurrentKey } from '../orgEscrowShareWrap';
import { OrgRecoveryVerdict } from '../orgRecoveryPinning';
import { OrgRecoveryFacts } from '../orgRecoveryPinning';
import { pinOrgRecovery } from '../orgRecoveryPinning';
import { sealShareWithPin } from '../orgEscrowShareWrap';
import { newSessionKeys } from '../breakGlass';
import { sessionKeyFingerprint } from '../breakGlass';
import { copySecret } from '../secretClipboard';
import { openShareWithPin } from '../orgEscrowShareWrap';
import { sealShareToSession } from '../breakGlass';
import { wipe as wipeRecovered } from '../breakGlass';
import { endRecoverySession } from '../breakGlass';
import { Contribution } from '../breakGlass';
import { recoverOrgKey } from '../breakGlass';
import { keyMatchesPublished } from '../breakGlass';
import { recoveredVaultIsTheTarget } from '../breakGlass';
import { orgEscrowWrap } from '../keyWrap';
import { isKeyWrap as isWrap } from '../keyWrap';
import { unwrapWithOrgEscrow } from '../keyWrap';
import { decryptJsonWithMasterKey } from '../cryptoUtils';
import { pinValidator } from '../pinInput';
import { readBackupAccount } from '../cryptoUtils';
import { rekeyUnderPin } from '../vaultRekey';
export interface RecoveryCommandsHost {
  readonly breakGlassSessions: Map<string, RecoverySessionKeys>;
  readonly context: vscode.ExtensionContext;
  readonly pinStore: (ctx: vscode.ExtensionContext) => { get(key: string): Record<string, string> | undefined; update(key: string, value: Record<string, string>): Thenable<void> };
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly transports: TransportFactory;
  readonly vaultKeys: VaultKeys;
}

export function registerRecoveryCommands(host: RecoveryCommandsHost): void {
  const { breakGlassSessions, context, pinStore, register, storage, transports, vaultKeys } = host;

  /** What a recovery could not do, in the words the officer needs to act on. */
  function recoveryFailureText(outcome: { kind: string; have?: number; need?: number }): string {
    if (outcome.kind === 'tooFew') {
      return `Only ${outcome.have} of ${outcome.need} officers have contributed so far.`;
    }
    return (
      'The contributions collected do not rebuild this organisation’s recovery key. Either a '
      + 'share is from a superseded ceremony, or one of them is not what it claims to be. '
      + 'Nothing was opened.'
    );
  }

  /**
   * Open an invite's sealed payload with the one-time PIN.
   *
   * <p>Returns the shape from INSIDE the blob, never the plaintext copies the invite carries
   * beside it. The two agree on an honest invite; where they disagree the sealed one is the
   * only one anything authenticated.</p>
   */
  function openShareEnvelope(
    invite: EscrowInvite,
    recipientEmail: string,
    pin: string,
  ): { bytes: Buffer; integrityTag: string; shape: EscrowShareShape } | undefined {
    const payload = openSharePayload(invite, recipientEmail, pin);
    return payload === undefined
      ? undefined
      : {
          bytes: Buffer.from(payload.share, 'base64'),
          integrityTag: payload.integrityTag,
          shape: payload,
        };
  }

  register('credSshManager.showOrgRecovery', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Corporate recovery for…');
    if (account === undefined) {
      return;
    }
    const client = transports.orgRecoveryFor(account);
    if (client === undefined) {
      void vscode.window.showInformationMessage(
        `${account.email} does not sync to a vault server, so corporate recovery does not apply to it.`,
      );
      return;
    }
    try {
      await showOrgRecoveryFor(account, client);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Could not read corporate recovery: ${describeError(error)}`,
      );
    }
  });

  /** Read everything the page shows, judge the key, and render it. */
  async function showOrgRecoveryFor(
    account: StoredAccount,
    client: OrgRecoveryClient,
  ): Promise<void> {
    const config = await client.readConfig(account);
    const facts = {
      enabled: config.enabled,
      setupComplete: config.setupComplete,
      orgPublicKeyFingerprint: config.orgPublicKeyFingerprint,
      rosterFingerprint: config.rosterFingerprint,
      location: client.location,
    };
    const verdict = judgeOrgRecovery(pinStore(context), account.accountId, facts);
    const isOfficer = config.officerEmails.includes(account.email.toLowerCase());
    const share = await storage.getOrgEscrowShare(account.accountId);
    showOrgRecoveryView({
      accountEmail: account.email,
      location: client.location,
      config,
      notice: orgRecoveryNotice(verdict, facts),
      isOfficer,
      holdsShare:
        share !== undefined && shareMatchesCurrentKey(share, config.orgPublicKeyFingerprint),
      pendingInvites: isOfficer ? (await client.listInvites(account)).length : 0,
      audit: isOfficer ? await client.readAudit(account) : [],
    });
    await offerToTrust(account, verdict, facts);
  }

  /**
   * Turn a person's look at the fingerprint into the pin.
   *
   * <p>Pinning is deliberately NOT a side effect of opening the page: "somebody viewed this once"
   * is not the claim the pin makes. The claim is "a human compared this fingerprint with an
   * officer", and only a person can make it — so it is a modal beside the page that shows the
   * fingerprint, and declining leaves the verdict exactly where it was.</p>
   *
   * <p>Until this runs, `judgeOrgRecovery` answers `firstContact` forever and a substituted
   * organisation key cannot be told from a legitimate rotation.</p>
   */
  async function offerToTrust(
    account: StoredAccount,
    verdict: OrgRecoveryVerdict,
    facts: OrgRecoveryFacts,
  ): Promise<void> {
    const notice = orgRecoveryNotice(verdict, facts);
    if (notice.length === 0) {
      return; // verified, off, or not ready — nothing to decide
    }
    const answer = await vscode.window.showWarningMessage(
      notice,
      { modal: true },
      'I have checked this fingerprint',
    );
    if (answer === 'I have checked this fingerprint') {
      await pinOrgRecovery(pinStore(context), account.accountId, facts);
      void vscode.window.showInformationMessage(
        `Recovery key pinned for ${account.email}. A different one will be refused from now on, `
          + 'not merely reported.',
      );
    }
  }

  /**
   * Accept a share of the organisation's recovery key.
   *
   * <p>The acknowledgement is sent only AFTER the share is durably in this officer's own vault.
   * A crash in between leaves the invite safely pending; an ack sent first would let the
   * initiator publish a key whose quorum cannot be assembled.</p>
   */
  register('credSshManager.acceptRecoveryShare', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Accept a recovery share as…');
    if (account === undefined) {
      return;
    }
    const client = transports.orgRecoveryFor(account);
    if (client === undefined) {
      void vscode.window.showInformationMessage('That account does not sync to a vault server.');
      return;
    }
    try {
      const invites = await client.listInvites(account);
      if (invites.length === 0) {
        void vscode.window.showInformationMessage('No recovery shares are waiting for you.');
        return;
      }
      const invite = invites[0];
      const pin = await vscode.window.showInputBox({
        title: `Recovery share from ${invite.fromEmail}`,
        prompt: 'The one-time PIN they told you out of band.',
        password: true,
        ignoreFocusOut: true,
      });
      if (pin === undefined) {
        return;
      }
      await acceptRecoveryShare(account, client, invite, pin);
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not accept the share: ${describeError(error)}`);
    }
  });

  async function acceptRecoveryShare(
    account: StoredAccount,
    client: OrgRecoveryClient,
    invite: EscrowInvite,
    pin: string,
  ): Promise<void> {
    const config = await client.readConfig(account);
    const payload = openShareEnvelope(invite, account.email, pin);
    if (payload === undefined) {
      void vscode.window.showErrorMessage('That PIN does not open the share.');
      return;
    }
    const vaultPin = await vaultKeys.storedPin(account);
    if (vaultPin === undefined) {
      void vscode.window.showErrorMessage(
        'Set this account\'s vault PIN first — your share is sealed under it.',
      );
      return;
    }
    // Every number here comes from the SEALED payload. The invite's plaintext copies are the
    // server's, and a server that alters them seals a mislabelled share into this officer's own
    // vault — invisible until the day the quorum cannot rebuild the key.
    const wrap = await sealShareWithPin(
      payload.bytes,
      {
        setupId: invite.setupId,
        shareIndex: payload.shape.shareIndex,
        threshold: payload.shape.threshold,
        totalShares: payload.shape.totalShares,
        integrityTag: payload.integrityTag,
        orgPublicKeyFingerprint: config.orgPublicKeyFingerprint,
      },
      account.accountId,
      vaultPin,
      Date.now(),
    );
    await storage.setOrgEscrowShare(account.accountId, wrap);
    // Durable first, acknowledged second — never the other way round.
    await client.acknowledgeInvite(account, invite.id);
    void vscode.window.showInformationMessage(
      `Recovery share stored. You are one of ${invite.totalShares} officers; ${invite.threshold} of you can open a colleague's vault together.`,
    );
  }

  register('credSshManager.startBreakGlass', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Start a recovery as…');
    if (account === undefined) {
      return;
    }
    const client = transports.orgRecoveryFor(account);
    if (client === undefined) {
      void vscode.window.showInformationMessage('That account does not sync to a vault server.');
      return;
    }
    const targetEmail = await vscode.window.showInputBox({
      title: 'Whose vault needs recovering?',
      prompt: 'The email of the person whose vault must be opened without them.',
      ignoreFocusOut: true,
    });
    if (targetEmail === undefined || targetEmail.trim().length === 0) {
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Open ${targetEmail.trim()}'s vault using the corporate recovery key? This is recorded permanently, visible to every officer, and it re-keys their vault — they will need a new PIN from you afterwards.`,
      { modal: true },
      'Start recovery',
    );
    if (confirmed !== 'Start recovery') {
      return;
    }
    try {
      const keys = newSessionKeys();
      const session = await client.startSession(
        account,
        targetEmail.trim(),
        keys.publicKey.toString('base64'),
      );
      breakGlassSessions.set(session.sessionId, keys);
      // Id AND fingerprint. The id routes the other officers to this session; the fingerprint is
      // the only thing that tells them the key they are handed is the one this window minted.
      const print = sessionKeyFingerprint(keys.publicKey.toString('base64'));
      await copySecret(vscode.env.clipboard, `${session.sessionId}  ${print}`);
      void vscode.window.showInformationMessage(
        `Recovery started. Session id and check-code copied — send them to ${session.threshold - 1} other officer(s), `
          + `who run "Contribute to a Recovery…". READ THE CHECK-CODE ALOUD (${print}): if their screen shows a `
          + 'different one, the server substituted the key and their share would go to whoever did it.',
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not start the recovery: ${describeError(error)}`);
    }
  });

  register('credSshManager.contributeToRecovery', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Contribute as…');
    if (account === undefined) {
      return;
    }
    const client = transports.orgRecoveryFor(account);
    if (client === undefined) {
      void vscode.window.showInformationMessage('That account does not sync to a vault server.');
      return;
    }
    const sessionId = await vscode.window.showInputBox({
      title: 'Contribute to a recovery',
      prompt: 'The session id the initiating officer sent you.',
      ignoreFocusOut: true,
    });
    if (sessionId === undefined || sessionId.trim().length === 0) {
      return;
    }
    try {
      await contributeToRecovery(account, client, sessionId.trim());
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not contribute: ${describeError(error)}`);
    }
  });

  async function contributeToRecovery(
    account: StoredAccount,
    client: OrgRecoveryClient,
    sessionId: string,
  ): Promise<void> {
    const session = await client.readSession(account, sessionId);
    // The fingerprint of the key this share will actually be sealed to — computed from what the
    // server served, so a substitution shows up here or nowhere.
    const print = sessionKeyFingerprint(session.sessionPublicKey);
    const agreed = await vscode.window.showWarningMessage(
      `${session.initiatorEmail} is asking to open ${session.targetEmail}'s vault. Contributing your share `
        + 'helps them do it, and your name is recorded against it.\n\n'
        + `Check-code: ${print}\n\n`
        + 'This must match what they read to you. If it does not, STOP: the server has substituted '
        + 'the key and your share would go to whoever did it, not to them.',
      { modal: true },
      'The code matches — contribute my share',
    );
    if (agreed !== 'The code matches — contribute my share') {
      return;
    }
    const wrap = await storage.getOrgEscrowShare(account.accountId);
    if (wrap === undefined) {
      void vscode.window.showErrorMessage('This machine holds no recovery share for you.');
      return;
    }
    const vaultPin = await vaultKeys.storedPin(account);
    if (vaultPin === undefined) {
      void vscode.window.showErrorMessage('Enter this account\'s vault PIN first.');
      return;
    }
    const share = await openShareWithPin(wrap, account.accountId, vaultPin);
    const sealed = sealShareToSession(share, Buffer.from(session.sessionPublicKey, 'base64'));
    try {
      await client.contribute(account, sessionId, {
        shareIndex: sealed.shareIndex,
        ephemeralPublicKey: sealed.ephemeralPublicKey,
        salt: sealed.salt,
        iv: sealed.iv,
        tag: sealed.tag,
        data: sealed.data,
      });
    } finally {
      // The officer's own plaintext share. A network failure is the likeliest way to reach
      // this line, and it is exactly the case where the old code kept the share alive.
      wipeRecovered(share.bytes);
    }
    void vscode.window.showInformationMessage(
      `Your share is with ${session.initiatorEmail}'s recovery of ${session.targetEmail}.`,
    );
  }

  /**
   * Finish a recovery: rebuild the key from the quorum, open the target's vault, re-key it.
   *
   * <p>The re-key is not optional and not a separate step. The whole point of opening somebody
   * else's vault is that they are gone; leaving it sealed to a PIN and a security key nobody
   * has would mean the next person to need it starts this ceremony again.</p>
   */
  register('credSshManager.finishBreakGlass', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Finish a recovery as…');
    if (account === undefined) {
      return;
    }
    const client = transports.orgRecoveryFor(account);
    if (client === undefined) {
      void vscode.window.showInformationMessage('That account does not sync to a vault server.');
      return;
    }
    const sessionId = await vscode.window.showInputBox({
      title: 'Finish a recovery',
      prompt: 'The session id you started.',
      ignoreFocusOut: true,
    });
    if (sessionId === undefined || sessionId.trim().length === 0) {
      return;
    }
    const keys = breakGlassSessions.get(sessionId.trim());
    if (keys === undefined) {
      void vscode.window.showErrorMessage(
        'This window did not start that recovery. The session key lives only in the window that '
          + 'began it — start a new recovery rather than trying to resume this one.',
      );
      return;
    }
    try {
      await finishBreakGlass(account, client, sessionId.trim(), keys);
    } catch (error) {
      void vscode.window.showErrorMessage(`Recovery failed: ${describeError(error)}`);
    } finally {
      // Every exit: the two early returns inside, a thrown unwrap, a failed write-back. The
      // session key is what turns the collected contributions back into shares, so a path that
      // leaves it live leaves a quorum's worth of material reachable in this process.
      endRecoverySession(keys);
      breakGlassSessions.delete(sessionId.trim());
    }
  });

  async function finishBreakGlass(
    account: StoredAccount,
    client: OrgRecoveryClient,
    sessionId: string,
    keys: RecoverySessionKeys,
  ): Promise<void> {
    const config = await client.readConfig(account);
    const session = await client.readSession(account, sessionId);
    const share = await storage.getOrgEscrowShare(account.accountId);
    if (share === undefined) {
      void vscode.window.showErrorMessage(
        'This machine holds no recovery share, so it cannot say what shape the split has — '
          + 'accept your own share first.',
      );
      return;
    }
    // Each contribution carries its own x coordinate. It is not secret — a coordinate is not a
    // value — and without it the shares are points on a curve with no x, which cannot be
    // interpolated at all.
    const contributions: Contribution[] = session.contributions.map((c) => ({
      officerEmail: c.officerEmail,
      shareIndex: c.shareIndex,
      sealed: c,
    }));
    const outcome = recoverOrgKey(
      contributions,
      keys.privateKey,
      share.threshold,
      share.totalShares,
      share.integrityTag,
    );
    if (outcome.kind !== 'recovered') {
      void vscode.window.showErrorMessage(recoveryFailureText(outcome));
      return;
    }
    if (!keyMatchesPublished(outcome.orgPrivateKey, Buffer.from(config.orgPublicKey, 'base64'))) {
      wipeRecovered(outcome.orgPrivateKey);
      void vscode.window.showErrorMessage(
        'The reconstructed key is not the one this server publishes — the shares are from an '
          + 'older ceremony. Nothing was opened.',
      );
      return;
    }
    try {
      await openAndRekey(account, client, session.sessionId, session.targetEmail, outcome.orgPrivateKey);
    } finally {
      // A failed unwrap or a network error on the write-back must not leave the organisation's
      // reconstructed private key in memory — it opens every vault on that server.
      wipeRecovered(outcome.orgPrivateKey);
    }
  }

  async function openAndRekey(
    account: StoredAccount,
    client: OrgRecoveryClient,
    sessionId: string,
    targetEmail: string,
    orgPrivateKey: Buffer,
  ): Promise<void> {
    const { content, etag } = await client.readTargetVault(account, sessionId);
    // The quorum authorised opening THIS person's vault. Every vault on the server is sealed to
    // the same organisation key, so the reconstructed key opens all of them — and the only thing
    // separating "a quorum for A" from "a quorum for anybody" is checking that the ciphertext
    // the server handed back is the one that was asked for.
    if (!recoveredVaultIsTheTarget(content, targetEmail)) {
      void vscode.window.showErrorMessage(
        `The server returned a vault that does not belong to ${targetEmail}. Nothing was opened. `
          + 'Report this: a correct server cannot answer a recovery with somebody else’s vault.',
      );
      return;
    }
    const escrow = orgEscrowWrap(readVaultWraps(content).filter(isWrap));
    if (escrow === undefined) {
      void vscode.window.showErrorMessage(
        `${targetEmail}'s vault carries no corporate escrow wrap — it was written before `
          + 'recovery was configured, or by a client that refused to trust this key.',
      );
      return;
    }
    const master = unwrapWithOrgEscrow(escrow, orgPrivateKey);
    const payload = decryptJsonWithMasterKey(content, master);
    const temporaryPin = await vscode.window.showInputBox({
      title: `A temporary PIN for ${targetEmail}'s vault`,
      prompt: 'The vault is re-keyed under this. Hand it over out of band; they replace it.',
      password: true,
      ignoreFocusOut: true,
      validateInput: pinValidator('choosing'),
    });
    if (temporaryPin === undefined) {
      wipeRecovered(master);
      return;
    }
    // The PIN wrap binds to the OWNER's accountId, not the recovering officer's. It is in the
    // envelope's plaintext header — which is exactly why that header is plaintext: a restore
    // has to know whose vault it is holding before it can open anything.
    const owner = readBackupAccount(content);
    if (owner === undefined) {
      wipeRecovered(master);
      void vscode.window.showErrorMessage(
        `${targetEmail}'s vault carries no account header, so a re-key could not be bound to them.`,
      );
      return;
    }
    const rotated = await rekeyUnderPin({
      payload,
      account: owner,
      pin: temporaryPin,
      now: Date.now(),
      pendingShares: undefined,
      previousWraps: readVaultWraps(content).filter(isWrap),
    });
    await client.writeTargetVault(account, sessionId, rotated.content, etag);
    wipeRecovered(master, rotated.masterKey);
    void vscode.window.showInformationMessage(
      `${targetEmail}'s vault is recovered and re-keyed. Every previous PIN, security key and `
        + 'recovery code for it is now dead; give them the temporary PIN out of band. This is '
        + 'recorded where every officer can see it.',
    );
  }

}
