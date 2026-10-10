/**
 * One question to a person, shared by every request waiting on the same answer — and left by any
 * request whose client is gone.
 *
 * <p>The broker shares a consent modal between concurrent first calls on one grant on purpose: two
 * modals for one token is a bug the person experiences as a stuck agent. A bearer token is held by
 * one agent that may well send two calls at once, so that sharing is real. What sharing must never
 * do is let a request that has gone decide the question for one that is still there — or, once
 * EVERY waiter has gone, let a late click decide it for nobody (`PLAN_wsl_bridge_outlives_its_client.md`
 * §5.7).</p>
 *
 * <p>So each waiter joins with its own request's signal and <b>detaches the moment it fires</b>: its
 * request ends then, rather than when somebody eventually clicks. The prompt itself cannot be
 * closed — VS Code offers no way to dismiss a modal from code — so it stays, defused: the code that
 * asked is handed `stillWanted`, and applies the answer only while a live waiter is still attached
 * (the owner's decision of 2026-10-09, §3.3).</p>
 *
 * <p>Pure and `vscode`-free, so every ordering here is a unit test.</p>
 */

/** What a waiter is answered with when its own request ended before the person did. */
export const ABANDONED = 'abandoned';

/**
 * Ask the person. `stillWanted` answers whether any request is still waiting — read it AFTER the
 * answer arrives and before acting on it. The promise must settle by itself (a timeout included).
 */
export type Ask<T> = (stillWanted: () => boolean) => Promise<T>;

interface OpenPrompt<T> {
  readonly answer: Promise<T>;
  /** The signals of the requests waiting on it right now. A waiter leaves when its signal fires. */
  readonly waiting: Set<AbortSignal>;
}

export class SharedPrompts<T> {
  private readonly open = new Map<string, OpenPrompt<T>>();

  /**
   * Wait for the prompt open under `key` — raising it with `ask` when there is none — or for this
   * request to end, whichever comes first.
   *
   * <p>A request that has already ended neither joins nor raises anything.</p>
   */
  join(key: string, signal: AbortSignal, ask: Ask<T>): Promise<T | typeof ABANDONED> {
    if (signal.aborted) {
      return Promise.resolve(ABANDONED);
    }
    const prompt = this.open.get(key) ?? this.raise(key, ask);
    prompt.waiting.add(signal);
    return new Promise((resolve, reject) => {
      const leave = (): void => {
        prompt.waiting.delete(signal);
        resolve(ABANDONED);
      };
      signal.addEventListener('abort', leave, { once: true });
      const settle = (): void => {
        signal.removeEventListener('abort', leave);
        prompt.waiting.delete(signal);
      };
      prompt.answer.then(
        (value) => {
          settle();
          resolve(value);
        },
        (error: unknown) => {
          settle();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  /** Whether a prompt is open under `key` — for tests and for nothing that decides anything. */
  isOpen(key: string): boolean {
    return this.open.has(key);
  }

  private raise(key: string, ask: Ask<T>): OpenPrompt<T> {
    const waiting = new Set<AbortSignal>();
    // Read when the answer lands: a waiter leaves the set only by its own signal firing (or after the
    // answer reached it), so at that moment the set holds exactly the requests still listening.
    const stillWanted = (): boolean => [...waiting].some((signal) => !signal.aborted);
    const prompt: OpenPrompt<T> = { answer: ask(stillWanted), waiting };
    this.open.set(key, prompt);
    const forget = (): void => {
      if (this.open.get(key) === prompt) {
        this.open.delete(key);
      }
    };
    prompt.answer.then(forget, forget);
    return prompt;
  }
}
