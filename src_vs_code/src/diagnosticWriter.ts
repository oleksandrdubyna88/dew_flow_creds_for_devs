/**
 * The writing half of the diagnostic channel, as a type a `vscode`-free module can depend on.
 *
 * <p>`diagnosticLog.ts` imports `vscode`, so a pure module that wanted to report something had the
 * choice of importing it anyway — breaking repository rule 3 — or declaring its own private sink
 * type, which is how one concept becomes three names. This is the third option, and it is why
 * `DiagnosticLog` now says `extends vscode.Disposable, DiagnosticWriter` rather than spelling the
 * three methods out.</p>
 *
 * <p>Narrower than the channel on purpose: a collaborator that takes this cannot show the channel,
 * dispose it or read its file path, so a test stands in for it with three functions and an array.</p>
 */
export interface DiagnosticWriter {
  info(source: string, message: string): void;
  warn(source: string, message: string): void;
  error(source: string, message: string): void;
}
