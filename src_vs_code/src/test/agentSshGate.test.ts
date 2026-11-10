import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test } from 'node:test';
import { BUSY_PLACE, LOCAL_DOOR, TokenlessCeilings } from '../aliasThrottle';
import { changedWhileAsking, journalLine, linkedCall, linkedRunRefused, terminalRunAction } from '../agentUseActions';
import { BRIDGE_NOT_SERVED, BRIDGE_ROUTES, bridgeRouteRefusal } from '../bridgeAllowList';
import type { BridgeContext } from '../bridgeContext';
import { commandFingerprint } from '../commandTrust';
import { switchForAction } from '../mcpEntries';
import { planLaunch, refusalSaid, sshLinkOf, sshLinkRefusal } from '../remoteLaunch';
import { asksAfter } from '../useActions';
import type { UseActionContext, UseActionResult, UsedEntry } from '../useActions';
import { MaskSourceUnavailable, maskEntriesWithLink } from '../maskEntries';
import type { LinkedSecretSource } from '../maskEntries';
import { stored } from '../storedSecret';
import type { StoredSecret } from '../storedSecret';
import type { SshUseDeps } from '../sshUseActions';
import type { EntityMetadata, TreeNode } from '../types';
import { sshNode } from './sshRoadWorld';
import { ACCOUNT_1, ACCOUNT_2, GateOptions, GateWorld, OK_BODY, asBroker, detailsOf, gateWorld, trashFolder, trustLineOf, usableSsh } from './agentSshWorld';
import { call, share, world } from './brokerWorld';
import { ownerChain, startVpn, world as vpnWorldOf } from './vpnWorld';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';
import { loadWithVscode } from './vscodeStub';

const scope = cleanupScope();
after(() => scope.close());

/**
 * The authorisation of the agent's run over SSH (E3.S2; spec `todo/PLAN_terminal_command_over_ssh_E3_S2_security.md`, scenarios G1-G22).
 * Each test is named for the guarantee; each was watched RED first, and the commit that builds the guarantee says what the failure read.
 */

/** `sshUseActions.ts` imports `vscode`; loaded with the stub only to ask whether `sshExecAction` declares `uses`. */
const loadSshActions = async (): Promise<typeof import('../sshUseActions')> => loadWithVscode<typeof import('../sshUseActions')>('../sshUseActions', { window: {} });

/** `SshUseDeps` over the world's typed deps: the one field `SshUseDeps` requires and `AgentUseDeps` leaves optional is given, and nothing is cast. */
function sshUseDepsOf(gate: GateWorld['deps']): SshUseDeps {
  return { ...gate, agentSocket: gate.agentSocket ?? ((): string | undefined => undefined) };
}

/** What the stub of G17 says it also uses (the third amendment, A1). */
const USED: UsedEntry = { accountId: 'a1', entityId: 'e2', entityName: 'other' };

/**
 * An action of the real shape that records what the broker handed it: the target `validate` and `summarize` got, `ctx.summary` and `ctx.uses`
 * in `run`, and how often `uses` was asked. `declaresUses` gives it the optional method.
 */
function recordingAction(declaresUses = false) {
  const seen = { validated: [] as unknown[], summarized: [] as unknown[], ranWith: [] as (string | undefined)[], ranUses: [] as unknown[], usesAsked: [] as unknown[], texts: [] as string[] };
  const action = {
    ...(declaresUses ? { uses: (target: unknown): UsedEntry => (seen.usesAsked.push(target), USED) } : {}),
    kind: 'ssh',
    action: 'exec',
    mutatesSecrets: false,
    verb: 'run a command on',
    describeOutcome: (): string => 'exit 0',
    validate: (_body: unknown, target: unknown): unknown => {
      seen.validated.push(target);
      return { ok: true };
    },
    summarize: (body: { command?: string }, target: { entityName?: string }): string => {
      const text = `the line "${String(body.command)}" for ${String(target?.entityName)}`;
      seen.texts.push(text);
      seen.summarized.push(target);
      return text;
    },
    run: async (ctx: { summary?: string; uses?: unknown }): Promise<unknown> => {
      seen.ranWith.push(ctx.summary);
      seen.ranUses.push(ctx.uses);
      return { status: 200, body: { exitCode: 0, stdout: 'ok\n', stderr: '' } };
    },
  };
  return { action, seen };
}

test('the_broker_hands_run_the_summary_it_showed', async () => {
  // A dialog (token door, Allow) and a quiet call (MCP door, already answered): both hand `run` the very text `summarize` answered,
  // and both hand `validate` and `summarize` the grant as their target (spec §5, G17).
  const asked = recordingAction();
  const w = world({ realActions: { exec: asked.action }, answers: ['Allow'] });
  try {
    const { port, secret } = await share(w);
    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(w.dialogs.length, 1, 'the dialog was shown');
    assert.ok(w.dialogs[0].includes(asked.seen.texts[0]), `the dialog shows the summary: ${w.dialogs[0]}`);
    assert.deepEqual(asked.seen.ranWith, [asked.seen.texts[0]], 'run got the summary the dialog showed');
    assert.deepEqual(asked.seen.ranUses, [undefined], 'an action that declares no `uses` is handed none');
    assert.equal((asked.seen.summarized[0] as { entityName?: string }).entityName, 'prod', 'summarize got the grant');
    assert.equal((asked.seen.validated[0] as { entityId?: string }).entityId, 'e1', 'validate got the grant');
  } finally {
    w.server.dispose();
  }

  const quiet = recordingAction();
  const q = world({ realActions: { exec: quiet.action }, mcpUse: 'usable', mcpPreConsented: true });
  try {
    const { port } = await share(q);
    const answer = await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(q.dialogs.length, 0, 'no dialog was shown');
    assert.deepEqual(quiet.seen.ranWith, [quiet.seen.texts[0]], 'a quiet call hands run its summary too');
    assert.notEqual(quiet.seen.ranWith[0], undefined);
  } finally {
    q.server.dispose();
  }
});

