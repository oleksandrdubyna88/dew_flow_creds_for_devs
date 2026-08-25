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
    // A disable that has stopped being needed is an exemption nobody granted: once a refactor
    // brings a function under the limit, or a file under 800 lines, the stale marker would keep
    // exempting it silently and the code could grow back with no signal. Making that an error
    // is what turns "remove the disable when it is no longer needed" from prose into a check.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
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
      // `describeError` exists so the next refinement to how an error reads happens
      // everywhere at once. That is only true while nothing spells the ternary inline —
      // the sweep that created it had already missed two call sites by the time it landed.
      'no-restricted-syntax': [
        'error',
        {
          // Only the MESSAGE form. `x instanceof Error ? x : new Error(String(x))` normalizes
          // an unknown into an Error object, which is a different job and stays allowed.
          selector:
            "ConditionalExpression[test.operator='instanceof'][test.right.name='Error'][consequent.property.name='message']",
          message: "Use describeError(error) from './describeError' instead of spelling this inline.",
        },
      ],
    },
  },
  {
    // The one place the ternary belongs — it IS the rule the others must call.
    files: ['src/describeError.ts'],
    rules: { 'no-restricted-syntax': 'off' },
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
