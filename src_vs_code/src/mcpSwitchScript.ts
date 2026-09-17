import { McpAccess, answersLadder, answersPolicy } from './mcpAccess';
import { jsonForScript } from './webviewHtml';
import { MCP_ASK_CHOICES } from './mcpSwitches';
/**
 * The Agent-access switches, as the browser runs them.
 *
 * <p>Its own module for the reason `depPickerScript.ts` has one: `entityFormScript.ts` sits
 * against an 800-line ceiling, and a browser program pasted into it pushes it over. It returns a
 * FRAGMENT that runs inside the page's one script, beside `chk()` and the save handler it
 * contributes a field to.</p>
 *
 * <p>The record itself is the only host value that crosses into it, and it carries the distinction
 * the whole model rests on: an entry whose `mcp` field is ABSENT follows its folder, and one
 * whose field is present has decided for itself — even when the decision is "nothing". Without
 * it, opening a form and pressing Save would silently convert every inheriting entry into one
 * that had opted out.</p>
 *
 * <p><b>Per AXIS, since #95.</b> The record answers two questions — the permission ladder and the
 * consent cadence — and `answersLadder`/`answersPolicy` are asked here rather than by each host
 * page, so both host files stay the length they are. Emitting one axis because the other was
 * touched is the regression `mcpAccess.ts` calls out: a folder handed an all-off ladder because
 * somebody chose a cadence is a folder whose children have silently stopped inheriting from
 * above.</p>
 */
// One template literal, like the picker and the page script: a browser program that reads top to
// bottom, and slicing it to satisfy a line budget would join it back together with string
// concatenation — harder to read, and harder for the test that parses it.
// eslint-disable-next-line max-lines-per-function
export function mcpSwitchScript(mcp: McpAccess | undefined): string {
  const ladderDecided = answersLadder(mcp);
  const policyDecided = answersPolicy(mcp);
  // What a page with no radio group must keep posting. `null` is unreachable here — a record with
  // no policy cannot be policy-decided — and it is the honest literal for "nothing to keep".
  //
  // Through `jsonForScript`, not `JSON.stringify`: the type says `McpAskPolicy` but the VALUE comes
  // off a vault record that arrived by sync or by import, and `JSON.stringify` escapes quotes while
  // leaving `</script>` alone — which ends the inline script tag and parses the rest as markup.
  const decidedAsk = mcp?.ask === undefined ? 'null' : jsonForScript(mcp.ask);
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
  // The consent cadence (#95): a SECOND axis over the same object, and the reason there are two
  // touched flags below rather than one.
  var MCP_ASK_IDS = ${jsonForScript(MCP_ASK_CHOICES.map((choice) => choice.id))};

  // Three answers, and the third is the one that matters. The chosen policy; null when Inherit is
  // picked, because JSON.stringify DROPS undefined and the reader has to see the key to know the
  // answer was taken back; and undefined when this page has no radios at all — which is not a
  // choice anybody made, and must never be written down as one.
  function mcpAskValue() {
    var present = false;
    for (var i = 0; i < MCP_ASK_IDS.length; i++) {
      var el = document.getElementById(MCP_ASK_IDS[i]);
      if (el) {
        present = true;
        if (el.checked) { return el.value === 'inherit' ? null : el.value; }
      }
    }
    return present ? null : undefined;
  }

  // What to post for the policy. A page with no radios keeps what the record already said:
  // answering null there would take back a policy nobody was offered the chance to change.
  function mcpAsk() {
    var chosen = mcpAskValue();
    return chosen === undefined ? ${decidedAsk} : chosen;
  }

  // Absent means "ask the folder"; an object with everything off means "decided here, and the
  // answer is nothing". Once anybody touches a control, this record has decided — but PER AXIS:
  // a ladder written because somebody chose a cadence is a folder that has silently stopped its
  // children inheriting rights from above, which is the regression this pair of flags prevents.
  var mcpLadderTouched = false;
  var mcpPolicyTouched = false;
  function collectMcp() {
    var ladder = mcpLadderTouched || ${ladderDecided};
    var policy = mcpPolicyTouched || ${policyDecided};
    if (!ladder && !policy) { return undefined; }
    var out = {};
    if (ladder) {
      var scope = chk('mcpDeleteAny') ? 'any' : (chk('mcpDeleteOwn') ? 'own' : undefined);
      var folderScope = chk('mcpFolderDeleteAny') ? 'any'
                      : (chk('mcpFolderDeleteOwn') ? 'own' : undefined);
      out.view = chk('mcpView'); out.use = chk('mcpUse'); out.edit = chk('mcpEdit');
      out.create = chk('mcpCreate'); out.delete = scope;
      out.folderEdit = chk('mcpFolderEdit'); out.folderCreate = chk('mcpFolderCreate');
      out.folderDelete = folderScope;
    }
    if (policy) { out.ask = mcpAsk(); }
    return out;
  }
  (function () {
    var ids = MCP_RUNGS.concat(MCP_DELETES, ['mcpFolderEdit', 'mcpFolderCreate'], MCP_FOLDER_DELETES);
    for (var i = 0; i < ids.length; i++) {
      (function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.addEventListener('change', function () { mcpLadderTouched = true; mcpApplyLadder(id); });
        }
      })(ids[i]);
    }
    for (var r = 0; r < MCP_ASK_IDS.length; r++) {
      var radio = document.getElementById(MCP_ASK_IDS[r]);
      if (radio) {
        radio.addEventListener('change', function () { mcpPolicyTouched = true; });
      }
    }
    mcpApplyLadder('');
  })();

`;
}
