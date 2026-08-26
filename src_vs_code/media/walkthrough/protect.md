## What protects what

- Secrets live in the **OS keychain**. Nothing here invents its own storage for them.
- Anything that *leaves* the machine is encrypted first — AES-256-GCM under a key wrapped by your **sync PIN** or a **security key**. The folder or server holding it has ciphertext and nothing else.
- **Auto-lock** forgets the cached key after an idle window measured in *your* actions, not mouse movement and not background sync.
- The status bar shows whether the vault is open or locked; clicking it does the obvious thing.
