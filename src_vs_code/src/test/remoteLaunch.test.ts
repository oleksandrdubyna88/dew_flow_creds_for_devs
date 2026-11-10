import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { collectSshCandidates } from '../commandTargets';
import { resolveCommand } from '../commandLine';
import type { HostShell } from '../hostShell';
import {
  type LaunchEntry,
  type LaunchPlan,
  type NodeLookup,
  type PreparedForTyping,
  type SshLink,
  planLaunch,
  secretsStdin,
  sshLinkOf,
  sshLinkRefusal,
  stayOpenWrapper,
  trustLineFor,
  typedLine,
} from '../remoteLaunch';
import type { EntityMetadata, TreeNode } from '../types';

/**
 * E1.S2 of `PLAN_terminal_command_over_ssh.md` (spec `PLAN_terminal_command_over_ssh_E1_S2_spec.md`): the composer.
 * Every sentence below is compared whole, never by `includes` (spec §S2.11).
 */

const SRC = path.resolve(__dirname, '..', '..', 'src');

const entry = (over: Partial<LaunchEntry> = {}): LaunchEntry => ({ id: 't1', name: 'deploy', command: 'echo hi', ...over });

function sshNode(id: string, over: Partial<EntityMetadata> = {}, parentId: string | null = null, name = id): TreeNode {
  return { id, name, type: 'entity', parentId, details: { id, name, kind: 'ssh', isSshEnabled: true, host: 'prod.corp.com', ...over } };
}

function folder(id: string, parentId: string | null = null, isTrash = false): TreeNode {
  return { id, name: id, type: 'folder', parentId, ...(isTrash ? { isTrash: true } : {}) } as TreeNode;
}

const lookupOf = (nodes: readonly TreeNode[]): NodeLookup => (id) => nodes.find((n) => n.id === id);

/** A lookup that counts, so "never asked" is a number. */
function counting(nodes: readonly TreeNode[]): { lookup: NodeLookup; calls: () => number } {
  let calls = 0;
  const inner = lookupOf(nodes);
  return { lookup: (id) => { calls += 1; return inner(id); }, calls: () => calls };
}

const refusedOf = (link: SshLink): string => {
  assert.equal(link.kind, 'refused', JSON.stringify(link));
  return (link as { reason: string }).reason;
};

// ---- sshLinkOf (§S2.3 L1-L7) ------------------------------------------------------------------------------------

test('R1 no_link_is_none_and_an_empty_id_is_none', () => {
  for (const sshEntityId of [undefined, '']) {
    const c = counting([]);
    assert.deepEqual(sshLinkOf(entry({ sshEntityId }), c.lookup), { kind: 'none' });
    assert.equal(c.calls(), 0);
  }
});

test('R2 a_link_to_itself_is_refused_before_any_lookup', () => {
  const c = counting([sshNode('t1')]);
  assert.equal(
    refusedOf(sshLinkOf(entry({ sshEntityId: 't1' }), c.lookup)),
    `"deploy" is set to run over itself. Edit it and choose an SSH connection, or set "Runs over SSH" to "Do not use".`,
  );
  assert.equal(c.calls(), 0);
});

test('R3 a_missing_or_folder_or_detail_less_node_is_refused_as_missing', () => {
  const sentence = `"deploy" runs over an SSH connection that is no longer in this vault. Edit it and choose an SSH connection, or set "Runs over SSH" to "Do not use".`;
  const noDetails: TreeNode = { id: 's1', name: 's1', type: 'entity', parentId: null };
  for (const nodes of [[], [folder('s1')], [noDetails]]) {
    assert.equal(refusedOf(sshLinkOf(entry({ sshEntityId: 's1' }), lookupOf(nodes))), sentence);
  }
});

test('R4 a_trashed_ssh_entry_is_refused_naming_it', () => {
  const nodes = [folder('trash', null, true), folder('deep', 'trash'), sshNode('s1', {}, 'deep', 'prod box')];
  assert.equal(
    refusedOf(sshLinkOf(entry({ sshEntityId: 's1' }), lookupOf(nodes))),
    '"deploy" runs over the SSH connection "prod box", which is in the Trash. Restore it first.',
  );
});

