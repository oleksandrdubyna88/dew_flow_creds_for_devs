import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEP_COLOR_KEYS, depColorThemeId } from '../depColors';
import { StorageManager } from '../storageManager';
import { recordingLog } from './liveColourStorage';
import { E1_AT_ROOT, E1_IN_FOLDER, FOLDER, OPTIONS, OUR_PIN, SSH_TITLE, WSL_NO_RELAY, WSL_READY, connectBase, entity, storageWith, world } from './sshConnectWorld';

/**
 * The human Connect path (audit A3): WHICH credential reaches ssh, and what each way leaves behind.
 *
 * <p>Tested as a SEQUENCE rather than as a result, because nothing this module returns tells you
 * whether a decrypted key was written to disk or whether it was wiped afterwards. Its collaborators
 * are substituted in <code>sshConnectWorld.ts</code>, which is what makes the sequence observable:
 * the point is not what <code>materializePrivateKey</code> does but whether this module calls it.</p>
 */



test('when the AGENT serves the key, nothing is written to disk and no -i is passed', async () => {
  // The feature's whole claim. Writing the key out anyway would defeat it exactly where a
  // person can see it working.
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
        agentServesKey: true,
      });

  assert.deepEqual(w.materialised, [], 'no key file');
  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, undefined, 'and no -i for ssh to find');
});

test('a stored key is materialised and passed to the terminal', async () => {
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.deepEqual(w.materialised, ['/storage/keys/k1.key']);
  assert.equal(w.sshTerminals[0].keyPath, '/storage/keys/k1.key');
});

test('the decrypted key is WIPED when the terminal closes', async () => {
  // A missed wipe leaves a decrypted private key on disk for the life of the window — the one
  // outcome the materialise-per-connection design exists to avoid.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: {},
  });
  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });
  assert.deepEqual(w.forgotten, [], 'not while the session is alive');

  w.closeTerminal({ name: 'somebody else' });
  assert.deepEqual(w.forgotten, [], 'and not when an unrelated terminal closes');

  w.closeTerminal(w.sshTerminalHandle);

  assert.deepEqual(w.forgotten, ['/storage/keys/k1.key'], 'wiped when THIS session ends');
});

test('a terminal that could not be opened wipes the key IMMEDIATELY', async () => {
  // Otherwise the file waits for a close event that will never arrive.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: undefined,
  });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.deepEqual(w.forgotten, ['/storage/keys/k1.key']);
});

test('a key that cannot be written is reported, and no terminal is opened', async () => {
  // Opening a terminal that would prompt for a password the person does not have is worse
  // than saying what went wrong.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    materialiseFails: true,
  });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.match(w.errors[0], /Could not write the stored key/);
  assert.deepEqual(w.sshTerminals, []);
});

test('a REFUSED host key stops before anything is written or opened', async () => {
  // Resolved before any disk write on purpose: a refused host key must cost nothing and leave
  // nothing behind.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: undefined,
  });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.deepEqual(w.materialised, []);
  assert.deepEqual(w.sshTerminals, []);
  assert.deepEqual(w.created, []);
});

test('a key PATH on the entity is used as it is — nothing is materialised', async () => {
  const w = world({ source: { kind: 'keyPath', path: '/home/me/.ssh/id_ed25519' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.deepEqual(w.materialised, []);
  assert.equal(w.sshTerminals[0].keyPath, '/home/me/.ssh/id_ed25519');
});

test('a password rides the ENVIRONMENT, never the command line', async () => {
  // A password on the command line is in the process table and in the shell history of
  // everyone on the box.
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.equal(w.created.length, 1);
  assert.equal(w.created[0].env?.CREDS_PASSWORD, 'hunter2');
  assert.ok(!w.created[0].sent.join(' ').includes('hunter2'), w.created[0].sent.join(' '));
});

test('a password session gets a FRESH terminal — this entry\'s earlier one is disposed', async () => {
  // The env carries THIS entity's password; reusing a terminal would run the new session with
  // the previous entity's credentials.
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });
  w.existing.push(w.created[0]); // the window lists the terminal it just opened
  await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });

  assert.equal(w.created[0].disposed, true, 'the earlier one is gone');
  assert.equal(w.created.length, 2);
});

