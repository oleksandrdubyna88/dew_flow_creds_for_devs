// ESLint is the enforcement for the size/complexity boundaries the repo rules state in prose
// (audit 2026-08-25, A2): no file over 800 lines, no function over 50 code lines, cyclomatic
// complexity at most 4, no console logging outside the CLI. Deliberately NOT a style linter —
// formatting stays with the compiler and code review; these four rules exist so that a NEW
// violation fails CI instead of becoming the next 3,000-line file.
//
// Where the code already violates a limit, the file carries an explicit `eslint-disable` with
// the rule named — the limit is a boundary for new code, not a rewrite mandate. Removing such
// a disable when the file shrinks below the limit is part of finishing the refactor (A1).
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'max-lines': ['error', { max: 800, skipBlankLines: false, skipComments: false }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 4],
      'no-console': 'error',
    },
  },
  {
    // Tests narrate: a test body reads top to bottom as one scenario, and slicing it into
    // helpers to satisfy a line count hides the story the test exists to tell. Files stay
    // bounded; complexity stays bounded; only the per-function length is relaxed.
    files: ['src/test/**/*.ts'],
    rules: {
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },
];
