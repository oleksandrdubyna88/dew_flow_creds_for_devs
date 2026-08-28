/**
 * The Agent-access switches, as the browser runs them.
 *
 * <p>Its own module for the reason `depPickerScript.ts` has one: `entityFormScript.ts` sits
 * against an 800-line ceiling, and a browser program pasted into it pushes it over. It returns a
 * FRAGMENT that runs inside the page's one script, beside `chk()` and the save handler it
 * contributes a field to.</p>
 *
 * <p>`decidedHere` is the only host value that crosses into it, and it carries the distinction
 * the whole model rests on: an entry whose `mcp` field is ABSENT follows its folder, and one
 * whose field is present has decided for itself — even when the decision is "nothing". Without
 * it, opening a form and pressing Save would silently convert every inheriting entry into one
 * that had opted out.</p>
 */
// One template literal, like the picker and the page script: a browser program that reads top to
// bottom, and slicing it to satisfy a line budget would join it back together with string
// concatenation — harder to read, and harder for the test that parses it.
// eslint-disable-next-line max-lines-per-function
export function mcpSwitchScript(decidedHere: boolean): string {
  return `
  // ---- agent access ------------------------------------------------------
  // TWO ladders over two objects, meeting at the bottom rung. Ticking a rung turns on everything
  // below it and locks those, so "may rename it but may not see it" cannot be assembled by
  // clicking any more than its entry-side twin can.
  var MCP_RUNGS = ['mcpView', 'mcpUse', 'mcpEdit', 'mcpCreate'];
  var MCP_FOLDER_RUNGS = ['mcpView', 'mcpFolderEdit', 'mcpFolderCreate'];
  var MCP_DELETES = ['mcpDeleteAny', 'mcpDeleteOwn'];
  var MCP_FOLDER_DELETES = ['mcpFolderDeleteAny', 'mcpFolderDeleteOwn'];

  function mcpHighest(rungs, deletes) {
    var highest = -1;
    for (var i = 0; i < rungs.length; i++) { if (chk(rungs[i])) { highest = i; } }
    for (var d = 0; d < deletes.length; d++) { if (chk(deletes[d])) { highest = rungs.length; } }
    return highest;
  }
  // Only ever ADDS a constraint. mcpView belongs to both ladders, and a pass that re-enabled it
  // would undo the other ladder's lock — every rung is freed once, up front, instead.
  function mcpLock(rungs, highest) {
    for (var j = 0; j < rungs.length; j++) {
      var el = document.getElementById(rungs[j]);
      if (el && j < highest) { el.checked = true; el.disabled = true; }
    }
  }
  // The two scopes of one delete are exclusive: "anything" already includes "what it created".
  function mcpExclusive(changedId, wide, narrow) {
    if (changedId === wide && chk(wide)) {
      var n = document.getElementById(narrow);
      if (n) { n.checked = false; }
    }
    if (changedId === narrow && chk(narrow)) {
      var w = document.getElementById(wide);
      if (w) { w.checked = false; }
    }
  }
  function mcpApplyLadder(changedId) {
    var every = MCP_RUNGS.concat(['mcpFolderEdit', 'mcpFolderCreate']);
    for (var i = 0; i < every.length; i++) {
      var el = document.getElementById(every[i]);
      if (el) { el.disabled = false; }
    }
    mcpLock(MCP_RUNGS, mcpHighest(MCP_RUNGS, MCP_DELETES));
    mcpLock(MCP_FOLDER_RUNGS, mcpHighest(MCP_FOLDER_RUNGS, MCP_FOLDER_DELETES));
    mcpExclusive(changedId, 'mcpDeleteAny', 'mcpDeleteOwn');
    mcpExclusive(changedId, 'mcpFolderDeleteAny', 'mcpFolderDeleteOwn');
    mcpPaintBar();
  }
  // Five stripes, the entry ladder's. The folder rungs are not in the bar — every bit doubles the
  // generated glyph set, and the badge answers a question about this row's credential.
  function mcpPaintBar() {
    var on = [chk('mcpView'), chk('mcpUse'), chk('mcpEdit'), chk('mcpCreate'),
              chk('mcpDeleteAny') || chk('mcpDeleteOwn')];
    var segs = document.querySelectorAll('.mcpSeg');
    for (var i = 0; i < segs.length && i < on.length; i++) {
      segs[i].className = segs[i].className.replace(' mcpSegOn', '') + (on[i] ? ' mcpSegOn' : '');
    }
  }
  // Absent means "ask the folder"; an object with everything off means "decided here, and the
  // answer is nothing". Once anybody touches a switch, this entry has decided.
  var mcpTouched = false;
  function collectMcp() {
    if (!mcpTouched && !${decidedHere}) { return undefined; }
    var scope = chk('mcpDeleteAny') ? 'any' : (chk('mcpDeleteOwn') ? 'own' : undefined);
    var folderScope = chk('mcpFolderDeleteAny') ? 'any'
                    : (chk('mcpFolderDeleteOwn') ? 'own' : undefined);
    return { view: chk('mcpView'), use: chk('mcpUse'), edit: chk('mcpEdit'),
             create: chk('mcpCreate'), delete: scope,
             folderEdit: chk('mcpFolderEdit'), folderCreate: chk('mcpFolderCreate'),
             folderDelete: folderScope };
  }
  (function () {
    var ids = MCP_RUNGS.concat(MCP_DELETES, ['mcpFolderEdit', 'mcpFolderCreate'], MCP_FOLDER_DELETES);
    for (var i = 0; i < ids.length; i++) {
      (function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.addEventListener('change', function () { mcpTouched = true; mcpApplyLadder(id); });
        }
      })(ids[i]);
    }
    mcpApplyLadder('');
  })();

`;
}
