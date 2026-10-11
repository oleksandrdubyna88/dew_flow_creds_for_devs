// Lowers this process — and every worker it starts — through the shared rules' one implementation
// (common/local-cpu-budget.md). Copied verbatim from the conventions repository's
// tools/templates/lower-priority-preload.mjs; only the MOUNT line differs per repository.
//
//   node --import ./scripts/lower-priority.mjs --test --test-concurrency=8
//
// An ABSENT mount is CI's normal state: CI checks no submodule out, and CI is exempt. Absent means
// the mount folder is missing or empty — an uninitialised submodule leaves an empty folder. Then
// nothing is lowered, and locally the preload says so once. Anything else fails the run loudly:
// a mount that has content but no tool is a stale checkout, and a tool that does not load is broken.
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MOUNT = new URL("../../.claude/rules/shared/", import.meta.url);

const tool = new URL("tools/low-priority.mjs", MOUNT);
const mountIsAbsent = () => !existsSync(MOUNT) || readdirSync(MOUNT).length === 0;

if (existsSync(tool)) {
  (await import(tool.href)).lowerOwnPriority();
} else if (!mountIsAbsent()) {
  throw new Error(`low-priority: ${fileURLToPath(MOUNT)} has content but no tools/low-priority.mjs — the submodule is stale (git submodule update)`);
} else if (!process.env.CI && !process.env.LOW_PRIORITY_PRELOAD_NOTICE) {
  process.env.LOW_PRIORITY_PRELOAD_NOTICE = "1";
  process.stderr.write(`low-priority: ${fileURLToPath(MOUNT)} is absent (git submodule update --init) — this run is NOT lowered\n`);
}