test('the_broker_hands_run_the_used_entry_the_action_named_once_per_call_on_both_doors', async () => {
  // Third amendment, A1 and A4 (G17 extended): `uses` is asked ONCE per call, in the step of `summarize`, and `run` is handed the answer as `ctx.uses`.
  const asked = recordingAction(true);
  const w = world({ realActions: { exec: asked.action }, answers: ['Allow'] });
  try {
    const { port, secret } = await share(w);
    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'uptime' } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(asked.seen.ranUses, [USED], 'the token door hands run what `uses` answered');
    assert.equal(asked.seen.usesAsked.length, 1, '`uses` was asked once');
    assert.equal((asked.seen.usesAsked[0] as { entityId?: string }).entityId, 'e1', 'with the grant as its target');
  } finally {
    w.server.dispose();
  }

  const quiet = recordingAction(true);
  const q = world({ realActions: { exec: quiet.action }, mcpUse: 'usable', mcpPreConsented: true });
  try {
    const { port } = await share(q);
    const answer = await call(port, '/v1/mcp/use/exec', { body: { entry: 'e1', command: 'uptime' } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(quiet.seen.ranUses, [USED], 'the MCP door hands it too');
    assert.equal(quiet.seen.usesAsked.length, 1);
  } finally {
    q.server.dispose();
  }
});

test('the_bridge_allow_list_says_run_is_decided_and_the_other_refused_rows_do_not_name_run', () => {
  // G13, the table half (spec §8): `run` gets a branch of its own in `useRoute`, so its three rows say E3 decided, and the default-deny
  // line of `terminal`, `up` and `down` no longer talks about `run`. The first wall still stands on every prefix.
  const refused = BRIDGE_ROUTES.filter((route) => !route.decision.served);
  const rows = (word: string) => refused.filter((route) => route.path.endsWith(`/${word}`) && /^\/v1\/(use|alias|mcp\/use)\//.test(route.path));
  assert.equal(rows('run').length, 3, 'run is named on all three prefixes');
  for (const route of rows('run')) {
    assert.ok(route.decision.why.includes('E3 decided'), `${route.path}: ${route.decision.why}`);
    assert.deepEqual(bridgeRouteRefusal('POST', route.path), { code: 'not_supported', message: BRIDGE_NOT_SERVED });
  }
  for (const word of ['terminal', 'up', 'down']) {
    assert.equal(rows(word).length, 3, `${word} is named on all three prefixes`);
    for (const route of rows(word)) {
      assert.ok(!/\brun\b/.test(route.decision.why), `${route.path} must not talk about run: ${route.decision.why}`);
    }
  }
});

// ---- G14: the mask table of a call on a linked entry ----------------------------------------------------------------------------

const SSH_PASSWORD = 'correct-horse-battery-staple';
const OWN_PASSWORD = 'own-password-of-the-terminal';

function terminalNode(link: string | undefined): TreeNode {
  const details = { id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: link } as EntityMetadata;
  return { id: 'e1', name: 'deploy', type: 'entity', details, parentId: null };
}

/** A `LinkedSecretSource` over the nodes given; `reads` records the entity ids whose password was read. */
function linkedSource(nodes: readonly TreeNode[], passwords: Readonly<Record<string, string>>): LinkedSecretSource & { reads: string[] } {
  const reads: string[] = [];
  const nothing = (): Promise<StoredSecret | undefined> => Promise.resolve(stored(undefined));
  return {
    reads,
    getNode: (_account, id) => nodes.find((node) => node.id === id),
    getPassword: (_account, id) => {
      reads.push(id);
      return Promise.resolve(stored(passwords[id]));
    },
    getPrivateKey: nothing,
    getVpnConfig: nothing,
    getDbConnection: nothing,
    getNotes: nothing,
    getSecondRaw: nothing,
  };
}

test('the_mask_table_of_a_linked_entry_holds_the_ssh_entrys_password', async () => {
  const linked = linkedSource([terminalNode('s1'), sshNode('s1')], { s1: SSH_PASSWORD });
  const table = await maskEntriesWithLink(linked, 'acct-1', 'e1');
  assert.deepEqual(table.filter((entry) => entry.value === SSH_PASSWORD), [{ value: SSH_PASSWORD, label: 'PASSWORD' }], 'the SSH entry password is in the table');

  const unlinked = linkedSource([terminalNode(undefined), sshNode('s1')], { e1: OWN_PASSWORD, s1: SSH_PASSWORD });
  assert.deepEqual(await maskEntriesWithLink(unlinked, 'acct-1', 'e1'), [{ value: OWN_PASSWORD, label: 'PASSWORD' }], 'an unlinked entry gives its own table only');
  assert.deepEqual(unlinked.reads, ['e1'], 'and the SSH entry was never read');

  const missing = linkedSource([terminalNode('s1')], { e1: OWN_PASSWORD });
  assert.deepEqual(await maskEntriesWithLink(missing, 'acct-1', 'e1'), [{ value: OWN_PASSWORD, label: 'PASSWORD' }], 'a missing SSH entry adds nothing and throws nothing');

  const notSsh = linkedSource([terminalNode('s1'), sshNode('s1', { isSshEnabled: false, dbType: 'postgres' })], { e1: OWN_PASSWORD, s1: SSH_PASSWORD });
  assert.deepEqual(await maskEntriesWithLink(notSsh, 'acct-1', 'e1'), [{ value: OWN_PASSWORD, label: 'PASSWORD' }], 'an entry sshLinkOf refuses adds nothing');

  const gone = linkedSource([sshNode('s1')], { s1: SSH_PASSWORD });
  await assert.rejects(maskEntriesWithLink(gone, 'acct-1', 'e1'), MaskSourceUnavailable, 'a missing Terminal entry still throws, as before');
});

// ---- the gate ---------------------------------------------------------------------------------------------------------------------

const LOCAL_SUMMARY = 'the stored command, as its Run button would type it';

type Outcome = { status: number; body: unknown };
/** The error a result carries; a result with none (the run went through) reads as `status <n>`, so a test that expected a refusal fails on its assertion. */
const errorOf = (result: Outcome): { code: string; message: string } => (result.body as { error?: { code: string; message: string } }).error ?? { code: `status ${result.status}`, message: JSON.stringify(result.body) };

/** Everything the one sentence must not carry: the SSH entry's name, host, folder, the Trash, the PIN, the other account. */
const NEVER_SAID = ['prod box', 'prod.example', 'Trash', 'PIN', 'acct-2'];

const closedSsh = (extra: Partial<EntityMetadata> = {}): TreeNode => sshNode('s1', { mcp: { view: true }, ...extra });
const unmarkedSsh = (): TreeNode => sshNode('s1');

function runOf(w: GateWorld): (over?: Partial<UseActionContext>) => Promise<UseActionResult> {
  const action = terminalRunAction(w.deps);
  // What the broker hands `run`: the shown summary and the used entry, read from the real action in one step (spec §12, A4).
  return (over = {}) => action.run(asBroker(action, { ...w.ctx, ...over }), {});
}

test('a_usable_ssh_entry_lets_a_trusted_linked_run_through_the_gate', async () => {
  const w = gateWorld();
  w.trust(detailsOf(w, 's1'));

  const result = await runOf(w)();

  assert.deepEqual(result, { status: 200, body: OK_BODY });
  assert.equal(w.overSsh.calls.length, 1);
  assert.equal(w.overSsh.calls[0].call.ssh, detailsOf(w, 's1'), 'the SSH entry is the object the storage returned');
  assert.deepEqual(w.notes.filter((note) => note.startsWith('creds_run —')), [], 'the journal says nothing of a gate that passed');
});

test('a_terminal_grant_never_opens_an_ssh_entry_that_is_closed_to_agents', async () => {
  for (const ssh of [closedSsh(), unmarkedSsh()]) {
    const w = gateWorld({ acct1: [ssh] });
    w.trust(detailsOf(w, 's1'));

    const error = errorOf(await runOf(w)());

    assert.equal(error.code, 'denied');
    assert.equal(error.message, linkedRunRefused('deploy'));
    assert.equal(w.overSsh.calls.length, 0);
    assert.equal(w.slots.taken, 0);
    assert.equal(w.trustReads.count, 0, 'the trust store was never asked');
    assert.ok(w.notes.some((note) => note.startsWith('creds_run — "deploy": ') && note.includes('Usable by agents')), w.notes.join(' | '));
  }
});

test('a_pin_protected_ssh_entry_is_refused_with_the_same_sentence_as_a_closed_one', async () => {
  const closed = gateWorld({ acct1: [closedSsh()] });
  const hidden = gateWorld({ acct1: [usableSsh('s1', { pinProtected: true })] });
  hidden.trust(detailsOf(hidden, 's1'));

  const first = errorOf(await runOf(closed)());
  const second = errorOf(await runOf(hidden)());

  assert.equal(second.code, 'denied');
  assert.equal(second.message, linkedRunRefused('deploy'));
  assert.equal(second.message, first.message, 'byte-equal to the closed one: the agent cannot tell PIN from closed');
  assert.ok(hidden.notes.some((note) => note.includes('hidden from agents (PIN)')), hidden.notes.join(' | '));
  assert.equal(hidden.overSsh.calls.length, 0);
});

test('an_ssh_entry_in_another_account_is_refused_with_the_same_sentence_and_is_never_read_there', async () => {
  const w = gateWorld({ acct1: [], acct2: [usableSsh('s1')] });

  const error = errorOf(await runOf(w)());

  assert.equal(error.code, 'denied');
  assert.equal(error.message, linkedRunRefused('deploy'));
  assert.deepEqual(w.storage.calls.filter(([account]) => account === ACCOUNT_2), [], 'acct-2 was never read');
  assert.equal(w.overSsh.calls.length, 0);

  // The second wall (`accountOnly`): the same id is CLOSED in the Terminal entry's account and usable in the other, which is listed first. A search
  // over every account would find the usable one and let the run through; the lookup bound to the Terminal entry's account never reads it.
  const shadowed = gateWorld({ acct1: [sshNode('s1', { mcp: { view: true } })], acct2: [usableSsh('s1')] });
  shadowed.trust(detailsOf(shadowed, 's1'));
  assert.equal(errorOf(await runOf(shadowed)()).message, linkedRunRefused('deploy'));
  assert.equal(shadowed.overSsh.calls.length, 0);
  assert.deepEqual(shadowed.storage.calls.filter(([account]) => account === ACCOUNT_2), [], 'acct-2 was never read');
});

/** The worlds of G5 and G15: each refuses at `sshLinkOf` (steps 4 of the gate), each for its own reason. */
function linkRefusedWorlds(): { name: string; world: GateWorld }[] {
  return [
    { name: 'trashed', world: gateWorld({ acct1: [trashFolder(), { ...usableSsh('s1'), parentId: 'trash' }] }) },
    { name: 'missing', world: gateWorld({ acct1: [] }) },
    { name: 'not an SSH entry', world: gateWorld({ acct1: [usableSsh('s1', { isSshEnabled: false, dbType: 'postgres' })] }) },
    { name: 'unsafe host', world: gateWorld({ acct1: [usableSsh('s1', { host: '-oProxyCommand=x' })] }) },
  ];
}

/** What `sshLinkOf` says of the world's link: the real reason, read from the function. */
function linkReason(w: GateWorld): string {
  const link = sshLinkOf(detailsOf(w, 'e1'), (id) => w.storage.getNode(ACCOUNT_1, id));
  assert.equal(link.kind, 'refused', 'the world is meant to be refused by the link');
  return (link as { reason: string }).reason;
}

test('trashed_missing_not_ssh_and_unsafe_target_all_give_the_same_sentence', async () => {
  const notes = new Set<string>();
  for (const { name, world: w } of linkRefusedWorlds()) {
    const error = errorOf(await runOf(w)());

    assert.equal(error.message, linkedRunRefused('deploy'), name);
    assert.equal(error.code, 'denied', name);
    assert.deepEqual(w.notes, [journalLine('deploy', linkReason(w))], `${name}: the note is the real reason`);
    notes.add(w.notes[0]);
  }
  assert.equal(notes.size, 4, 'the four reasons are four different notes');
});

test('the_gate_runs_in_validate_so_nobody_is_asked_to_allow_a_refused_run', () => {
  const closed = gateWorld({ acct1: [closedSsh()] });
  assert.deepEqual(terminalRunAction(closed.deps).validate({}, closed.ctx), { ok: false, code: 'denied', message: linkedRunRefused('deploy') });
  assert.equal(closed.notes.length, 1, 'the refusal wrote one note, from validate alone');

  const usable = gateWorld();
  assert.deepEqual(terminalRunAction(usable.deps).validate({}, usable.ctx), { ok: true });

  const unlinked = gateWorld({ terminal: { sshEntityId: undefined }, acct1: [] });
  assert.deepEqual(terminalRunAction(unlinked.deps).validate({}, unlinked.ctx), { ok: true });
});

test('the_summary_names_the_ssh_entry_its_target_and_the_trust_line', () => {
  const summaryOf = (ssh: TreeNode, extra: TreeNode[] = []): string => {
    const w = gateWorld({ acct1: [ssh, ...extra] });
    return terminalRunAction(w.deps).summarize({}, w.ctx);
  };
  const plain = usableSsh('s1');
  const trust = trustLineOf(plain.details as EntityMetadata);
  assert.equal(summaryOf(plain), `the stored command, on the SSH connection "prod box" (deploy@prod.example), as: ${trust}`);

  const ported = usableSsh('s1', { port: 2222 });
  assert.equal(summaryOf(ported), `the stored command, on the SSH connection "prod box" (deploy@prod.example:2222), as: ${trustLineOf(ported.details as EntityMetadata)}`);

  const jump = usableSsh('j1', { name: 'jump', host: 'jump.example', user: 'hop' });
  const jumped = summaryOf(usableSsh('s1', { jumpHostEntityId: 'j1' }), [jump]);
  assert.match(jumped, / -J hop@jump\.example /, jumped);

  const forwarding = summaryOf(usableSsh('s1', { agentForward: true }));
  assert.match(forwarding, / -A /, forwarding);

  for (const text of [plain, ported, usableSsh('s1', { agentForward: true })].map((node) => summaryOf(node))) {
    assert.ok(!text.includes('/'), `no path in the summary: ${text}`);
    assert.ok(!text.includes('known_hosts') && !text.includes('CREDS_ASKPASS'), text);
  }
});

test('the_summary_of_an_unlinked_entry_and_of_a_refused_gate_is_todays_words', () => {
  const unlinked = gateWorld({ terminal: { sshEntityId: undefined }, acct1: [] });
  assert.equal(terminalRunAction(unlinked.deps).summarize({}, unlinked.ctx), LOCAL_SUMMARY);
  const closed = gateWorld({ acct1: [closedSsh()] });
  assert.equal(terminalRunAction(closed.deps).summarize({}, closed.ctx), LOCAL_SUMMARY, 'a refused gate was answered in validate; the local words are never shown');
});

test('a_switch_turned_off_while_the_dialog_was_open_is_refused_at_run', async () => {
  const w = gateWorld();
  w.trust(detailsOf(w, 's1'));
  const action = terminalRunAction(w.deps);
  assert.deepEqual(action.validate({}, w.ctx), { ok: true });
  const shown = asBroker(action, w.ctx);

  detailsOf(w, 's1').mcp = { view: true };
  const error = errorOf(await action.run(shown, {}));

  assert.equal(error.code, 'denied');
  assert.equal(error.message, linkedRunRefused('deploy'));
  assert.equal(w.overSsh.calls.length, 0);
});

test('a_link_or_target_changed_while_the_dialog_was_open_is_refused_at_run', async () => {
  const changes: [string, (w: GateWorld) => void][] = [
    ['the host changed (the new line is trusted too, so trust alone would pass)', (w) => {
      detailsOf(w, 's1').host = 'evil.example';
      w.trust(detailsOf(w, 's1'));
    }],
    ['the link moved to another usable SSH entry', (w) => {
      detailsOf(w, 'e1').sshEntityId = 's2';
      w.trust(detailsOf(w, 's2'));
    }],
    ['the link was removed', (w) => {
      detailsOf(w, 'e1').sshEntityId = undefined;
      w.trusted.push(commandFingerprint('e1', 'echo linked'));
    }],
  ];
  for (const [what, change] of changes) {
    const w = gateWorld({ acct1: [usableSsh('s1'), usableSsh('s2', { name: 'staging box' })] });
    w.trust(detailsOf(w, 's1'));
    const action = terminalRunAction(w.deps);
    const shown = asBroker(action, w.ctx);

    change(w);
    const error = errorOf(await action.run(shown, {}));

    assert.equal(error.code, 'denied', what);
    assert.equal(error.message, changedWhileAsking('deploy'), what);
    assert.equal(w.overSsh.calls.length, 0, what);
    assert.equal(w.slots.taken, 0, what);
  }
  const same = gateWorld();
  same.trust(detailsOf(same, 's1'));
  const action = terminalRunAction(same.deps);
  const shown = asBroker(action, same.ctx);
  assert.deepEqual(await action.run(shown, {}), { status: 200, body: OK_BODY }, 'the unchanged world passes the compare');
  assert.equal(same.overSsh.calls.length, 1);
});

test('a_linked_run_with_no_shown_summary_is_refused_and_a_local_one_is_not_compared', async () => {
  // Rewritten by the third amendment, A4 (it was a_run_with_no_shown_summary_does_not_compare): a linked run now needs BOTH the shown summary and the
  // used entry the broker holds, and a caller that omits either one is refused, not skipped (spec §2.3 step 3).
  const w = gateWorld();
  w.trust(detailsOf(w, 's1'));
  const action = terminalRunAction(w.deps);

  const bare = errorOf(await action.run(w.ctx, {}));
  assert.equal(bare.code, 'denied');
  assert.equal(bare.message, changedWhileAsking('deploy'), 'no summary and no used entry');
  const noSummary = errorOf(await action.run({ ...asBroker(action, w.ctx), summary: undefined }, {}));
  assert.equal(noSummary.message, changedWhileAsking('deploy'), 'no summary');
  assert.equal(w.overSsh.calls.length, 0);
  assert.equal(w.slots.taken, 0);

  assert.deepEqual(await action.run(asBroker(action, w.ctx), {}), { status: 200, body: OK_BODY }, 'the positive control: what the broker hands it runs');
  assert.equal(w.overSsh.calls.length, 1);

  // An UNLINKED world is not compared: its run starts as today (a busy window answers too_many_requests, so nothing is spawned here).
  const local = gateWorld({ terminal: { sshEntityId: undefined }, acct1: [], busy: true });
  local.trusted.push(commandFingerprint('e1', 'echo linked'));
  assert.equal(errorOf(await terminalRunAction(local.deps).run(local.ctx, {})).code, 'too_many_requests', 'the local run started');
});

test('asks_after_consent_is_true_only_for_a_linked_entry_that_forwards_the_agent_while_the_socket_is_up', () => {
  const asked = (w: GateWorld): boolean => asksAfter(terminalRunAction(w.deps), w.ctx);
  assert.equal(typeof terminalRunAction(gateWorld().deps).asksAfterConsent, 'function');
  assert.equal(asked(gateWorld({ terminal: { sshEntityId: undefined }, acct1: [], agentSocket: '/tmp/a.sock' })), false, 'unlinked');
  assert.equal(asked(gateWorld({ agentSocket: '/tmp/a.sock' })), false, 'linked, no -A');
  assert.equal(asked(gateWorld({ acct1: [usableSsh('s1', { agentForward: true })], withSocketFn: true, agentSocket: undefined })), false, '-A, the socket is down');
  assert.equal(asked(gateWorld({ acct1: [usableSsh('s1', { agentForward: true })], agentSocket: '/tmp/a.sock' })), true, '-A and the socket is up');
  assert.equal(asked(gateWorld({ acct1: [usableSsh('s1', { agentForward: true })] })), false, 'deps with no agentSocket');
});

const BRIDGE: BridgeContext = { bridgeId: 'bridge-1', accountId: ACCOUNT_1, serverEntityId: 'srv', serverName: 'a server', target: 'me@host:22', remoteOs: 'linux' };

test('a_bridged_call_on_a_linked_entry_is_refused_fail_closed_with_the_allow_lists_words', async () => {
  const answers: string[] = [];
  for (const options of [{}, { acct1: [] as TreeNode[] }, { acct1: [closedSsh()] }]) {
    const w = gateWorld(options);
    w.trust(sshNode('s1').details as EntityMetadata);
    w.storage.calls.length = 0;

    // A bridged call never reaches the door's `summarize` or `uses` (`refusedOnBridge` answers before the body is read), so `run` gets the bare context.
    const error = errorOf(await terminalRunAction(w.deps).run({ ...w.ctx, bridge: BRIDGE }, {}));

    assert.equal(error.code, 'not_supported');
    assert.equal(error.message, BRIDGE_NOT_SERVED);
    assert.equal(w.overSsh.calls.length, 0);
    assert.deepEqual(w.storage.calls.filter(([, id]) => id === 's1'), [], 'the SSH entry was never read: a bridge cannot probe it');
    answers.push(JSON.stringify(error));
  }
  assert.equal(new Set(answers).size, 1, 'usable, missing and closed give the same bytes');
  for (const path of ['/v1/use/run', '/v1/alias/run', '/v1/mcp/use/run']) {
    assert.notEqual(bridgeRouteRefusal('POST', path), undefined, `the first wall stands on ${path}`);
  }
});

/** Every sentence the agent would read from this world: `run`'s answer and `validate`'s. */
async function agentReads(w: GateWorld): Promise<string[]> {
  const result = await runOf(w)();
  const validated = terminalRunAction(w.deps).validate({}, w.ctx);
  return [errorOf(result).message, ...(validated.ok ? [] : [validated.message])];
}

test('the_agent_reads_no_name_host_or_reason_of_the_ssh_entry', async () => {
  const worlds = [
    gateWorld({ acct1: [closedSsh()] }),
    gateWorld({ acct1: [unmarkedSsh()] }),
    gateWorld({ acct1: [usableSsh('s1', { pinProtected: true })] }),
    gateWorld({ acct1: [], acct2: [usableSsh('s1')] }),
    ...linkRefusedWorlds().map((entry) => entry.world),
  ];
  for (const w of worlds) {
    const leaked = (await agentReads(w)).flatMap((text) => NEVER_SAID.filter((word) => text.includes(word)));
    assert.deepEqual(leaked, [], 'the agent read something of the SSH entry');
    assert.ok(w.notes.length >= 1 && w.notes.every((note) => note.startsWith('creds_run — "deploy": ')), w.notes.join(' | '));
  }
});

test('an_agents_vpn_start_with_a_linked_launcher_stays_refused', async () => {
  // A guard (green before and after, spec §10): E3.S2 opens `creds_run` only. A VPN start from an agent has no road, so a linked launcher
  // still gets E1's shared sentence and nothing is typed anywhere.
  const { start, vpn } = ownerChain();
  const nodes = {
    start: { ...start, name: 'start-openvpn', command: 'openvpn --config {config} --remote {name}', dependsOn: [], sshEntityId: 's1' },
    vpn: { ...vpn, dependsOn: [], runDependencies: false },
  };
  const vw = vpnWorldOf({});
  const { started, dir } = await startVpn(scope, vw, nodes);
  try {
    assert.equal(started, false);
    assert.deepEqual(vw.terminals, []);
    const sentence = sshLinkRefusal({ id: 'x', name: 'start-openvpn', sshEntityId: 's1' });
    assert.ok(vw.warnings.some((text) => text.includes(sentence as string)), vw.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the_one_sentence_has_one_name_and_one_parameter', () => {
  assert.equal(linkedRunRefused.length, 1);
  assert.equal(changedWhileAsking.length, 1);
  assert.deepEqual(linkedRunRefused('Q').match(/"[^"]*"/g), ['"Q"', '"Q"']);
  assert.ok(!linkedRunRefused('Q').includes('prod box'));
});

test('exec_and_run_sit_on_the_same_rung', async () => {
  assert.equal(switchForAction('exec'), switchForAction('run'));
  assert.equal(switchForAction('exec'), 'use');
  const usableWithoutEdit = gateWorld({ acct1: [usableSsh('s1', { mcp: { view: true, use: true, edit: false } })] });
  usableWithoutEdit.trust(detailsOf(usableWithoutEdit, 's1'));
  assert.equal((await runOf(usableWithoutEdit)()).status, 200, 'use without edit is usable: the rung read is not higher than use');
  const viewOnly = gateWorld({ acct1: [usableSsh('s1', { mcp: { view: true } })] });
  viewOnly.trust(detailsOf(viewOnly, 's1'));
  assert.equal(errorOf(await runOf(viewOnly)()).message, linkedRunRefused('deploy'), 'view without use is not usable: the rung read is not lower than use');
  const found = linkedCall(usableWithoutEdit.deps, usableWithoutEdit.ctx, undefined);
  assert.equal(found.kind, 'linked');
  assert.equal(found.kind === 'linked' ? found.found.accountId : '', ACCOUNT_1, "the answer is the Terminal entry's account, by construction");
});

// ---- before the gate passes ---------------------------------------------------------------------------------------------------------

interface Case {
  readonly name: string;
  readonly options: GateOptions;
  /** A fragment of the real reason the journal holds. */
  readonly reason: string;
}

/** G20: each world has the SSH entry CLOSED unless the case is about the SSH entry itself. */
const PRE_GATE: readonly Case[] = [
  { name: '(a) S missing', options: { acct1: [] }, reason: 'no longer in this vault' },
  { name: '(b) S only in acct-2', options: { acct1: [], acct2: [closedSsh()] }, reason: 'no longer in this vault' },
  { name: '(c) S with an unsafe host', options: { acct1: [usableSsh('s1', { host: '-oProxyCommand=x' })] }, reason: 'not a valid host' },
  { name: '(d) a line break', options: { acct1: [closedSsh()], terminal: { command: 'echo a\necho b' } }, reason: 'Usable by agents' },
  { name: '(e) written for Windows', options: { acct1: [closedSsh()], terminal: { terminalOs: 'windows' } }, reason: 'Usable by agents' },
  { name: '(f) a {name} the composer refuses', options: { acct1: [closedSsh()], terminal: { name: 'a b', command: 'echo {name}' } }, reason: 'Usable by agents' },
  { name: '(g) no command', options: { acct1: [closedSsh()], terminal: { command: undefined } }, reason: 'Usable by agents' },
];

test('before_the_gate_passes_every_outcome_is_the_one_sentence', async () => {
  for (const { name, options, reason } of PRE_GATE) {
    const w = gateWorld(options);
    const one = linkedRunRefused(w.ctx.entityName);
    const action = terminalRunAction(w.deps);

    assert.deepEqual(action.validate({}, w.ctx), { ok: false, code: 'denied', message: one }, `${name}: validate`);
    const error = errorOf(await action.run(w.ctx, {}));

    assert.equal(error.code, 'denied', name);
    assert.equal(error.message, one, `${name}: run`);
    for (const word of ['Windows', 'line break', 'will not run', 'has no command', 'prod box', 'prod.example']) {
      assert.ok(!error.message.includes(word), `${name}: the message holds "${word}"`);
    }
    assert.equal(w.overSsh.calls.length, 0, name);
    assert.equal(w.slots.taken, 0, name);
    assert.equal(w.trustReads.count, 0, `${name}: the trust store was never asked`);
    assert.ok(w.notes.length === 2 && w.notes.every((note) => note.includes(reason)), `${name}: each note holds the real reason (${reason}): ${w.notes.join(' | ')}`);
  }
});

test('after_the_gate_passes_plan_refusals_name_only_the_terminal_entry', async () => {
  const usable = (terminal: Partial<EntityMetadata>): GateOptions => ({ terminal });
  const plans: [string, Partial<EntityMetadata>][] = [
    ['(d) a line break', { command: 'echo a\necho b' }],
    ['(e) written for Windows', { terminalOs: 'windows' }],
    ['(f) a {name} the composer refuses', { name: 'a b', command: 'echo {name}' }],
  ];
  for (const [name, terminal] of plans) {
    const w = gateWorld(usable(terminal));
    w.trust(detailsOf(w, 's1'));
    const entry = detailsOf(w, 'e1');
    const plan = planLaunch(entry, sshLinkOf(entry, (id) => w.storage.getNode(ACCOUNT_1, id)), { stayOpen: false });
    assert.equal(plan.kind, 'refused', `${name}: the fixture is refused by the plan`);

    const error = errorOf(await runOf(w)());

    assert.equal(error.code, 'not_supported', name);
    assert.equal(error.message, refusalSaid(entry, (plan as { reason: string }).reason), name);
    assert.ok(error.message.includes(`"${entry.name}"`), name);
    assert.ok(!error.message.includes('prod box') && !error.message.includes('prod.example'), name);
    assert.equal(w.overSsh.calls.length, 0, name);
    assert.equal(w.slots.taken, 0, name);
  }
  const empty = gateWorld({ terminal: { command: undefined } });
  empty.trust(detailsOf(empty, 's1'));
  const error = errorOf(await runOf(empty)());
  assert.equal(error.code, 'no_credential');
  assert.equal(error.message, '"deploy" has no command.');
  assert.equal(empty.overSsh.calls.length, 0);
  assert.equal(empty.slots.taken, 0);
});

/** G22: the six states of S that the gate refuses, each built with and without `-A`. */
function refusedStates(forward: boolean): { name: string; options: GateOptions }[] {
  const ssh = (extra: Partial<EntityMetadata> = {}): Partial<EntityMetadata> => ({ agentForward: forward, ...extra });
  const socket = '/tmp/a.sock';
  return [
    { name: 'closed', options: { acct1: [sshNode('s1', ssh({ mcp: { view: true } }))], agentSocket: socket } },
    { name: 'no mcp', options: { acct1: [sshNode('s1', ssh())], agentSocket: socket } },
    { name: 'PIN-hidden', options: { acct1: [usableSsh('s1', ssh({ pinProtected: true }))], agentSocket: socket } },
    { name: 'in the Trash', options: { acct1: [trashFolder(), { ...usableSsh('s1', ssh()), parentId: 'trash' }], agentSocket: socket } },
    { name: 'only in acct-2', options: { acct1: [], acct2: [usableSsh('s1', ssh())], agentSocket: socket } },
    { name: 'missing', options: { acct1: [], agentSocket: socket } },
  ];
}

test('before_the_gate_passes_the_follow_up_flag_says_nothing_about_the_ssh_entry', async () => {
  const messages = new Set<string>();
  for (const forward of [true, false]) {
    for (const { name, options } of refusedStates(forward)) {
      const w = gateWorld(options);
      const action = terminalRunAction(w.deps);
      const label = `${name}, -A ${String(forward)}`;

      const flag = asksAfter(action, w.ctx);
      assert.equal(flag, false, `${label}: the flag is the bit of an unlinked entry`);
      assert.deepEqual(w.notes, [], `${label}: the flag writes no note`);
      const ceilings = new TokenlessCeilings();
      assert.equal(ceilings.admit(true, 0).refusal, undefined, 'another call holds the dialog place');
      assert.equal(ceilings.admit(false, 1, LOCAL_DOOR, flag).refusal, undefined, `${label}: a quiet call is admitted, never told busy`);

      const validated = action.validate({}, w.ctx);
      assert.deepEqual(validated, { ok: false, code: 'denied', message: linkedRunRefused('deploy') }, label);
      messages.add(JSON.stringify(validated));
    }
  }
  assert.equal(messages.size, 1, 'the twelve answers are byte-equal');

  // The positive control: a USABLE SSH entry that forwards the agent does raise the flag, and the same admission says busy.
  const control = gateWorld({ acct1: [usableSsh('s1', { agentForward: true })], agentSocket: '/tmp/a.sock' });
  const flag = asksAfter(terminalRunAction(control.deps), control.ctx);
  assert.equal(flag, true, 'the control: the flag can be true');
  const ceilings = new TokenlessCeilings();
  ceilings.admit(true, 0);
  assert.equal(ceilings.admit(false, 1, LOCAL_DOOR, flag).refusal?.message, BUSY_PLACE, 'and the quiet call is told busy');
});

// ---- the third amendment (A1, A4): the used entry, and the compare's second part ------------------------------------------------------

test('uses_names_the_ssh_entry_only_after_the_gate', async () => {
  const hasUses = (w: GateWorld): boolean => typeof terminalRunAction(w.deps).uses === 'function';
  assert.ok(hasUses(gateWorld()), 'terminalRunAction declares `uses`');
  const usesOf = (w: GateWorld): UsedEntry | undefined => terminalRunAction(w.deps).uses?.(w.ctx);
  const S1: UsedEntry = { accountId: 'acct-1', entityId: 's1', entityName: 'prod box' };

  assert.deepEqual(usesOf(gateWorld()), S1);
  assert.deepEqual(usesOf(gateWorld({ acct1: [usableSsh('s1', { burnPolicy: 'oneUse' })] })), S1, 'a one-use SSH entry passes the gate too (decision B): it is spent, not refused');
  assert.equal(usesOf(gateWorld({ terminal: { sshEntityId: undefined }, acct1: [] })), undefined, 'an unlinked entry uses no second entry');

  for (const forward of [true, false]) {
    for (const { name, options } of refusedStates(forward)) {
      const w = gateWorld(options);
      assert.equal(usesOf(w), undefined, `${name}, -A ${String(forward)}: before the gate passes it names nothing`);
      assert.deepEqual(w.notes, [], `${name}: \`uses\` writes no note`);
    }
  }

  const viaUses = gateWorld({ acct1: [closedSsh()] });
  usesOf(viaUses);
  const viaValidate = gateWorld({ acct1: [closedSsh()] });
  terminalRunAction(viaValidate.deps).validate({}, viaValidate.ctx);
  assert.deepEqual(viaUses.storage.calls, viaValidate.storage.calls, 'no read of S beyond the gate\'s two');

  // The gate's own answer, not the link alone: the stub that read the link alone would answer S for the three states below.
  for (const options of [{ acct1: [closedSsh()] }, { acct1: [usableSsh('s1', { pinProtected: true })] }, { acct1: [] as TreeNode[], acct2: [usableSsh('s1')] }]) {
    assert.equal(usesOf(gateWorld(options)), undefined);
  }

  const exec = (await loadSshActions()).sshExecAction(sshUseDepsOf(gateWorld().deps));
  assert.equal(typeof exec.uses, 'undefined', 'no other action declares it');
});

test('a_linked_run_over_another_ssh_entry_than_the_one_the_broker_holds_is_refused', async () => {
  const world = (): GateWorld => {
    const w = gateWorld({ acct1: [usableSsh('s1'), usableSsh('s2')] });
    w.trust(detailsOf(w, 's1'));
    w.trust(detailsOf(w, 's2'));
    return w;
  };
  const w = world();
  const action = terminalRunAction(w.deps);
  const shown = asBroker(action, w.ctx);
  detailsOf(w, 'e1').sshEntityId = 's2';
  assert.equal(action.summarize({}, w.ctx), shown.summary, 'the setup: the two texts ARE equal (same name, host, user, port)');

  const relinked = errorOf(await action.run(shown, {}));
  assert.equal(relinked.code, 'denied');
  assert.equal(relinked.message, changedWhileAsking('deploy'));
  assert.equal(w.overSsh.calls.length, 0, 'it did not run over s2');
  assert.equal(w.slots.taken, 0);

  const same = world();
  const sameAction = terminalRunAction(same.deps);
  const noUses = errorOf(await sameAction.run({ ...asBroker(sameAction, same.ctx), uses: undefined }, {}));
  assert.equal(noUses.message, changedWhileAsking('deploy'), 'no used entry on the unchanged world');
  assert.equal(same.overSsh.calls.length, 0);

  const unlinked = gateWorld({ terminal: { sshEntityId: undefined }, acct1: [] });
  unlinked.trusted.push(commandFingerprint('e1', 'echo linked'));
  const held = errorOf(await terminalRunAction(unlinked.deps).run({ ...unlinked.ctx, uses: { accountId: 'acct-1', entityId: 's1', entityName: 'prod box' } }, {}));
  assert.equal(held.message, changedWhileAsking('deploy'), 'the broker holds the turn of an SSH entry that this run does not use any more');
  assert.equal(unlinked.slots.taken, 0, 'nothing ran locally');
});

test('a_bridged_gate_refusal_writes_a_journal_line_that_says_what_the_bridge_was_told', async () => {
  // The spec's literal ending (*the agent was told only that the SSH connection is not open to it*) is false on a bridge, where the agent was told
  // BRIDGE_NOT_SERVED. Each of the two lines ends with what its agent really read.
  const closed = gateWorld({ acct1: [closedSsh()] });
  await runOf(closed)();
  assert.equal(closed.notes.length, 1);
  assert.ok(closed.notes[0].endsWith('(the agent was told only that the SSH connection is not open to it)'), closed.notes[0]);

  const bridged = gateWorld();
  bridged.trust(detailsOf(bridged, 's1'));
  const error = errorOf(await runOf(bridged)({ bridge: BRIDGE }));
  assert.equal(error.message, BRIDGE_NOT_SERVED, 'the agent was told the bridge\'s own sentence');
  assert.equal(bridged.notes.length, 1);
  assert.ok(bridged.notes[0].endsWith(`(the agent was told: ${BRIDGE_NOT_SERVED})`), bridged.notes[0]);
  assert.ok(!bridged.notes[0].includes('the SSH connection is not open to it'), 'and not that the SSH connection is closed to it');
});
