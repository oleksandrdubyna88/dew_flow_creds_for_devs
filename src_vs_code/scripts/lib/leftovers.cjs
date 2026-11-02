'use strict';
// SKELETON of the E2.1.S1 wrapper: the names the types declare, with no bodies. The tests of
// `src/test/leftoversWrapper.test.ts` are written against these names and watched failing here first.
const notYet = (name) => () => {
  throw new Error(`leftovers.${name}: not implemented (E2.1.S1)`);
};

module.exports = {
  REPO_TOKEN: undefined,
  REPO_ROW: undefined,
  ownedName: notYet('ownedName'),
  ownedPattern: notYet('ownedPattern'),
  ownedDir: notYet('ownedDir'),
  cleanupScope: notYet('cleanupScope'),
  tempRoot: notYet('tempRoot'),
  removeQuietly: notYet('removeQuietly'),
  readOwner: notYet('readOwner'),
  ownerState: notYet('ownerState'),
  isMine: notYet('isMine'),
  thisOwner: notYet('thisOwner'),
  thisOwnerToken: notYet('thisOwnerToken'),
  formatOwner: notYet('formatOwner'),
  runRecord: notYet('runRecord'),
  shortSocketRoot: notYet('shortSocketRoot'),
  ownedFile: notYet('ownedFile'),
  writeStub: notYet('writeStub'),
};
