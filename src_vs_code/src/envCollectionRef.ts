import * as vscode from 'vscode';

/**
 * The window's environment-variable collection, kept where every command module can reach it.
 * Set once in `activate`; read where a secret is exposed as a terminal variable or the bindings
 * of an entry are re-applied. It used to be a module-level `let` in `extension.ts`, which is the
 * one place a function moved out of that file could not see.
 */
let collection: vscode.GlobalEnvironmentVariableCollection | undefined;

export function setEnvCollection(value: vscode.GlobalEnvironmentVariableCollection): void {
  collection = value;
}

export function envCollection(): vscode.GlobalEnvironmentVariableCollection {
  if (collection === undefined) {
    throw new Error('The environment collection is read before activate set it.');
  }
  return collection;
}
