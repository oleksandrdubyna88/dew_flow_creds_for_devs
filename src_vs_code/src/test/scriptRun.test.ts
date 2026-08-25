import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RUNNABLE_LANGUAGES, scriptRunPlan } from '../scriptRun';

/**
 * How a stored script is executed: which interpreter, which file extension, and which
 * languages are honestly NOT runnable from here. Pure — the wrong interpreter guess
 * must be a failing test, not a support ticket.
 */

test('bash runs with bash everywhere — on Windows that means git-bash/WSL bash on PATH', () => {
  const linux = scriptRunPlan('bash', 'linux');
  const win = scriptRunPlan('bash', 'win32');

  assert.equal(linux.kind, 'run');
  if (linux.kind !== 'run') return;
  assert.deepEqual([linux.command, linux.extension], ['bash', '.sh']);
  assert.equal(win.kind, 'run');
  if (win.kind !== 'run') return;
  assert.equal(win.command, 'bash');
});

// eslint-disable-next-line complexity
test('powershell prefers pwsh on posix and powershell.exe on windows', () => {
  const win = scriptRunPlan('powershell', 'win32');
  const linux = scriptRunPlan('powershell', 'linux');

  assert.equal(win.kind === 'run' ? win.command : '', 'powershell');
  assert.equal(win.kind === 'run' ? win.args.join(' ') : '', '-ExecutionPolicy Bypass -File');
  assert.equal(linux.kind === 'run' ? linux.command : '', 'pwsh');
  assert.equal(win.kind === 'run' ? win.extension : '', '.ps1');
});

test('python and javascript run by interpreter, same on every OS', () => {
  const py = scriptRunPlan('python', 'win32');
  const js = scriptRunPlan('javascript', 'linux');

  assert.equal(py.kind === 'run' ? py.command : '', 'python');
  assert.equal(js.kind === 'run' ? js.command : '', 'node');
});

test('sql, yaml, json and dockerfile are refused with a reason, not run through a shell', () => {
  for (const lang of ['sql', 'yaml', 'json', 'dockerfile', 'other']) {
    const plan = scriptRunPlan(lang, 'linux');
    assert.equal(plan.kind, 'unsupported', lang);
    if (plan.kind !== 'unsupported') continue;
    assert.ok(plan.reason.length > 0);
  }
  assert.deepEqual([...RUNNABLE_LANGUAGES].sort(), ['bash', 'javascript', 'powershell', 'python']);
});