// The owner, 2026-11-10: the tab names the folder and the entry. Two entries may share that title, so the password path
// disposes only a terminal it opened for THIS entry — never another entry's live session that happens to share the name.
test('a password terminal is titled with the folder and the entry', async () => {
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });

  assert.equal(w.created[0].name, SSH_TITLE);
});

test('a live terminal under the same title that this entry did not open is left alone', async () => {
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS, existingNamed: SSH_TITLE });

  await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });

  assert.equal(w.existing[0].disposed, false, 'another entry\'s session was closed');
  assert.equal(w.created.length, 1);
});

test('a key session hands the folder-and-entry title to the terminal it opens', async () => {
  const w = world({ source: { kind: 'none' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });

  assert.equal(w.sshTerminals[0]?.title, SSH_TITLE);
});

test('without a pinned host key, accept-new is added — with one, it is NOT', async () => {
  // With SSH_ASKPASS_REQUIRE=force even the host-key question would be answered by the askpass
  // program, with the password. A pinned host needs no such question and must not have its
  // checking softened.
  const unpinned = world({ source: { kind: 'password', password: 'p' }, options: { knownHostsFile: undefined } });
  await unpinned.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  const pinned = world({ source: { kind: 'password', password: 'p' }, options: { knownHostsFile: '/storage/known_hosts' } });
  await pinned.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.match(unpinned.created[0].sent[0], /StrictHostKeyChecking=accept-new/);
  assert.ok(!pinned.created[0].sent[0].includes('accept-new'), pinned.created[0].sent[0]);
});

test('a password entity with no host says so instead of starting a broken session', async () => {
  const w = world({ source: { kind: 'password', password: 'p' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity({ host: undefined }), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.match(w.warnings[0], /no host configured/);
  assert.deepEqual(w.created, []);
});

test('a warning from the credential resolver is surfaced, and the connection still proceeds', async () => {
  // "This entity points at a key that no longer exists, falling back to the password" is worth
  // saying, and is not a reason to refuse the connection.
  const w = world({
    source: { kind: 'keyPath', path: '/k', warning: 'the referenced key entity is gone' },
    options: OPTIONS,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.match(w.warnings[0], /key entity is gone/);
  assert.equal(w.sshTerminals.length, 1, 'and it still connected');
});

test('an entity with NO credential at all still opens a terminal for an agent or a config key', async () => {
  // `ssh` may still succeed through SSH_AUTH_SOCK or ~/.ssh/config; refusing here would break
  // the setups that never stored anything in the vault.
  const w = world({ source: { kind: 'none' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), {
        ...connectBase(),
        storageDir: '/storage',
      });

  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, undefined);
});

// Entry-PIN plan, D6: the human Connect opens every value through a CLICK opener — the owner's PIN is
// asked — and a value its opener stopped connects with nothing.

test('the human Connect resolves its credential through a click opener, never the automatic default', async () => {
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });

  assert.equal(typeof w.openers[0], 'function', 'no opener: the resolver fell back to the automatic one, which refuses a protected key');
});

test('a credential whose PIN was declined opens no terminal and writes nothing', async () => {
  const w = world({ source: { kind: 'stopped', reason: '', ownerName: 'deploy key' }, options: OPTIONS });

  const opened = await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });

  assert.equal(opened, false);
  assert.deepEqual(w.materialised, []);
  assert.equal(w.sshTerminals.length, 0, 'a terminal opened with no credential after the person said no');
});

/**
 * An agent's request that ends while its terminal is being prepared opens nothing
 * (`PLAN_wsl_bridge_outlives_its_client.md` §5.7; the risk consultation on E4.S1). The broker checks the
 * request at the action start, but the credential lookup, the host-key read and the relay probe all
 * await between that check and the terminal — a client gone in there used to get its terminal anyway.
 */
test('a client that leaves during the credential lookup gets no terminal and leaves no key on disk', async () => {
  const request = new AbortController();
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: {},
    duringLookup: () => request.abort(),
  });

  const opened = await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage', startGate: request.signal });

  assert.equal(opened, false);
  assert.equal(w.sshTerminals.length, 0, 'a terminal opened for a request whose client had gone');
  assert.deepEqual(w.materialised, [], 'and a decrypted key was written for it');
});