test('R5 a_non_ssh_entry_is_refused', () => {
  const kinds: Partial<EntityMetadata>[] = [
    { kind: 'terminal', isTerminal: true, isSshEnabled: false, command: 'ls' },
    { kind: 'credential', isSshEnabled: false, host: 'c.corp.com' },
    { kind: 'vpn', isSshEnabled: false },
  ];
  for (const over of kinds) {
    assert.equal(
      refusedOf(sshLinkOf(entry({ sshEntityId: 's1' }), lookupOf([sshNode('s1', over, null, 'other')]))),
      `"deploy" runs over "other", which is not an SSH connection entry. Edit it and choose an SSH connection.`,
      JSON.stringify(over),
    );
  }
  // A stored kind wins (B13), and a legacy record with no kind is read by the flag ladder.
  const stored = sshNode('s1', { kind: 'ssh', isSshEnabled: false });
  assert.equal(sshLinkOf(entry({ sshEntityId: 's1' }), lookupOf([stored])).kind, 'linked');
  const legacy = sshNode('s1');
  delete (legacy.details as { kind?: string }).kind;
  assert.equal(sshLinkOf(entry({ sshEntityId: 's1' }), lookupOf([legacy])).kind, 'linked');
});

test('R6 an_unsafe_host_or_user_is_refused', () => {
  const sentence = `"deploy" runs over the SSH connection "s1", whose address is not a valid host and user.`;
  const bad: Partial<EntityMetadata>[] = [
    { host: '-oProxyCommand=id' },
    { host: 'a.com;id' },
    { user: 'a@b' },
    { host: undefined },
  ];
  for (const over of bad) {
    assert.equal(refusedOf(sshLinkOf(entry({ sshEntityId: 's1' }), lookupOf([sshNode('s1', over)]))), sentence, JSON.stringify(over));
  }
});

test('R7 a_good_link_carries_the_node_details_and_name', () => {
  const node = sshNode('s1', { user: 'deploy' }, null, 'prod box');
  const link = sshLinkOf(entry({ sshEntityId: 's1' }), lookupOf([node]));
  assert.equal(link.kind, 'linked');
  const linked = link as Extract<SshLink, { kind: 'linked' }>;
  assert.equal(linked.ssh, node.details);
  assert.equal(linked.sshName, 'prod box');
});

test('R8 the_candidate_predicate_and_the_link_agree', () => {
  const nodes: TreeNode[] = [
    sshNode('ok', {}, null, 'ok'),
    sshNode('flags', { kind: undefined, host: 'a.corp.com' }, null, 'flags'),
    folder('trash', null, true),
    sshNode('gone', {}, 'trash', 'gone'),
    sshNode('nohost', { host: undefined }, null, 'nohost'),
    sshNode('term', { kind: 'terminal', isTerminal: true, isSshEnabled: false }, null, 'term'),
    sshNode('cred', { kind: 'credential', isSshEnabled: false, host: 'c.corp.com' }, null, 'cred'),
    sshNode('me', {}, null, 'me'),
  ];
  const storage = { getNodes: () => nodes, getNode: (_a: string, id: string) => nodes.find((n) => n.id === id) } as never;
  const offered = new Set(collectSshCandidates(storage, 'a1', 'me').map((c) => c.id));
  assert.ok(offered.size >= 2, 'the fixture must offer something, or the loop proves nothing');
  const lookup = lookupOf(nodes);
  for (const node of nodes.filter((n) => n.type === 'entity')) {
    const kind = sshLinkOf(entry({ id: 'me', sshEntityId: node.id }), lookup).kind;
    assert.equal(kind === 'linked', offered.has(node.id), `${node.id} is ${kind}`);
  }
});

// ---- planLaunch (§S2.3 P1-P7) -----------------------------------------------------------------------------------

const LINKED: SshLink = { kind: 'linked', ssh: { id: 's1', name: 'prod', isSshEnabled: true, host: 'prod.corp.com' }, sshName: 'prod' };
const NONE: SshLink = { kind: 'none' };
const REFUSED: SshLink = { kind: 'refused', reason: 'the link says no' };
const OPEN = { stayOpen: false };

