# A secret value cut in half by the output limit is not masked

> Status: **not started, a stub, 2026-11-27.** Found while building the Remote Bridge's 72-hour slice (S4, PR #392). It is older than
> that work: every action that returns a child's output has it. Nobody has seen it happen; it is read from the code.

## Symptom

A child's output is kept up to `MAX_STREAM_BYTES` (256 KiB, `src_vs_code/src/brokerProtocol.ts:22`) per stream. `Bounded.append`
(`src_vs_code/src/sshExecRunner.ts:73-97`) keeps the first 256 KiB and drops the rest, and the run is stopped
(`sshExecRunner.ts:183-189`). The masking runs afterwards, on the kept text: `maskText` (`src_vs_code/src/secretMasker.ts:111`) replaces
each WHOLE value it knows. When the cut falls inside a value, the kept text ends with the value's first bytes, no whole value is there,
and the first bytes go to the agent unmasked.

Every road that masks a body after the run has the same gap:

- the broker's mask of the grant's values on the way out (`src_vs_code/src/brokerResponse.ts:247`);
- the second pass for values only the run knows (`src_vs_code/src/storedRun.ts:79-80`; a bridged run's resolved `creds://` values and
  the bridge's own SSH entry, `src_vs_code/src/bridgedRun.ts`);
- `rotate`'s answer (`src_vs_code/src/rotateAction.ts:213`).

The leak is bounded by the value's length minus one byte, and it needs the child to print the value across the 256 KiB mark. A child
that prints a value on purpose (an agent's script that echoes it) can place it there.

## Fix ideas (none chosen)

1. **Mask the tail at a cut.** When a stream's `…Truncated` flag is true, after the whole-value pass, find the longest suffix of the
   kept text that is a proper prefix of any mask needle, and replace it with the needle's placeholder. A one-byte match then masks one
   byte of innocent text at the very end of a cut output: that fails in the safe direction.
2. **Cut on a character boundary first.** `Bounded.text()` decodes a byte cut as UTF-8, so a cut inside a multi-byte character ends
   with U+FFFD, and a prefix match on a non-ASCII value would miss. Trim the kept bytes to a whole character before decoding, or match on
   bytes.
3. **Keep a margin.** Keep `MAX_STREAM_BYTES + longest needle` bytes, mask, then cut to `MAX_STREAM_BYTES` after the mask. Simpler to
   reason about; the cut then can fall inside a placeholder, which needs its own rule.

## Test plan

- A child that prints `256 KiB − k` bytes of filler and then a value, for k from 1 to the value's length − 1, on stdout and on
  stderr: the answer holds none of the value's first k bytes. RED first on today's code.
- The same with a non-ASCII value whose cut falls inside a character.
- The broker road, the stored-run road and `rotate`, each once.
- An output with no value near the cut is returned byte for byte (no false mask in the middle).

## Definition of done

The tests above pass on every road listed under *Symptom*; the CHANGELOG names the fix under Security; this plan moves to `research/`.
