import { CredsAction, CredsProduct } from './credsInstall';

/**
 * The sentence above the buttons, for one product on this machine.
 *
 * <p>Every branch is a different situation and deserves its own words. "There is no build for
 * macOS" is not a failure to retry, and "the record says 0.1.0 but the file is gone" is not the
 * same as "0.1.0 is installed" — a menu that said so would offer nothing while nothing runs.
 * One sentence per situation, in a table rather than a switch, so adding a situation is a row.</p>
 */
const WORDS: { [K in CredsAction['kind']]: (product: CredsProduct, action: Extract<CredsAction, { kind: K }>) => string } = {
  unsupported: (product, action) =>
    `There is no ${product.label} build for ${action.platform} yet — the release carries Windows and Linux, on x64 and arm64.`,
  unavailable: (product, action) =>
    `Cannot tell what is published (${action.reason}). ${product.label} is not installed.`,
  install: (product, action) =>
    `${product.label} ${action.version} is available. It goes into this extension's own storage, not onto your PATH.`,
  update: (product, action) => `${product.label} ${action.from} is installed; ${action.to} is published.`,
  reinstall: (product) => `${product.label} was installed but the file is gone — something removed it.`,
  installed: (product, action) => `${product.label} ${action.version} is installed.`,
};

export function describeInstall(product: CredsProduct, action: CredsAction): string {
  return (WORDS[action.kind] as (p: CredsProduct, a: CredsAction) => string)(product, action);
}
