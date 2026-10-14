# Changelog

## [0.10.3](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/compare/mcp-v0.10.2...mcp-v0.10.3) (2026-10-14)


### Bug Fixes

* launch the Windows half through `setpriv --pdeathsig KILL --` (shared WindowsBridge.StartPiped) so the proxy carries PR_SET_PDEATHSIG(SIGKILL) and the kernel ends it the instant the wrapper process dies, even while stopped. Guarded forks run on one dedicated long-lived thread (pdeathsig is thread-scoped through .NET's fork — a retiring pool worker would otherwise kill the proxy mid-session); setpriv is resolved from trusted dirs and probed once for --pdeathsig support; the guard arms only when the binary resolves, preserving the exit-99 missing-binary diagnosis; CREDS_NO_PDEATH_GUARD=1 is the off switch. Covers the MCP pump and the relay's relay-pipe children. ([5530e8b](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/5530e8b966586682ad004bb9ab17ddf31d1affa6))
* **mcp:** a stopped WSL interop proxy dies with its wrapper (defect D) ([5530e8b](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/5530e8b966586682ad004bb9ab17ddf31d1affa6))

## [0.10.2](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/compare/mcp-v0.10.1...mcp-v0.10.2) (2026-10-12)


### Bug Fixes

* crashed windows no longer slow every refusal ([#229](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/229)) ([ccc817c](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/ccc817ceb306aad1cd702b172baaaab3bcf87159))

## [0.10.1](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/compare/mcp-v0.10.0...mcp-v0.10.1) (2026-10-11)


### Bug Fixes

* **release:** creds and creds-mcp binaries carry their tag's version ([#223](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/223)) ([5bddf61](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/5bddf615ad5e8795f3331233f9e4afe953b9a0e0))

## [0.10.0](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/compare/mcp-v0.9.1...mcp-v0.10.0) (2026-10-11)


### Features

* **mcp:** every creds process logs why it lived and why it ended (E1) ([#201](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/201)) ([9494a67](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/9494a67cad995d18c319b709f0aac960c3a2451e))


### Bug Fixes

* **mcp,cli:** the bridge and the relay stop what they started (E3) ([#214](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/214)) ([c7f55af](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/c7f55af5e229657692e678f3a6f1f0217d2d6694))
* **mcp:** the server ends when its client is gone (E2) ([#211](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/211)) ([93e40d0](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/93e40d0c358b3349cc155b5c8c4739ef7fbdd355))

## [0.9.1](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/compare/mcp-v0.9.0...mcp-v0.9.1) (2026-10-02)


### Bug Fixes

* **extension:** a rotated password the PIN refused waits on this machine until the PIN is entered, and an agent can no longer rotate a one-use entry ([0a66aed](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/0a66aedb1f4ff720e1f373a44b80f23f71d14997))
* **mcp:** creds_rotate says what stored quarantined means ([0a66aed](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/0a66aedb1f4ff720e1f373a44b80f23f71d14997))

## [0.9.0](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/compare/mcp-v0.8.0...mcp-v0.9.0) (2026-09-30)


### Features

* **agent:** an agent learns what a folder holds, and creates an entry with exactly that kind's fields ([#168](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/168)) ([57a2953](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/57a295361d20bf7121b5aaf6d4772bafb23b03ca))

## [0.8.0](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/compare/mcp-v0.7.0...mcp-v0.8.0) (2026-09-24)


### Features

* the consent dialog names a Claude Code session by the title on its tab ([#136](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/136)) ([#139](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/139)) ([901e28c](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/901e28c365e2a3c4132712568e25b7cacfd9003c))

## [0.7.0](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/compare/mcp-v0.6.1...mcp-v0.7.0) (2026-09-21)


### Features

* **ci:** release-please for the four components, option A, on a button ([79dbeb4](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/commit/79dbeb4f9e84197688a3141c4346858616d5236b))