const planOf = (e: LaunchEntry, link: SshLink, stayOpen = false): LaunchPlan => planLaunch(e, link, { stayOpen });
const remotePlan = (e: LaunchEntry = entry(), stayOpen = false): Extract<LaunchPlan, { kind: 'remote' }> => {
  const plan = planOf(e, LINKED, stayOpen);
  assert.equal(plan.kind, 'remote', JSON.stringify(plan));
  return plan as Extract<LaunchPlan, { kind: 'remote' }>;
};

test('R9 an_empty_entry_is_empty_whatever_the_link', () => {
  for (const link of [NONE, LINKED, REFUSED]) {
    assert.deepEqual(planLaunch(entry({ command: '' }), link, OPEN), { kind: 'empty' });
  }
});

test('R10 the_name_refusal_wins_over_a_link_refusal', () => {
  const e = entry({ name: 'a b', command: 'echo {name}' });
  const own = resolveCommand(e);
  assert.equal(own.kind, 'refused');
  assert.deepEqual(planLaunch(e, REFUSED, OPEN), { kind: 'refused', reason: (own as { reason: string }).reason });
});

test('R11 a_refused_link_refuses_the_plan', () => {
  assert.deepEqual(planLaunch(entry(), REFUSED, OPEN), { kind: 'refused', reason: 'the link says no' });
});

test('R12 no_link_is_a_local_plan_with_the_resolved_line', () => {
  const e = entry({ name: 'alert', command: 'echo {name}' });
  const resolved = resolveCommand(e);
  assert.equal(resolved.kind, 'ready');
  assert.deepEqual(planLaunch(e, NONE, OPEN), { kind: 'local', line: (resolved as { line: string }).line });
  assert.equal((planLaunch(e, NONE, OPEN) as { line: string }).line, 'echo alert');
});

test('R13 a_windows_remote_is_refused', () => {
  const sentence = `"deploy" is written for Windows and is set to run over SSH. A Windows remote is not supported yet. Change "Runs on" to Linux or macOS, or set "Runs over SSH" to "Do not use".`;
  assert.deepEqual(planOf(entry({ terminalOs: 'windows' }), LINKED), { kind: 'refused', reason: sentence });
  for (const terminalOs of ['linux', 'macos', undefined, '']) {
    assert.equal(planOf(entry({ terminalOs }), LINKED).kind, 'remote', String(terminalOs));
  }
});

test('R14 a_line_break_is_refused', () => {
  const sentence = `"deploy" has a line break in its command, which cannot be sent over SSH as one command. Put the steps on one line, joined with ";" or "&&".`;
  for (const ch of ['\n', '\r', '\0']) {
    assert.deepEqual(planOf(entry({ command: `echo a${ch}echo b` }), LINKED), { kind: 'refused', reason: sentence }, JSON.stringify(ch));
    assert.deepEqual(planOf(entry({ commandArgs: [{ value: `x${ch}y` }] }), LINKED), { kind: 'refused', reason: sentence }, JSON.stringify(ch));
  }
});

test('R15 stay_open_wraps_and_the_others_do_not', () => {
  const open = remotePlan(entry(), true);
  assert.equal(open.remoteCommand, stayOpenWrapper('echo hi'));
  assert.equal(open.line, 'echo hi');
  assert.equal(remotePlan(entry(), false).remoteCommand, 'echo hi');
  assert.equal(open.entryName, 'deploy');
  assert.equal(open.sshName, 'prod');
  assert.equal(open.ssh, (LINKED as Extract<SshLink, { kind: 'linked' }>).ssh);
  assert.equal('trustLine' in open, false, 'the trust line is built from the prepared snapshot, not the plan (S2-D2)');
});

// ---- the wrapper, the trust line, the typed line ----------------------------------------------------------------

