/**
 * The switch of the Remote Bridge's new flow (the plan's §4.5; change 11.1, S5): the scoped open (a listener of the bridge's own, its scope,
 * the note on the server), its reconnects, and the restore of the bridges opened and not Closed, at activation and at every unlock.
 *
 * <p><b>Off in every build that ships.</b> With it off, *Open Remote Bridge* is the road of the released extension
 * (`legacyBridgeOpen.ts`): it forwards to the main broker port and shows the setup block to paste, and nothing is restored. No bridge
 * door opens, so nothing bridged is reachable (the scoped listener is the only way to one). The owner's pilot build turns it on at build
 * time and never ships; E4.1's commit turns it on for everyone, together with `activationEvents` in `package.json` (D19: the manifest
 * cannot sit behind a constant, so `bridgeFlowSwitch.test.ts` holds both).</p>
 *
 * <p>Tests turn it on through the host's `bridgeFlow` (the person-roads world does), never by editing this constant, so a green CI says
 * nothing about the shipped default; the test of this file does.</p>
 */
export const BRIDGE_FLOW_ENABLED: boolean = false;

/** The context key that carries the switch to the manifest: *Prepare Database Container* shows in the palette only when it is on. */
export const BRIDGE_FLOW_CONTEXT = 'credSshManager.bridgeFlow';
