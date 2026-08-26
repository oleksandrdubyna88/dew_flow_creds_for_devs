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
  // A ladder: ticking a rung turns on everything below it and locks those, so the state
  // "may change it but may not see it" cannot be assembled by clicking.
  var MCP_RUNGS = ['mcpView', 'mcpUse', 'mcpEdit', 'mcpCreate'];
  function mcpApplyLadder(changedId) {
    var highest = -1;
    for (var i = 0; i < MCP_RUNGS.length; i++) {
      if (chk(MCP_RUNGS[i])) { highest = i; }
    }
    if (chk('mcpDeleteAny') || chk('mcpDeleteOwn')) { highest = MCP_RUNGS.length; }
    for (var j = 0; j < MCP_RUNGS.length; j++) {
      var el = document.getElementById(MCP_RUNGS[j]);
      if (!el) { continue; }
      if (j < highest) { el.checked = true; el.disabled = true; } else { el.disabled = false; }
    }
    // The two delete scopes are exclusive: "anything" already includes "what it created".
    if (changedId === 'mcpDeleteAny' && chk('mcpDeleteAny')) {
      var own = document.getElementById('mcpDeleteOwn');
      if (own) { own.checked = false; }
    }
    if (changedId === 'mcpDeleteOwn' && chk('mcpDeleteOwn')) {
      var any = document.getElementById('mcpDeleteAny');
      if (any) { any.checked = false; }
    }
    mcpPaintBar();
  }
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
    return { view: chk('mcpView'), use: chk('mcpUse'), edit: chk('mcpEdit'),
             create: chk('mcpCreate'), delete: scope };
  }
  (function () {
    var ids = MCP_RUNGS.concat(['mcpDeleteOwn', 'mcpDeleteAny']);
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