test('R16 the_wrapper_text_is_exact_and_holds_no_double_quote', () => {
  const tail = `; s=$?; test $s -eq 0 || printf 'creds: the command ended with exit code %s\\n' $s >&2; exec \${SHELL:-sh} -l`;
  assert.equal(stayOpenWrapper("echo it's"), `eval 'echo it'\\''s'${tail}`);
  assert.equal(stayOpenWrapper('echo hi').includes('"'), false);
  assert.equal(stayOpenWrapper('echo "x"').split('"').length - 1, 2, 'only the two of the line itself');
});

const SSH: EntityMetadata = { id: 's', name: 'srv', host: 'host', user: 'deploy', port: 2222, isSshEnabled: true };

test('R17 the_trust_line_is_canonical', () => {
  assert.equal(trustLineFor(SSH, 'j@b:2200,k@c', 'echo hi'), "ssh -p 2222 -J j@b:2200,k@c -- deploy@host 'echo hi'");
  assert.equal(trustLineFor({ ...SSH, port: 22 }, 'j@b', 'echo hi'), "ssh -J j@b -- deploy@host 'echo hi'");
  assert.equal(trustLineFor({ ...SSH, port: undefined }, undefined, 'echo hi'), "ssh -- deploy@host 'echo hi'");
  assert.equal(trustLineFor(SSH, '', 'echo hi'), "ssh -p 2222 -- deploy@host 'echo hi'");
  assert.equal(trustLineFor({ ...SSH, user: undefined }, undefined, 'echo hi'), "ssh -p 2222 -- host 'echo hi'");
});