test('a password session for a client already gone creates no terminal and sends no line', async () => {
  const request = new AbortController();
  request.abort();
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  const opened = await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage', startGate: request.signal });

  assert.equal(opened, false);
  assert.equal(w.created.length, 0);
});

test('a live request is not refused — the gate only reads a fired signal', async () => {
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS, sshTerminal: {} });

  const opened = await w.mod.connectEntity('a1', entity(), {
    ...connectBase(),
    storageDir: '/storage',
    startGate: new AbortController().signal,
  });

  assert.equal(opened, true);
  assert.equal(w.sshTerminals.length, 1);
});

test('the ssh install offer is handed the agent request it serves, so a late Install starts nothing for a gone client (E4.S3)', async () => {
  // Found while gating the VPN start: this offer is a modal, and the installer it sends ran for a request
  // whose client had left while it was open — the same class as the VPN's own install offer.
  const request = new AbortController();
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS, sshMissing: true });

  const opened = await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage', startGate: request.signal });

  assert.equal(opened, false);
  assert.deepEqual(w.installOffers.map((o) => o.tool), ['ssh']);
  assert.equal(w.installOffers[0].startGate, request.signal, 'the install offer was not told which request it serves');
});

/**
 * A gone request reaches no SSH prompt (`PLAN_wsl_bridge_outlives_its_client.md` §5.7, story E4.S4).
 *
 * <p>E4.S1's gate sits after the last await before a terminal opens, so a terminal never opened for a gone
 * request — but every prompt before it still did: the credential lookup's PIN box, the host-key question,
 * a window's refusal with its remedy and its retry. Each case here fires the request's signal at one of
 * those awaits and then lets the path continue, which is the moment a person answers a dialog nobody waits
 * for.</p>
 */
test('a request already gone at the entry is asked nothing — not even its credential lookup (E4.S4)', async () => {
  const request = new AbortController();
  request.abort();
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS, sshTerminal: {} });

  const opened = await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage', startGate: request.signal });

  assert.equal(opened, false);
  assert.equal(w.openers.length, 0, 'the credential was looked up — its PIN asked — for a request whose client had gone');
  assert.deepEqual(w.hostKeyAsked, [], 'the host-key question was raised for a request whose client had gone');
  assert.deepEqual(w.warnings, [], 'a person who did not ask was told something');
});

test('a client that leaves during the credential lookup is shown no host-key question and no warning (E4.S4)', async () => {
  const request = new AbortController();
  const w = world({
    source: { kind: 'keyPath', path: '/k', warning: 'the referenced key entity is gone' },
    options: OPTIONS,
    sshTerminal: {},
    duringLookup: () => request.abort(),
  });

  const opened = await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage', startGate: request.signal });

  assert.equal(opened, false);
  assert.deepEqual(w.hostKeyAsked, [], 'the host-key question was raised for a request whose client had gone');
  assert.deepEqual(w.warnings, [], 'the credential warning was shown to a person who did not ask');
});

test('the host-key conversation is handed the request it serves; the person’s own Connect hands it none (E4.S4)', async () => {
  const request = new AbortController();
  const agent = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS, sshTerminal: {} });
  await agent.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage', startGate: request.signal });

  const person = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS, sshTerminal: {} });
  await person.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });

  assert.equal(agent.hostKeyAsked[0], request.signal, 'the host-key question was not told which request it serves');
  assert.equal(agent.sshTerminals.length, 1, 'a live request still connects');
  assert.deepEqual(person.hostKeyAsked, [undefined], 'the person’s own click has no request behind it');
  assert.equal(person.sshTerminals.length, 1);
});

