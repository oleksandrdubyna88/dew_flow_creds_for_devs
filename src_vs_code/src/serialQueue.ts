/**
 * One thing at a time, per instance.
 *
 * <p>Written for {@link GitTransport}, whose operations share a single working directory: a
 * read hard-resets that directory onto the remote, so a read that starts while a write is
 * between `fs.writeFileSync` and `git commit` throws the write away — and the write then sees
 * a clean `git status` and reports success. Silent data loss, and nothing in git's own
 * concurrency story covers it, because the collision is local rather than between clones.</p>
 *
 * <p>A failed piece of work must not wedge the queue: `work` runs on both settlement paths of
 * the tail, and the stored tail is the swallowed form, so one caller's error is that caller's
 * alone.</p>
 *
 * <p>Serializes within ONE instance and no further — and that boundary is no longer the last word on
 * it. `leasedQueue.ts` wraps this with a cross-window lock (`windowLock.ts`) for the operations that
 * share a profile's `globalState` and `SecretStorage`; `crossWindowWrites.test.ts` shows what the gap
 * cost before it existed. For `GitTransport`, whose peers are other MACHINES, the rejected-push
 * contract remains the answer and this class alone is still the right one.</p>
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /** Run `work` after everything already queued, whatever became of it. */
  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
