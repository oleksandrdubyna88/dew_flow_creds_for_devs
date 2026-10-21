/**
 * One job at a time per key — the queue `OneUseLane` and the SSH agent's `ConsentTurns` both stand on (#197, E2.3).
 *
 * <p>Extracted from `OneUseLane.run`, where it was the keyed tail of promises. A second copy would be a second
 * place for the one subtle rule to drift: the chain advances when a job SETTLES, on failure as on success
 * (`.then(next, next)`, never `.then(next)`) — a rejection travelling down the queue would fail every job behind it
 * with somebody else's error.</p>
 *
 * <p>"Advance when the job settles" is also what makes the SSH agent's prompt slot: the next job for a key starts
 * after the previous job's promise is settled and its continuation has run, so whatever that job wrote is visible
 * to the next one.</p>
 */
export class KeyedQueue {
  /** The tail of each key's queue, pruned when its last job settles — the map never outgrows the in-flight keys. */
  private readonly tails = new Map<string, Promise<unknown>>();

  /**
   * Run `work` after every earlier job of `key` has settled; answers what `work` answers, rejection included.
   *
   * <p>A key with nothing in flight starts its job SYNCHRONOUSLY, inside this call: the SSH agent's first prompt
   * for a key is on screen before `confirm` returns its promise, which is what lets a lock or a button used the
   * instant afterwards cross it (and what the older tests of that gate rely on). A synchronous throw is a
   * rejection, as for any later job.</p>
   */
  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const tail = this.tails.get(key);
    const ours =
      tail === undefined
        ? new Promise<T>((resolve) => resolve(work()))
        : tail.then(
            () => work(),
            () => work(),
          );
    this.tails.set(key, ours);
    try {
      return await ours;
    } finally {
      // Only if nobody queued behind us: whoever did owns the tail now.
      if (this.tails.get(key) === ours) {
        this.tails.delete(key);
      }
    }
  }

  /** How many keys have a job in flight — for tests, deciding nothing. */
  size(): number {
    return this.tails.size;
  }
}
