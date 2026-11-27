import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';

/**
 * The pilot's server script (change 11.1, S5; `scripts/pilot/creds-pilot.sh`): install, status and undo, run by a real `sh` in an owned
 * folder that stands in for the login's home, with a stand-in `claude` that keeps its registrations in a file and prints `mcp get` in the
 * shape the real one does (read on this machine, 2026-11-27: `  Command: <path>`). The real home and the real `claude` are never used.
 */

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'pilot', 'creds-pilot.sh');
const POSIX = process.platform === 'win32' ? 'a POSIX shell' : false;
const scope = cleanupScope();
after(() => scope.close());

const FAKE_CLAUDE = `#!/bin/sh
db="$FAKE_CLAUDE_DB"
case "$1 $2" in
  "mcp get")
    line=$(grep "^$3|" "$db" 2>/dev/null) || exit 1
    printf '%s:\\n  Scope: User config (available in all your projects)\\n  Status: ok\\n  Type: stdio\\n  Command: %s\\n  Args:\\n  Environment:\\n\\nTo remove this server, run: claude mcp remove %s -s user\\n' "$3" "\${line#*|}" "$3" ;;
  "mcp add")
    [ "$3" = "--scope" ] && [ "$4" = "user" ] && [ "$6" = "--" ] || exit 2
    grep -q "^$5|" "$db" 2>/dev/null && exit 3
    echo "$5|$7" >>"$db" ;;
  "mcp remove")
    [ "$4" = "-s" ] && [ "$5" = "user" ] || exit 2
    grep -v "^$3|" "$db" >"$db.new" || true
    mv "$db.new" "$db" ;;
  *) exit 9 ;;
esac
`;

interface Rig {
  home: string;
  bin: string;
  drop: string;
  db: string;
  fakeBin: string;
}

