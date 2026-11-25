import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { writeBridgeNote, type NoteSpawn } from '../bridgeNoteWriter';
import { buildNoteArgv, noteWriteCommand } from '../sshBridge';
import { NO_CONNECTION_SHARING } from '../sshExecCommand';
import { click, settled, world, writtenKey } from './personRoadsWorld';

/**
 * Change 11.1, the 72-hour slice, S1: the scoped Remote Bridge's open. The note's command and argv (pure), its writer (over a stand-in `ssh`),
 * and the open command through the person-roads world: the bridge forwards to its OWN listener, and the note names that listener.
 */

const ID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const NOTE = { socket: '/tmp/creds-dev-x.sock', port: 51_001, brokerPort: 4242, key: 'the-listener-key-43-characters-long-abcdefg', serverName: 'box', openedAt: '2026-11-25T00:00:00.000Z' };

test('S1: the note command writes the note from stdin, owner-only, by a rename; only a bridge id enters the command line', () => {
  const command = noteWriteCommand(ID);
  assert.ok(command !== undefined);
  assert.match(command, /^umask 077 && /, 'every file and folder it makes is owner-only');
  assert.match(command, /chmod 700 "\$HOME\/\.creds-for-devs" "\$d"/);
  assert.match(command, /cat > "\$d\/\.0f1e2d3c-[^"]*\.tmp" && mv -f "\$d\/\.0f1e2d3c-[^"]*\.tmp" "\$d\/0f1e2d3c-[^"]*\.json"$/, 'written to a hidden file, then renamed into place');
  assert.match(command, /find "\$d" -maxdepth 1 -type f -name '\*\.json' ! -name '0f1e2d3c-[^']*\.json' -delete/, 'the other notes go: one bridge per server');
  for (const bad of ['', 'x; rm -rf ~', "a'b", '../x', 'ABCDEF01-2345-6789-abcd-ef0123456789 ']) {
    assert.equal(noteWriteCommand(bad), undefined, `a value that is not a bridge id never reaches a shell: ${JSON.stringify(bad)}`);
  }
});

test('S1: the note\'s one-shot ssh shares no connection, takes the bridge\'s host-key file, ends option parsing before the target, and carries no forward', () => {
  const argv = buildNoteArgv({ id: 'e1', name: 'box', host: 'box.example', user: 'dev', isSshEnabled: true } as never, { port: 51_001, remote: { path: '/tmp/creds-dev-x.sock' }, keyPath: '/k/key', auth: 'key', knownHostsFile: undefined }, () => true, ID);
  assert.ok(argv !== undefined);
  const joined = argv.join(' ');
  assert.ok(joined.includes(NO_CONNECTION_SHARING.join(' ')), 'no connection sharing');
  assert.ok(!argv.includes('-R') && !argv.includes('-N'), 'no forward and a remote command');
  assert.deepEqual(argv.slice(-3), ['--', 'dev@box.example', noteWriteCommand(ID)], 'the target after --, then the command');
  assert.equal(buildNoteArgv({ id: 'e1', name: 'box', host: '-oProxyCommand=x', isSshEnabled: true } as never, { port: 1, remote: { path: '/tmp/s' } }, () => false, ID), undefined, 'a host the bridge would refuse');
});

/** A stand-in `ssh`: records argv and stdin, ends with `code` (or never, for `undefined`), and may print `said` on stderr. */
function fakeSsh(code: number | undefined, said = ''): { spawn: NoteSpawn; calls: { argv: readonly string[]; stdin: string; killed: boolean }[] } {
  const calls: { argv: readonly string[]; stdin: string; killed: boolean }[] = [];
  const spawn = ((_program: string, argv: readonly string[]) => {
    const child = new EventEmitter() as EventEmitter & { stdin: PassThrough; stderr: PassThrough; kill: () => boolean };
    const call = { argv, stdin: '', killed: false };
    calls.push(call);
    child.stdin = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (): boolean => {
      call.killed = true;
      return true;
    };
    child.stdin.on('data', (chunk: Buffer) => {
      call.stdin += chunk.toString('utf8');
    });
    child.stdin.on('finish', () => {
      if (said !== '') {
        child.stderr.write(said);
      }
      if (code !== undefined) {
        setImmediate(() => child.emit('close', code));
      }
    });
    return child;
  }) as unknown as NoteSpawn;
  return { spawn, calls };
}

test('S1: the note goes to ssh on stdin, one JSON line, and never into an argument', async () => {
  const ssh = fakeSsh(0);
  const outcome = await writeBridgeNote(NOTE, ['--', 'dev@box', 'cmd'], {}, ssh.spawn);
  assert.deepEqual(outcome, { ok: true });
  assert.deepEqual(JSON.parse(ssh.calls[0].stdin), NOTE);
  assert.ok(ssh.calls[0].stdin.endsWith('\n'));
  assert.ok(!ssh.calls[0].argv.join(' ').includes(NOTE.key), 'the key is in no argument');
});

test('S1: a write that fails says why in ssh\'s words, with no key; one that hangs is killed at its bound', async () => {
  const failed = await writeBridgeNote(NOTE, [], {}, fakeSsh(255, 'Permission denied (publickey).\n').spawn);
  assert.equal(failed.ok, false);
  assert.match(failed.ok ? '' : failed.reason, /ssh ended with 255: Permission denied \(publickey\)\./);
  assert.ok(!(failed.ok ? '' : failed.reason).includes(NOTE.key));
  const hanging = fakeSsh(undefined);
  const timedOut = await writeBridgeNote(NOTE, [], {}, hanging.spawn, 20);
  assert.equal(timedOut.ok, false);
  assert.match(timedOut.ok ? '' : timedOut.reason, /did not answer within/);
  assert.equal(hanging.calls[0].killed, true, 'the hanging ssh is killed');
});

test('S1: Open Remote Bridge forwards to the bridge\'s OWN listener (not the main broker port), writes the note naming it, and closes the listener when the ssh ends', async () => {
  const w = world({ clicks: [writtenKey('/storage/keys/1/call.key')] });
  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(w.listeners.length, 1, 'one listener of its own');
  assert.equal(w.children.length, 1, 'one bridge ssh');
  const forward = w.bridgeArgvs[0][w.bridgeArgvs[0].indexOf('-R') + 1];
  assert.match(forward, /:127\.0\.0\.1:51001$/, 'the forward goes to the listener, not to the main port 4242');
  assert.equal(w.notes.length, 1, 'one note written');
  assert.equal(w.notes[0].note.port, 51_001);
  assert.equal(w.notes[0].note.key, 'listener-key');
  assert.equal(w.notes[0].note.brokerPort, 4242);
  assert.ok(!w.notes[0].argv.join(' ').includes('listener-key'), 'the key is not in the note ssh\'s argv');
  assert.equal(w.listeners[0].closed, false, 'the listener stays while the bridge runs');

  w.children[0].end(0);
  await settled();
  assert.equal(w.listeners[0].closed, true, 'the bridge ended: its listener is closed');
});
