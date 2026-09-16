/**
 * The page's half of the second-value control: the box appears when the mode says `own`.
 *
 * <p>One fragment for every form that has the control, because the behaviour is the same wherever it
 * is: a `.secondMode` select governs every `.secondRow` that names the same SCOPE. That scoping is not
 * decoration — one page carries two of these controls, the password's and the payment section's, and
 * a fragment that took the first one would let the password's answer govern a card's boxes and empty
 * what somebody typed. The scope is in the markup rather than read off the page's shape, because the
 * shape changed once already: the payment boxes moved into the card and bank fieldsets while their
 * control stayed outside them. Nothing here knows which fields exist: the rows are found by class and
 * scope, so a seventh weave point works on the day its markup is emitted and not a commit later.</p>
 *
 * <p><b>A hidden box is also an emptied box.</b> Switching to a decoy after typing must not leave the
 * typed value sitting in a field the person can no longer see: it would still be read by the save,
 * and the value they thought they had discarded would be woven in. That is the kind of defect nobody
 * finds, because the form looks exactly right.</p>
 *
 * <p>Runs on load as well as on change, so a form restored with the mode already on `own` shows its
 * boxes rather than waiting for somebody to change something.</p>
 *
 * <p>Pure: a STRING, no `vscode`, no DOM at module level. It is pasted into a page's template
 * literal, so it must contain no backtick — asserted by its test.</p>
 */
export function secondModeScript(): string {
  return `
  function secondRowShown(row, mode) {
    // A field that is NOT being woven always has a box: a second value can be kept without weaving
    // anything, which is half of what the feature is for. The mode decides only for a field that IS
    // being woven, because that is the only case where there are two ways to get the other half.
    var woven = row.getAttribute('data-second-woven') === 'yes';
    var show = !woven || mode === 'own';
    var input = row.querySelector('input');
    row.style.display = show ? '' : 'none';
    if (!show && input) { input.value = ''; }
  }
  function secondRowsUnder(picked) {
    var scope = picked.getAttribute('data-second-scope') || '';
    var rows = document.querySelectorAll('.secondRow[data-second-scope="' + scope + '"]');
    for (var i = 0; i < rows.length; i++) { secondRowShown(rows[i], picked.value); }
  }
  function refreshSecondMode() {
    var pickers = document.querySelectorAll('.secondMode');
    for (var i = 0; i < pickers.length; i++) { secondRowsUnder(pickers[i]); }
  }
  (function () {
    var pickers = document.querySelectorAll('.secondMode');
    for (var i = 0; i < pickers.length; i++) { pickers[i].addEventListener('change', refreshSecondMode); }
    refreshSecondMode();
  })();
`;
}
