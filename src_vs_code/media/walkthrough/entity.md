## One entry, one kind

Pick the type and the form shows only that kind's fields:

| Kind | What it holds |
|---|---|
| SSH connection | host, user, port, and the key or password to get in |
| SSH key | the pair itself — servable by the agent, so it never becomes a file |
| VPN | the config file, as a secret |
| Database | a connection string, or the fields that rebuild one |
| Terminal command | the verb plus a row per argument, each with its own note |
| Credential | anything that is a login and a password |

The **Secret** section can generate a password or a passphrase, and the SSH key section can generate an Ed25519 pair — drawn in the editor, saved straight to the keychain.