test('a client gone while a refusal’s modal is open: the button runs no remedy, copies nothing and retries nothing (E4.S4)', async () => {
  // A WSL window with a stored key and no relay refuses, offering *Set Up the Relay*; the person presses it
  // after the client has left. The remedy — a relay started, a key loaded into the agent — and the retry
  // that asks the PIN and the host key again are not for a request nobody waits for.
  const request = new AbortController();
  const remedies: string[] = [];
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    chooseButton: true,
    duringRefusal: () => request.abort(),
  });

  const opened = await w.mod.connectEntity('a1', entity(), {
    ...connectBase(),
    storageDir: '/storage',
    agentServesKey: false,
    remote: {
      ...WSL_NO_RELAY,
      runRemedy: async (action): Promise<boolean> => {
        remedies.push(action);
        return true;
      },
    },
    startGate: request.signal,
  });

  assert.equal(opened, false);
  assert.equal(w.warnings.length, 1, 'the refusal was shown once, to a live request');
  assert.deepEqual(remedies, [], 'a remedy ran for a request whose client had gone');
  assert.deepEqual(w.copied, [], 'a command was copied for a request whose client had gone');
  assert.equal(w.openers.length, 1, 'the connect was retried — its PIN asked again — for a request whose client had gone');
});

test('a request already gone at a late refusal is shown no modal, and its pin file is taken back (E4.S4)', async () => {
  // The relay route translates the pinned host key's path through the distribution — the last await before
  // a refusal `known-hosts-translation-failed`. A client gone during it gets no modal at all.
  const request = new AbortController();
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: { knownHostsFile: OUR_PIN },
    translated: '',
    chooseButton: true,
    duringTranslate: () => request.abort(),
  });

  const opened = await w.mod.connectEntity('a1', entity(), {
    ...connectBase(),
    storageDir: '/storage',
    agentServesKey: true,
    remote: WSL_READY,
    startGate: request.signal,
  });

  assert.equal(opened, false);
  assert.deepEqual(w.warnings, [], 'a refusal was shown to a person who did not ask');
  assert.deepEqual(w.forgotten, [OUR_PIN], 'the pin file written for the connection was left behind');
  assert.deepEqual(w.sshTerminals, []);
});

test('after the entry moved, the password road still closes ITS earlier terminal', async () => {
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });
  const atRoot = storageWith(E1_AT_ROOT);

  await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });
  w.existing.push(w.created[0]);
  await w.mod.connectEntity('a1', entity(), { storage: atRoot, storageDir: '/storage', log: recordingLog().log, onMutated: () => undefined });

  assert.equal(w.created[0].disposed, true, 'the old tab, holding the password, was left open');
  assert.equal(w.created[1].name, 'Creds SSH: prod');
});

test('the password road never closes the same entry id\'s terminal of another account', async () => {
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), { ...connectBase(), storageDir: '/storage' });
  w.existing.push(w.created[0]);
  await w.mod.connectEntity('a2', entity(), { ...connectBase(), storageDir: '/storage' });

  assert.equal(w.created[0].disposed, false);
  assert.equal(w.created.length, 2);
});

/** The theme id the password terminal of a connect against `storage` wears, or `absent` when it was created with no `color` property at all. */
async function passwordColour(storage: StorageManager): Promise<string> {
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });
  await w.mod.connectEntity('a1', entity(), { storage, storageDir: '/storage', log: recordingLog().log, onMutated: () => undefined });
  return 'color' in w.created[0] ? (w.created[0].color?.id ?? 'undefined') : 'absent';
}

/** The colour on the place a key session of a connect against `storage` hands to the terminal it opens. */
async function keyColour(storage: StorageManager): Promise<string | undefined> {
  const w = world({ source: { kind: 'none' }, options: OPTIONS, sshTerminal: {} });
  await w.mod.connectEntity('a1', entity(), { storage, storageDir: '/storage', log: recordingLog().log, onMutated: () => undefined });
  return w.sshTerminals[0].place?.color;
}

