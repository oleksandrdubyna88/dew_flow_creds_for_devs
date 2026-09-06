import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OrgRecoveryAccessFacts,
  accountContextValue,
  orgAccessWithRole,
  orgRecoveryAccess,
} from '../orgRecoveryAccess';

/**
 * Who sees the corporate-recovery commands at all. Five entries were contributed against
 * `viewItem == account`, i.e. every account on every transport, so most people were shown five
 * menu items whose only possible outcome was a refusal — three of them actions that are not
 * theirs to run and never will be.
 */

function facts(overrides: Partial<OrgRecoveryAccessFacts> = {}): OrgRecoveryAccessFacts {
  return {
    onServer: true,
    enabled: true,
    officerEmails: ['cto@corp.com', 'lead@corp.com', 'devops@corp.com'],
    accountEmail: 'someone@corp.com',
    ...overrides,
  };
}

test('a folder or git account never sees corporate recovery', () => {
  // There is no server there to relay a share, so every one of the five would refuse.
  assert.equal(orgRecoveryAccess(facts({ onServer: false })), 'none');
  assert.equal(
    orgRecoveryAccess(facts({ onServer: false, accountEmail: 'cto@corp.com' })),
    'none',
    'not even for somebody who is an officer somewhere else',
  );
});

test('a server with no roster shows nothing either', () => {
  assert.equal(orgRecoveryAccess(facts({ enabled: false })), 'none');
});

test('an ordinary employee on a corporate server gets the page and not the actions', () => {
  // The page is disclosure — their vault is recoverable by the people it names, and they were
  // never asked. The actions are somebody else's job.
  assert.equal(orgRecoveryAccess(facts()), 'enrolled');
  assert.equal(accountContextValue('enrolled'), 'account-corp');
});

test('an officer gets everything', () => {
  assert.equal(orgRecoveryAccess(facts({ accountEmail: 'lead@corp.com' })), 'officer');
  assert.equal(accountContextValue('officer'), 'account-corpOfficer');
});

test('officer matching ignores case and surrounding space on both sides', () => {
  // The roster is typed by an operator into a config file; the account email comes from an
  // identity provider. Neither normalises for the other.
  assert.equal(
    orgRecoveryAccess(facts({ accountEmail: '  LEAD@Corp.com ' })),
    'officer',
  );
  assert.equal(
    orgRecoveryAccess(facts({ officerEmails: [' CTO@CORP.COM '], accountEmail: 'cto@corp.com' })),
    'officer',
  );
});

test('the gate is a configured roster, NOT a finished ceremony', () => {
  // Between the operator naming officers and the officers completing setup, the actions are
  // exactly what is needed — accepting a share is how that window closes. Gating on a finished
  // setup would hide the commands that finish it.
  assert.equal(
    orgRecoveryAccess(facts({ accountEmail: 'cto@corp.com' })),
    'officer',
    'an officer can act before the key is published',
  );
});

test('an account with no corporate recovery keeps the value every other menu entry matches', () => {
  // Every non-corporate entry on the account row is contributed against `viewItem == account`.
  // Changing that string for ordinary accounts would silently empty the menu.
  assert.equal(accountContextValue('none'), 'account');
});

// ------------------------------------------------------------- the roles (epic 1, story 4)

test('an admin and a dev get their own row values, under the corp prefix', () => {
  // The prefix is what keeps every entry already contributed against `/^account-corp/` — the
  // disclosure page, and now the policy page — working for the two new states unchanged.
  assert.equal(accountContextValue('admin'), 'account-corpAdmin');
  assert.equal(accountContextValue('dev'), 'account-corpDev');
  for (const access of ['admin', 'dev', 'enrolled', 'officer'] as const) {
    assert.match(accountContextValue(access), /^account-corp/);
  }
});

test('the role is folded into the access, and the officer stays highest', () => {
  // An officer is always an admin, so there is no combined state to invent: the four actions
  // are theirs whatever the registry says, and the registry cannot say anything about them.
  assert.equal(orgAccessWithRole('officer', 'member'), 'officer');
  assert.equal(orgAccessWithRole('officer', 'dev'), 'officer');
  assert.equal(orgAccessWithRole('enrolled', 'admin'), 'admin');
  assert.equal(orgAccessWithRole('enrolled', 'dev'), 'dev');
  assert.equal(orgAccessWithRole('enrolled', 'member'), 'enrolled');
});

test('an unknown role from a newer server is an ordinary enrolled account, not an admin', () => {
  assert.equal(orgAccessWithRole('enrolled', 'auditor'), 'enrolled');
  assert.equal(orgAccessWithRole('enrolled', undefined), 'enrolled', 'no document yet');
});

test('`account` stays byte-identical when corp mode is off, whatever the policy said', () => {
  // Every other menu entry on an account row is contributed against exactly this string. A
  // policy document from a server with no roster must not be able to change it.
  for (const role of ['admin', 'dev', 'member', undefined]) {
    assert.equal(orgAccessWithRole('none', role), 'none');
    assert.equal(accountContextValue(orgAccessWithRole('none', role)), 'account');
  }
});
