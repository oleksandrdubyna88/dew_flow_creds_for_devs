import * as vscode from 'vscode';
import type { GrantLimits } from './grantRegistry';

/**
 * How long a grant lives, and how a person is told it did not.
 *
 * <p>Read per request rather than once, so changing the setting takes effect on the next call
 * instead of the next window. Defaults: an hour idle, no call cap — a token an agent is using
 * stays live; one it forgot about dies on its own.</p>
 *
 * <p>Out of `credsAgentServer.ts` because that file lives at its 800-line ceiling and this needs
 * nothing on it: it reads configuration and writes sentences.</p>
 */

export function grantLimits(): GrantLimits {
  const config = vscode.workspace.getConfiguration('credSshManager');
  const idleMinutes = Math.max(0, config.get<number>('agentGrantIdleMinutes', 60));
  const maxUses = Math.max(0, Math.floor(config.get<number>('agentGrantMaxCalls', 0)));
  return { idleMs: idleMinutes * 60_000, maxUses };
}

export function describeLimits(limits: GrantLimits): string {
  const parts: string[] = [];
  if (limits.idleMs > 0) {
    parts.push(`until it goes unused for ${Math.round(limits.idleMs / 60_000)} minutes`);
  }
  if (limits.maxUses > 0) {
    parts.push(`for at most ${limits.maxUses} calls`);
  }
  parts.push('and never past this window closing');
  return parts.join(', ');
}