/** An owned home, a bin folder, a drop folder with the two stand-in binaries and their SHA256SUMS, and the stand-in `claude`. */
function rig(what: string): Rig {
  const root = ownedDir(scope, what);
  const r = { home: path.join(root, 'home'), bin: path.join(root, 'home', 'bin'), drop: path.join(root, 'drop'), db: path.join(root, 'claude.db'), fakeBin: path.join(root, 'fake') };
  for (const dir of [r.home, r.drop, r.fakeBin]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  for (const tool of ['creds', 'creds-mcp']) {
    fs.writeFileSync(path.join(r.drop, tool), `#!/bin/sh\necho "pilot ${tool}"\n`, { mode: 0o755 });
  }
  const sum = (tool: string): string => `${createHash('sha256').update(fs.readFileSync(path.join(r.drop, tool))).digest('hex')}  ${tool}\n`;
  fs.writeFileSync(path.join(r.drop, 'SHA256SUMS'), sum('creds') + sum('creds-mcp'));
  fs.writeFileSync(path.join(r.fakeBin, 'claude'), FAKE_CLAUDE, { mode: 0o755 });
  fs.writeFileSync(r.db, '');
  return r;
}

function pilot(r: Rig, args: string[], withClaude = true): { status: number | null; out: string } {
  const env = { HOME: r.home, PATH: `${withClaude ? `${r.fakeBin}:` : ''}/usr/bin:/bin`, CREDS_PILOT_BIN: r.bin, FAKE_CLAUDE_DB: r.db };
  const result = spawnSync('/bin/sh', [SCRIPT, ...args], { env, encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const pilotHome = (r: Rig): string => path.join(r.home, '.creds-for-devs', 'pilot');
const registrations = (r: Rig): string => fs.readFileSync(r.db, 'utf8');

test('PS1: on a fresh login, install links both tools and registers creds-mcp; undo removes the links, the registration and the pilot folder', { skip: POSIX }, () => {
  const r = rig('ps1');
  const installed = pilot(r, ['install', r.drop]);
  assert.equal(installed.status, 0, installed.out);
  for (const tool of ['creds', 'creds-mcp']) {
    assert.equal(fs.readlinkSync(path.join(r.bin, tool)), path.join(pilotHome(r), 'bin', tool));
  }
  assert.equal(registrations(r), `creds|${path.join(r.bin, 'creds-mcp')}\n`, 'registered by the link\'s absolute path');
  assert.match(pilot(r, ['status']).out, /registration: added/);

  const undone = pilot(r, ['undo']);
  assert.equal(undone.status, 0, undone.out);
  assert.deepEqual([fs.existsSync(path.join(r.bin, 'creds')), fs.existsSync(path.join(r.bin, 'creds-mcp'))], [false, false]);
  assert.equal(registrations(r), '', 'the registration install added is removed');
  assert.equal(fs.existsSync(pilotHome(r)), false);
});

test('PS2: existing tools are moved aside and come back on undo; a registration that already runs the link is kept', { skip: POSIX }, () => {
  const r = rig('ps2');
  fs.mkdirSync(r.bin, { recursive: true });
  fs.writeFileSync(path.join(r.bin, 'creds'), '#!/bin/sh\necho old creds\n', { mode: 0o755 });
  fs.symlinkSync('/nowhere/creds-mcp', path.join(r.bin, 'creds-mcp')); // an old link, even a dangling one, is kept as it was
  fs.writeFileSync(r.db, `creds|${path.join(r.bin, 'creds-mcp')}\n`);

  const installed = pilot(r, ['install', r.drop]);
  assert.equal(installed.status, 0, installed.out);
  assert.match(installed.out, /already runs .* kept/);
  assert.equal(registrations(r), `creds|${path.join(r.bin, 'creds-mcp')}\n`, 'unchanged');

  assert.equal(pilot(r, ['undo']).status, 0);
  assert.equal(fs.readFileSync(path.join(r.bin, 'creds'), 'utf8'), '#!/bin/sh\necho old creds\n', 'the old creds is back');
  assert.equal(fs.readlinkSync(path.join(r.bin, 'creds-mcp')), '/nowhere/creds-mcp', 'the old link is back as it was');
  assert.equal(registrations(r), `creds|${path.join(r.bin, 'creds-mcp')}\n`, 'a kept registration is not removed');
});

test('PS3: a registration that runs another path is NOT changed; the two commands to change it are printed', { skip: POSIX }, () => {
  const r = rig('ps3');
  fs.writeFileSync(r.db, 'creds|/opt/other/creds-mcp\n');
  const installed = pilot(r, ['install', r.drop]);
  assert.equal(installed.status, 0, installed.out);
  assert.match(installed.out, /runs \/opt\/other\/creds-mcp, not the pilot\. It was NOT changed/);
  assert.ok(installed.out.includes(`claude mcp remove creds -s user && claude mcp add --scope user creds -- ${path.join(r.bin, 'creds-mcp')}`));
  assert.equal(registrations(r), 'creds|/opt/other/creds-mcp\n');
  assert.equal(pilot(r, ['undo']).status, 0);
  assert.equal(registrations(r), 'creds|/opt/other/creds-mcp\n', 'undo leaves it too');
});

test('PS4: a second install is refused, and binaries that do not match SHA256SUMS are refused before anything is placed', { skip: POSIX }, () => {
  const r = rig('ps4');
  assert.equal(pilot(r, ['install', r.drop]).status, 0);
  const again = pilot(r, ['install', r.drop]);
  assert.notEqual(again.status, 0);
  assert.match(again.out, /already installed/);

  const bad = rig('ps4-bad');
  fs.appendFileSync(path.join(bad.drop, 'creds-mcp'), '# changed\n');
  const refused = pilot(bad, ['install', bad.drop]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.out, /creds-mcp does not match SHA256SUMS/);
  assert.deepEqual([fs.existsSync(pilotHome(bad)), fs.existsSync(bad.bin)], [false, false], 'nothing placed');
});

test('PS5: with no claude on the PATH, nothing is registered and the command to register is printed; undo still undoes the links', { skip: POSIX }, () => {
  const r = rig('ps5');
  const installed = pilot(r, ['install', r.drop], false);
  assert.equal(installed.status, 0, installed.out);
  assert.ok(installed.out.includes(`claude mcp add --scope user creds -- ${path.join(r.bin, 'creds-mcp')}`));
  assert.equal(registrations(r), '');
  assert.equal(pilot(r, ['undo'], false).status, 0);
  assert.equal(fs.existsSync(path.join(r.bin, 'creds')), false);
});

test('PS6: a bin folder outside the home (shared, like /usr/local/bin) gets a pilot folder beside it that every login can reach, not one inside the home', { skip: POSIX }, () => {
  const r = rig('ps6');
  const shared = { ...r, bin: path.join(path.dirname(r.home), 'usr', 'bin') };
  const sharedHome = path.join(path.dirname(r.home), 'usr', 'lib', 'creds-pilot');
  const installed = pilot(shared, ['install', r.drop]);
  assert.equal(installed.status, 0, installed.out);
  assert.equal(fs.readlinkSync(path.join(shared.bin, 'creds-mcp')), path.join(sharedHome, 'bin', 'creds-mcp'));
  assert.equal(fs.existsSync(pilotHome(r)), false, 'nothing in the login\'s home');
  const mode = (p: string): number => fs.statSync(p).mode & 0o777;
  assert.deepEqual([mode(sharedHome), mode(path.join(sharedHome, 'bin')), mode(path.join(sharedHome, 'bin', 'creds'))], [0o755, 0o755, 0o755]);
  assert.equal(mode(path.join(sharedHome, 'state')), 0o700, 'what undo needs stays private');
  assert.ok(pilot(shared, ['status']).out.includes(`installed in ${sharedHome},`));

  assert.equal(pilot(shared, ['undo']).status, 0);
  assert.deepEqual([fs.existsSync(sharedHome), fs.existsSync(path.join(shared.bin, 'creds'))], [false, false]);
});
