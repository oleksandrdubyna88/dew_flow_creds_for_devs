## Using it without ever retyping it

- **Connect SSH** supplies the stored password through `SSH_ASKPASS` — never on a command line, never in scrollback.
- **Add to SSH Agent** serves a stored key from memory. `ssh` and `git` find it through `SSH_AUTH_SOCK`, every use asks first, and no `0600` file is written at all.
- **Run with Secrets** resolves `creds://you@corp.com/prod-db/password` into the child process's environment and masks the value in everything it prints.
- **Share with Claude Code…** lets an AI agent use a credential it never receives.

`Ctrl+Alt+P` jumps to any entry by name.
