/**
 * The page's half of the second-value control: the box appears when the mode says `own`.
 *
 * <p>One fragment for every form that has the control, because the behaviour is the same wherever it
 * is: a `.secondMode` select governs every `.secondRow` inside ITS OWN fieldset. That scoping is not
 * decoration — one page carries two of these controls, the password's and the payment section's, and
 * a fragment that took the first one would let the password's answer govern a card's boxes. Nothing
 * here knows which fields exist: the rows are found by class, so a seventh weave point works on the
 * day its markup is emitted and not a commit later.</p>
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
    var show = mode === 'own' && row.getAttribute('data-second-off') !== 'yes';
    var input = row.querySelector('input');
    row.style.display = show ? '' : 'none';
    if (!show && input) { input.value = ''; }
  }
  function secondRowsUnder(picked) {
    var scope = picked.closest('fieldset');
    var rows = (scope || document).querySelectorAll('.secondRow');
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
