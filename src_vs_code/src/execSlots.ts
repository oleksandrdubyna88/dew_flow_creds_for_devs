/**
 * Bounded concurrency for the agent's exec actions: a guard against a runaway agent loop.
 *
 * <p>Out of `credsAgentServer.ts` (E1.3 epoch 3, A.3.8), which sits a few lines under its 800-line ceiling and
 * had to pay for the launch gate. Pure: the cap is an argument, so a test does not need the broker to show it.</p>
 */
export class ExecSlots {
  private running = 0;

  constructor(private readonly max: number) {}

  /**
   * A release function, or `undefined` at the cap. Releasing twice frees one slot, not two. An arrow property, so it can
   * be handed on as a bare function (`acquireExecSlot = new ExecSlots(n).acquire`) and still be about this instance.
   */
  readonly acquire = (): (() => void) | undefined => {
    if (this.running >= this.max) {
      return undefined;
    }
    this.running += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.running -= 1;
      }
    };
  };
}