test('the_password_and_key_terminals_wear_the_folder_colour', async () => {
  const wearing = storageWith(E1_IN_FOLDER, { ...FOLDER, folderColor: DEP_COLOR_KEYS[2] });

  assert.equal(await passwordColour(wearing), depColorThemeId(DEP_COLOR_KEYS[2]), 'the password terminal');
  assert.equal(await keyColour(wearing), DEP_COLOR_KEYS[2], 'the key session\'s place');
  assert.equal(await passwordColour(storageWith(E1_AT_ROOT)), 'absent', 'an entry at the root has no folder, so no colour (the property is absent)');
  assert.equal(await keyColour(storageWith(E1_AT_ROOT)), undefined, 'and its key session\'s place carries none');
});

test('the_first_connect_colours_an_uncoloured_folder_once', async () => {
  const fresh = storageWith(E1_IN_FOLDER, FOLDER);
  const first = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await first.mod.connectEntity('a1', entity(), { storage: fresh, storageDir: '/storage', log: recordingLog().log, onMutated: () => undefined });

  assert.equal(fresh.written.length, 1, 'one write');
  assert.deepEqual(fresh.written[0].change, { folderColor: DEP_COLOR_KEYS[0] }, 'the first key of the empty palette use, on the folder');
  assert.equal(fresh.written[0].id, FOLDER.id);
  assert.equal(first.created[0].color?.id, depColorThemeId(DEP_COLOR_KEYS[0]), 'and its terminal wears it');

  const second = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });
  await second.mod.connectEntity('a1', entity(), { storage: fresh, storageDir: '/storage', log: recordingLog().log, onMutated: () => undefined });
  assert.equal(fresh.written.length, 1, 'a second connect writes nothing');
  assert.equal(second.created[0].color?.id, depColorThemeId(DEP_COLOR_KEYS[0]));
});

test('the_first_connect_repaints_the_tree_once_and_a_folder_with_a_colour_never', async () => {
  const fresh = storageWith(E1_IN_FOLDER, FOLDER);
  let repaints = 0;
  const options = { storage: fresh, storageDir: '/storage', log: recordingLog().log, onMutated: (): void => void (repaints += 1) };

  await world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS }).mod.connectEntity('a1', entity(), options);
  assert.equal(fresh.written.length, 1, 'the first connect wrote the colour');
  assert.equal(repaints, 1, 'and the tree repaints once, so the folder row shows it');

  await world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS }).mod.connectEntity('a1', entity(), options);
  assert.equal(repaints, 1, 'a second connect found a colour and wrote nothing: no repaint');

  const wearing = storageWith(E1_IN_FOLDER, { ...FOLDER, folderColor: DEP_COLOR_KEYS[2] });
  await world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS }).mod.connectEntity('a1', entity(), { ...options, storage: wearing });
  assert.equal(repaints, 1, 'a folder that already wore a colour is not repainted');
});

test('a_failed_colour_write_repaints_nothing', async () => {
  const failing = storageWith(E1_IN_FOLDER, FOLDER);
  failing.failNextWrite(new Error('the store is down'));
  let repaints = 0;

  await world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS }).mod.connectEntity('a1', entity(), { storage: failing, storageDir: '/storage', log: recordingLog().log, onMutated: (): void => void (repaints += 1) });

  assert.equal(repaints, 0, 'nothing was saved, so there is nothing to repaint');
});

test('a_failed_colour_write_still_connects_and_says_so_in_the_log', async () => {
  const failing = storageWith(E1_IN_FOLDER, FOLDER);
  failing.failNextWrite(new Error('the store is down'));
  const { log, lines } = recordingLog();
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  const opened = await w.mod.connectEntity('a1', entity(), { storage: failing, storageDir: '/storage', log, onMutated: () => undefined });

  assert.equal(opened, true, 'the terminal opened');
  assert.equal('color' in w.created[0], false, 'without a colour');
  assert.deepEqual(lines.map((line) => line.source), ['folderColors'], 'and one line in the log');
  assert.match(lines[0].message, /the store is down/);
  assert.doesNotMatch(lines[0].message, /prod|ssh connections/, 'which names no folder or entry');
  assert.deepEqual(w.warnings.concat(w.errors), [], 'no toast');
});
