// Variables for the `.http` contract suite — chiefly the tokens.
//
// The vault server's three authentication schemes are Microsoft, Google and `Local`. The first two
// mint tokens only through an interactive sign-in, so neither a CI runner nor a headless suite can
// obtain one. `Local` is a symmetric HS256 scheme (issuer `cred-vault-local`, an `email` claim), so
// the suite signs its own — which is what makes every authenticated request here runnable without a
// human in front of a browser.
//
// THE KEY IS NEVER IN THIS FILE. It comes from `VAULT_LOCAL_SIGNING_KEY`, the same value the server
// under test is started with. Whoever holds that string can mint a token for ANY email on that
// server (`deploy/README.md` says so in as many words), so it belongs to a throwaway local server
// and to nothing else. `http-run.mjs --require-env VAULT_LOCAL_SIGNING_KEY` refuses to start
// without it, because a suite that runs with an empty key produces a wall of 401s that reads
// exactly like an authentication regression.
//
// Four identities, because the server's refusals are ABOUT identity and cannot be exercised with
// one: a member of the allowed domain, a second member (a share needs a recipient), somebody
// outside the domain (403), and a recovery officer (the officer-only endpoints).

const crypto = require('node:crypto');

const KEY = process.env.VAULT_LOCAL_SIGNING_KEY ?? '';
const DOMAIN = process.env.VAULT_TEST_DOMAIN ?? 'example.com';

/** An HS256 token the `Local` scheme accepts: right issuer, an `email` claim, a live lifetime. */
function mint(email, name) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const signingInput =
    `${encode({ alg: 'HS256', typ: 'JWT' })}.` +
    encode({ iss: 'cred-vault-local', email, name, iat: now, nbf: now - 60, exp: now + 3600 });
  const signature = crypto.createHmac('sha256', KEY).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

module.exports = {
  environments: {
    local: {
      baseUrl: process.env.VAULT_BASE_URL ?? 'http://127.0.0.1:5099',

      // The contract version this suite speaks. Sent on every request so the suite is a client
      // like any other — and so a future 426 is something the suite can be made to provoke.
      contract: '2',

      aliceEmail: `alice@${DOMAIN}`,
      bobEmail: `bob@${DOMAIN}`,
      officerEmail: `officer@${DOMAIN}`,

      token: mint(`alice@${DOMAIN}`, 'Alice Example'),
      bobToken: mint(`bob@${DOMAIN}`, 'Bob Example'),
      officerToken: mint(`officer@${DOMAIN}`, 'Olivia Officer'),

      // Deliberately a domain the server under test does not allow: this is the only way to reach
      // the 403 branch of RequireCaller, which is a different refusal from the 401 above it.
      outsiderToken: mint('mallory@outside.test', 'Mallory Outsider'),
    },
  },
};