test('R18 the_trust_line_changes_with_host_user_port_and_jump_and_not_with_key_or_pin', () => {
  const base = trustLineFor(SSH, 'j@b', 'echo hi');
  const changed = [
    trustLineFor({ ...SSH, host: 'other' }, 'j@b', 'echo hi'),
    trustLineFor({ ...SSH, user: 'root' }, 'j@b', 'echo hi'),
    trustLineFor({ ...SSH, port: 2223 }, 'j@b', 'echo hi'),
    trustLineFor(SSH, 'j@c', 'echo hi'),
  ];
  assert.equal(new Set([base, ...changed]).size, 5);
  // The key is not an input of the text at all, even when it is hostile (B14).
  assert.equal(trustLineFor({ ...SSH, sshKeyPath: '/k "x" y' }, 'j@b', 'echo hi'), base);
  for (const text of [base, ...changed]) {
    assert.equal(/ -i | -o |\//.test(text), false, text);
  }
});

test('R19 the_trust_line_quotes_posix_on_win32_too', () => {
  assert.equal(trustLineFor.length, 3, 'host, jump, line: no platform parameter');
  assert.equal(trustLineFor(SSH, undefined, "echo it's"), `ssh -p 2222 -- deploy@host 'echo it'"'"'s'`);
});

const POSIX: HostShell = { shellPath: '/bin/bash', family: 'posix' };

function prepared(over: Partial<PreparedForTyping> = {}): PreparedForTyping {
  return { entity: SSH, options: { program: 'ssh' }, platform: 'linux', prefix: undefined, acceptNew: false, ...over };
}

test('R20 typedLine_refuses_powershell_5_1_for_a_double_quote_or_a_trailing_backslash', () => {
  const sentence = 'This terminal is Windows PowerShell 5.1, which cannot pass a double quote or a trailing backslash to ssh correctly. Install PowerShell 7 (pwsh) and run "deploy" again.';
  const quoted = remotePlan(entry({ command: 'echo "x"' }));
  const slashed = remotePlan(entry({ command: 'echo a\\' }));
  for (const shellPath of ['powershell.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\POWERSHELL.EXE', 'powershell']) {
    const shell: HostShell = { shellPath, family: 'powershell' };
    for (const plan of [quoted, slashed]) {
      assert.deepEqual(typedLine(plan, prepared({ platform: 'win32' }), shell), { kind: 'refused', reason: sentence }, shellPath);
    }
    assert.equal(typedLine(remotePlan(), prepared({ platform: 'win32' }), shell).kind, 'typed', 'a plain line is typed under 5.1');
  }
  for (const shell of [{ shellPath: 'pwsh.exe', family: 'powershell' } as HostShell, POSIX]) {
    assert.equal(typedLine(quoted, prepared(), shell).kind, 'typed', shell.shellPath);
    assert.equal(typedLine(slashed, prepared(), shell).kind, 'typed', shell.shellPath);
  }
});

test('R21 typedLine_is_prefix_then_the_builder_with_t_and_the_remote_word', () => {
  const plan = remotePlan();
  const prefix = "env SSH_AUTH_SOCK='/s' ";
  assert.deepEqual(typedLine(plan, prepared({ prefix }), POSIX), {
    kind: 'typed',
    line: "env SSH_AUTH_SOCK='/s' ssh -t -p 2222 -- deploy@host 'echo hi'",
  });
  assert.deepEqual(typedLine(plan, prepared({ acceptNew: true }), POSIX), {
    kind: 'typed',
    line: "ssh -o StrictHostKeyChecking=accept-new -t -p 2222 -- deploy@host 'echo hi'",
  });
  assert.deepEqual(typedLine(plan, prepared({ platform: 'win32' }), { shellPath: 'pwsh.exe', family: 'powershell' }), {
    kind: 'typed',
    line: "ssh -t -p 2222 -- deploy@host 'echo hi'",
  });
});

test('R22 typedLine_reads_the_snapshot_not_the_plan', () => {
  const plan = { ...remotePlan(), ssh: { ...SSH, host: 'a' } };
  const line = typedLine(plan, prepared({ entity: { ...SSH, host: 'b' } }), POSIX);
  assert.deepEqual(line, { kind: 'typed', line: "ssh -t -p 2222 -- deploy@b 'echo hi'" });
});

test('R22b typedLine_names_the_ssh_entry_when_the_snapshot_has_no_target', () => {
  const line = typedLine(remotePlan(), prepared({ entity: { ...SSH, host: undefined } }), POSIX);
  assert.deepEqual(line, { kind: 'refused', reason: '"prod" has no host configured — cannot start SSH.' });
});

test('R23 secretsStdin_is_exact', () => {
  assert.equal(
    secretsStdin({ CREDS_REF_1: 'a', CREDS_REF_2: "it's" }, 'echo x'),
    ["CREDS_REF_1='a'; export CREDS_REF_1", `CREDS_REF_2='it'"'"'s'; export CREDS_REF_2`, '{', 'echo x', '', '} </dev/null', 'exit $?', ''].join('\n'),
  );
  assert.equal(secretsStdin({}, 'echo x'), ['{', 'echo x', '', '} </dev/null', 'exit $?', ''].join('\n'));
  for (const bad of ['X; id', '1A', '', 'A-B', 'A B']) {
    assert.throws(
      () => secretsStdin({ [bad]: 'v' }, 'echo x'),
      (error: Error) => /not a valid variable name/.test(error.message) && (bad === '' || !error.message.includes(bad)),
      `${JSON.stringify(bad)}: refused with a fixed message that does not echo the name`,
    );
  }
});

// ---- the S1 refusal, moved here (§S2.6) -------------------------------------------------------------------------

test('R24 the_s1_refusal_answers_through_sshLinkOf', () => {
  assert.equal(
    sshLinkRefusal({ id: 't1', name: 'deploy', sshEntityId: 's1' }),
    '"deploy" is set to run over SSH, which this version cannot do yet. To run it on this machine, edit it and set "Runs over SSH" to "Do not use".',
  );
  assert.equal(sshLinkRefusal({ id: 't1', name: 'deploy', sshEntityId: 't1' })?.startsWith('"deploy" is set to run over SSH'), true, 'self is a link too');
  assert.equal(sshLinkRefusal({ id: 't1', name: 'deploy' }), undefined);
  assert.equal(sshLinkRefusal({ id: 't1', name: 'deploy', sshEntityId: '' }), undefined);
  assert.equal(fs.existsSync(path.join(SRC, 'sshLinkGate.ts')), false, 'the old file is gone');
});

test('the_composer_imports_no_vscode', () => {
  const source = fs.readFileSync(path.join(SRC, 'remoteLaunch.ts'), 'utf8');
  assert.equal(/from\s+['"]vscode['"]/.test(source), false);
  assert.equal(/require\(\s*['"]vscode['"]\s*\)/.test(source), false);
});
