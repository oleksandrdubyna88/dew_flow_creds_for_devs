import type { ErrorCode } from './brokerProtocol';
import { BridgedCallFiles, BridgedSshConfigWriter, bridgedSpawn } from './bridgedSshCall';
import type { ClientVerdict } from './bridgedSshClient';
import { sentences } from './bridgedSshSentences';
import { sshSpawnLaunch } from './sshProgram';
import type { JumpChain } from './sshOptions';
import type { SshExecAuth } from './sshExecCommand';
import type { EntityMetadata } from './types';
import type { OverSshCall, UseActionContext, UseActionResult } from './useActions';

/**
 * The bridged half of `execOverSsh` (E1.6, B7), taken out of `sshUseActions.ts`, which is the file the road stays readable in: the writer makes
 * the files of the call from the hop entries the chain walk gave, `bridgedSpawn` builds the argv, the environment and the folder from them, and a
 * refusal of either is a journal sentence and the generic body (`refuse` says it that way). The files are handed to `held` the moment they exist,
 * so the caller's `finally` removes them whatever happens next.
 */

/** What `runSshExec` is started with: the argv, the program, the environment and, on a bridge only, the folder of the per-call file. */
export interface Launch {
  readonly argv: string[];
  readonly program: string;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd?: string;
}

export type BridgedFiles = Extract<BridgedCallFiles, { ok: true }>;

/** What is known of the call when it launches: the destination's credential, as `prepareAuth` resolved it. */
interface Prepared {
  readonly keyPath?: string;
  readonly env: NodeJS.ProcessEnv;
  readonly auth: SshExecAuth;
}

type Refuse = (code: ErrorCode, message: string) => UseActionResult;

/** The hop entries of a chain, or `undefined` when the chain has a `-J` text and no entries to write blocks for (R9). */
function hopsOf(chain: Extract<JumpChain, { ok: true }>): readonly EntityMetadata[] | undefined {
  return chain.value !== undefined && chain.hops === undefined ? undefined : (chain.hops ?? []);
}

/** The program the call's `ssh` is started as: the check asks THIS one for its version, and the call then runs it. */
const programOf = (call: OverSshCall): string => sshSpawnLaunch(call.ssh, undefined, process.platform).program;

function launchOf(call: OverSshCall, prepared: Prepared, files: BridgedFiles, refuse: Refuse): Launch | UseActionResult {
  const spawn = bridgedSpawn({
    destination: call.ssh, keyPath: prepared.keyPath, auth: prepared.auth, askpassEnv: prepared.env, remoteCommand: call.remoteCommand,
    files, sourceEnv: process.env, platform: process.platform,
  });
  if (spawn === undefined) {
    return refuse('no_credential', sentences.argvRefused(call.ssh.name));
  }
  return { argv: spawn.argv, program: programOf(call), env: spawn.env, cwd: spawn.cwd };
}

/**
 * The launch of a call on a bridge, or the refusal. `writer` and `client` are the deps `unguardedBridge` proved present; `client` asks the `ssh` of
 * a program for its version, and the writer calls it after pass 1 and before it writes a file.
 */
export async function bridgedLaunch(
  parts: {
    writer: BridgedSshConfigWriter;
    client: (program: string) => Promise<ClientVerdict>;
    ctx: UseActionContext;
    call: OverSshCall;
    prepared: Prepared;
    chain: Extract<JumpChain, { ok: true }>;
    refuse: Refuse;
  },
  held: { files?: BridgedFiles },
): Promise<Launch | UseActionResult> {
  const { writer, client, ctx, call, prepared, chain, refuse } = parts;
  const hops = hopsOf(chain);
  if (hops === undefined) {
    return refuse('internal', sentences.noHopEntries());
  }
  const beforeFiles = async (): Promise<string | undefined> => {
    const verdict = await client(programOf(call));
    return verdict.ok ? undefined : verdict.sentence;
  };
  const files = await writer({ accountId: ctx.accountId, destination: call.ssh, auth: prepared.auth, keyPath: prepared.keyPath, hops, beforeFiles });
  if (!files.ok) {
    return refuse(files.code, files.reason);
  }
  held.files = files;
  return launchOf(call, prepared, files, refuse);
}

export const isResult = (value: Launch | UseActionResult): value is UseActionResult => 'status' in value;
