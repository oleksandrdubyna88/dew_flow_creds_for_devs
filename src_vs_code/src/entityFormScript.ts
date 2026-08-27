import { MAX_ATTACHMENT_BYTES, fileNameRegex, imageNameRegex } from './attachment';
import { renderForward } from './sshOptions';
import { jsonForScript } from './webviewHtml';
import { CommandArg, EntityMetadata, PortForward } from './types';
import { DependencyFolderCandidate, DependencyRow } from './depGraph';
import { dependencyPickerScript } from './depPickerScript';
import { mcpSwitchScript } from './mcpSwitchScript';
import { configTabsScript } from './configTabsScript';
import { qrPasteScript } from './qrPasteScript';
import { generateWiring } from './entityFormScriptGen';
import { formVisibilityScript } from './formVisibilityScript';

/** What the Depends-on picker needs, gathered once when the page is built. */
export interface DependencyPickerData {
  rows: DependencyRow[];
  folders: DependencyFolderCandidate[];
  colors: Record<string, string>;
}

/**
 * The entity form's inline page script.
 *
 * <p>Split out of `entityFormPage.ts` (audit A1's tail, second cut): the markup and the
 * behaviour are different jobs, and together they put the page module back over the 800-line
 * limit that splitting the form was meant to clear. The text is moved verbatim; only this
 * wrapper and its five inputs are new.</p>
 *
 * <p>It runs inside the webview, so it is plain browser JavaScript in a template string — not
 * TypeScript, and never type-checked by the compiler. That is exactly why
 * `webviewHtml.test.ts` PARSES it: the template-string-inside-a-CSS-comment trap (a backtick
 * in a comment ends the template) and a typo in `updateLifetimeChoices` are both red tests
 * rather than a form that fails to open.</p>
 *
 * <p>The only host values that cross into it are the CSP nonce and the two argument lists;
 * no secret is ever interpolated here — see the page module's note on what the form does and
 * does not send into the webview.</p>
 */

/** One list of rows as a JSON literal; an absent list is an empty one, never `undefined`. */
function rowsJson(rows: CommandArg[] | undefined): string {
  return jsonForScript(rows ?? []);
}

/**
 * The forwarding rows, as the editor edits them.
 *
 * <p>A rule is edited as the compact `port:host:hostport` text people already have in their
 * heads and in their `~/.ssh/config`, so a stored rule is rendered back into that one field
 * rather than four.</p>
 */
function forwardsJson(forwards: PortForward[] | undefined): string {
  return jsonForScript(
    (forwards ?? []).map((forward) => ({
      kind: forward.kind,
      rule: renderForward(forward)[1],
      disabled: forward.disabled === true,
    })),
  );
}

/**
 * The two row lists the page starts with.
 *
 * <p>Named and separate so the builder below stays a template and nothing else: these are the
 * only host VALUES that cross into the page, and gathering them here is what makes "no secret
 * is interpolated into the script" checkable by reading three lines instead of five hundred.</p>
 */
function initialRows(d: EntityMetadata | undefined): { args: string; scriptVars: string; forwards: string } {
  return {
    args: rowsJson(d?.commandArgs),
    scriptVars: rowsJson(d?.scriptVars),
    forwards: forwardsJson(d?.portForwards),
  };
}

// One template literal, so it is one "function" only in the way TypeScript counts. Splitting
// it to satisfy a line budget would cut a browser program that reads top to bottom into
// fragments joined by string concatenation — strictly harder to read and to parse in the
// test that parses it. This is the exception the limit exists to make deliberate.
// eslint-disable-next-line max-lines-per-function
export function formPageScript(
  nonce: string,
  d: EntityMetadata | undefined,
  // Defaulted so a caller that has no candidates to offer — and the script tests, which are
  // about the generated program rather than about this feature — get a picker with an empty
  // list rather than a page that fails to build. The real page always passes them.
  picker: DependencyPickerData = { rows: [], folders: [], colors: {} },
): string {
  const rows = initialRows(d);
  return `<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const INITIAL_ARGS = ${rows.args};
  const INITIAL_SCRIPT_VARS = ${rows.scriptVars};
  const INITIAL_FORWARDS = ${rows.forwards};
  const val = (id) => document.getElementById(id)?.value ?? '';
  const chk = (id) => document.getElementById(id)?.checked === true;
  const setError = (text) => { document.getElementById('error').textContent = text; };

  // Any script failure must be VISIBLE, never a silently dead form.
  window.addEventListener('error', (e) => setError('Form script error: ' + e.message));

  // ---- one type, one visible section ----
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) { el.style.display = visible ? '' : 'none'; }
  };
  ${formVisibilityScript()}

  // The broker never serves a key pair, so "until an agent uses it once" could never fire for
  // an sshkey — the entry would sit in the vault forever while the label promised otherwise.
  // The write path drops the policy anyway; hiding it here is so nobody is offered a choice
  // that would be silently discarded. A temporary key for a customer's box is the first thing
  // anyone reaches for, which is why it must not merely be documented.
  function updateLifetimeChoices(kind) {
    var select = document.getElementById('lifetime');
    if (!select) { return; }
    var allowed = kind !== 'sshkey';
    for (var i = 0; i < select.options.length; i++) {
      var option = select.options[i];
      if (option.getAttribute('data-policy') !== 'oneUse') { continue; }
      option.hidden = !allowed;
      option.disabled = !allowed;
      if (!allowed && option.selected) {
        select.value = 'forever';
      }
    }
  }

  ${mcpSwitchScript(d?.mcp !== undefined)}

  ${dependencyPickerScript(picker)}

  ${configTabsScript()}

  // ---- argument rows -------------------------------------------------------
  // Built from data rather than from markup: add, remove and reorder then have ONE
  // implementation, and the saved payload is read from the same array the UI edits
  // instead of from a DOM scrape that drifts the first time the markup changes.
  var argRows = INITIAL_ARGS.slice();
  

  function renderArgs() {
    var host = document.getElementById('argRows');
    host.textContent = '';
    argRows.forEach(function (row, index) {
      var wrap = document.createElement('div');
      wrap.className = 'argRow';

      var top = document.createElement('div');
      top.className = 'argTop';

      var on = document.createElement('input');
      on.type = 'checkbox';
      on.checked = row.disabled !== true;
      on.title = 'Include this argument in the command';
      on.addEventListener('change', function () {
        argRows[index].disabled = !on.checked;
        renderArgs();
      });

      var value = document.createElement('input');
      value.type = 'text';
      value.value = row.value;
      value.placeholder = '--sso-session OD-org';
      value.spellcheck = false;
      value.addEventListener('input', function () {
        argRows[index].value = value.value;
        updatePreview();
      });

      var up = document.createElement('button');
      up.type = 'button';
      up.className = 'secondary';
      up.textContent = '↑';
      up.title = 'Move up';
      up.disabled = index === 0;
      up.addEventListener('click', function () {
        var moved = argRows.splice(index, 1)[0];
        argRows.splice(index - 1, 0, moved);
        renderArgs();
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = '✕';
      remove.title = 'Remove this argument';
      remove.addEventListener('click', function () {
        argRows.splice(index, 1);
        renderArgs();
      });

      top.appendChild(on);
      top.appendChild(value);
      top.appendChild(up);
      top.appendChild(remove);

      // The explanation sits UNDER its own argument, which is the whole point: the
      // thing worth writing down is what this value means, not what the command does.
      var note = document.createElement('input');
      note.type = 'text';
      note.className = 'argNote';
      note.value = row.note || '';
      note.placeholder = 'what it means — e.g. the SSO profile in ~/.aws/config';
      note.spellcheck = false;
      note.addEventListener('input', function () {
        argRows[index].note = note.value;
      });

      wrap.appendChild(top);
      wrap.appendChild(note);
      host.appendChild(wrap);
    });
    updatePreview();
  }

  function updatePreview() {
    var base = (val('command') || '').trim();
    var parts = argRows
      .filter(function (r) { return r.disabled !== true; })
      .map(function (r) { return (r.value || '').trim(); })
      .filter(function (r) { return r.length > 0; });
    var preview = document.getElementById('commandPreview');
    if (preview) {
      preview.value = base.length > 0 ? [base].concat(parts).join(' ') : '';
    }
  }

  (function wireArgs() {
    var add = document.getElementById('addArg');
    if (add) {
      add.addEventListener('click', function () {
        argRows.push({ value: '', note: '', disabled: false });
        renderArgs();
        var inputs = document.querySelectorAll('#argRows .argTop input[type=text]');
        if (inputs.length > 0) { inputs[inputs.length - 1].focus(); }
      });
    }
    var command = document.getElementById('command');
    if (command) {
      command.addEventListener('input', updatePreview);

      function askSplit() {
        var text = (command.value || '').trim();
        // Nothing to split out of a bare verb, and re-splitting on every keystroke would
        // fight the person typing.
        if (text.indexOf(' ') === -1) { return; }
        vscode.postMessage({ type: 'splitCommand', text: text });
      }

      // A paste is unambiguous — that is the whole gesture this feature is for. Blur
      // covers typing the line out by hand. Rows the user already filled in are never
      // replaced without asking.
      command.addEventListener('paste', function () { setTimeout(askSplit, 0); });
      command.addEventListener('change', function () {
        if (argRows.some(function (r) { return (r.value || '').trim().length > 0; })) { return; }
        askSplit();
      });
    }
    var split = document.getElementById('splitCmd');
    if (split) {
      split.addEventListener('click', function () {
        var text = ((document.getElementById('command') || {}).value || '').trim();
        if (text.length > 0) { vscode.postMessage({ type: 'splitCommand', text: text }); }
      });
    }

    window.addEventListener('message', function (event) {
      var msg = event.data || {};
      if (msg.type === 'splitResult') {
        var filled = argRows.filter(function (r) { return (r.value || '').trim().length > 0; });
        if (filled.length > 0 && !confirm('Replace the ' + filled.length + ' argument row(s) below with the pasted command?')) {
          return;
        }
        document.getElementById('command').value = msg.command;
        argRows = (msg.args || []).map(function (a) {
          return { value: a.value, note: a.note || '', disabled: false };
        });
        renderArgs();
      }
      if (msg.type === 'argNotes') {
        // Fill EMPTY notes only. Something the user wrote is never overwritten by a guess.
        (msg.notes || []).forEach(function (note, i) {
          if (argRows[i] && !(argRows[i].note || '').trim() && note) { argRows[i].note = note; }
        });
        if ((msg.notes || []).length > 0) { renderArgs(); }
        var hint = document.getElementById('splitHint');
        if (hint && msg.status) { hint.textContent = msg.status; }
      }
    });
    renderArgs();
  })();

  // Env-binding rows: toggling on mints the default name from the CURRENT entity name;
  // a name the user edited is kept. Toggling off hides the input, and the save's diff
  // deletes the variable from the collection.
  function envDefaultName(field) {
    var flat = (val('name') || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
    return 'ENV_' + (flat.length > 0 ? flat : 'ENTITY') + '_' + field.toUpperCase();
  }
  function collectEnvBindings() {
    var out = {};
    document.querySelectorAll('.envRow').forEach(function (row) {
      var field = row.getAttribute('data-env-field');
      var on = document.getElementById('envOn_' + field);
      var name = document.getElementById('envName_' + field);
      if (on && on.checked && name && name.value.trim().length > 0) {
        out[field] = name.value.trim();
      }
    });
    return out;
  }
  document.querySelectorAll('.envRow').forEach(function (row) {
    var field = row.getAttribute('data-env-field');
    var on = document.getElementById('envOn_' + field);
    var name = document.getElementById('envName_' + field);
    if (!on || !name) { return; }
    on.addEventListener('change', function () {
      name.style.display = on.checked ? '' : 'none';
      if (on.checked && name.value.trim().length === 0) {
        name.value = envDefaultName(field);
      }
    });
  });

  document.getElementById('entityType').addEventListener('change', updateVisibility);
  document.getElementById('sshKeyEntityId').addEventListener('change', updateVisibility);
  updateVisibility();

  // ---- DB: connection string <-> parts, default port per type ----
  const DB_DEFAULT_PORTS = { postgres: '5432', mysql: '3306', mssql: '1433', mongodb: '27017' };
  const dbPartIds = { host: 'dbHost', port: 'dbPort', database: 'dbName', user: 'dbUser', password: 'dbPassword' };
  let dbSyncing = false;

  function updateDbPortPlaceholder() {
    document.getElementById('dbPort').placeholder = DB_DEFAULT_PORTS[val('dbType')] || '';
  }

  function cleanHostValue(h) {
    h = h.trim();
    const s = h.indexOf('://');
    if (s > 0) { h = h.slice(s + 3); }
    return h.split('/')[0];
  }
  function collapseDoubleScheme(str) {
    const first = str.indexOf('://');
    if (first < 0) { return str; }
    const second = str.indexOf('://', first + 3);
    if (second < 0) { return str; }
    const between = str.slice(first + 3, second);
    // only collapse when the middle chunk looks like a bare scheme (http, https, …)
    if (new RegExp('^[a-zA-Z][a-zA-Z0-9+.-]*$').test(between)) {
      return str.slice(0, first + 3) + str.slice(second + 3);
    }
    return str;
  }
  function parseConn(str) {
    str = collapseDoubleScheme(str.trim());
    const empty = { host: '', port: '', database: '', user: '', password: '' };
    if (!str) { return empty; }
    if (str.indexOf('://') > 0) {
      try {
        const u = new URL(str);
        const dec = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
        let db = u.pathname;
        if (db.startsWith('/')) { db = db.slice(1); }
        return { host: u.hostname, port: u.port, database: db.split('?')[0],
                 user: dec(u.username), password: dec(u.password) };
      } catch { return null; }
    }
    const kv = {};
    for (const part of str.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) { kv[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim(); }
    }
    const server = kv['server'] || kv['host'] || kv['data source'] || '';
    let host = server, port = kv['port'] || '';
    const m = server.match(new RegExp('^(.*?)[,:]([0-9]+)$'));
    if (m) { host = m[1]; port = port || m[2]; }
    return { host, port, database: kv['database'] || kv['initial catalog'] || '',
             user: kv['user id'] || kv['uid'] || kv['user'] || kv['username'] || '',
             password: kv['password'] || kv['pwd'] || '' };
  }

  function buildConn(type, p) {
    p = { ...p, host: cleanHostValue(p.host || '') };
    if (!p.host && !p.database && !p.user && !p.password) { return ''; }
    if (type === 'mssql') {
      const out = [];
      if (p.host) { out.push('Server=' + p.host + (p.port ? ',' + p.port : '')); }
      if (p.database) { out.push('Database=' + p.database); }
      if (p.user) { out.push('User Id=' + p.user); }
      if (p.password) { out.push('Password=' + p.password); }
      return out.join(';');
    }
    const scheme = type === 'postgres' ? 'postgresql' : type === 'mongodb' ? 'mongodb' : 'mysql';
    let s = scheme + '://';
    if (p.user) {
      s += encodeURIComponent(p.user);
      if (p.password) { s += ':' + encodeURIComponent(p.password); }
      s += '@';
    }
    s += p.host || '';
    if (p.port) { s += ':' + p.port; }
    if (p.database) { s += '/' + p.database; }
    return s;
  }

  function dbPartValues() {
    const out = {};
    for (const [part, id] of Object.entries(dbPartIds)) { out[part] = val(id).trim(); }
    return out;
  }
  function syncPartsFromString() {
    const parsed = parseConn(val('dbConnection'));
    if (!parsed) { return; }
    dbSyncing = true;
    for (const [part, id] of Object.entries(dbPartIds)) {
      const el = document.getElementById(id);
      if (el) { el.value = parsed[part] || ''; }
    }
    dbSyncing = false;
  }
  document.getElementById('dbConnection').addEventListener('input', () => {
    if (!dbSyncing) { syncPartsFromString(); }
  });
  document.getElementById('dbHost').addEventListener('change', () => {
    // Users paste RDS endpoints as URLs — strip scheme/path, keep the port.
    const raw = val('dbHost').trim();
    let cleaned = cleanHostValue(raw);
    const colon = cleaned.lastIndexOf(':');
    if (colon > 0 && new RegExp('^[0-9]+$').test(cleaned.slice(colon + 1))) {
      if (val('dbPort').trim() === '') {
        document.getElementById('dbPort').value = cleaned.slice(colon + 1);
      }
      cleaned = cleaned.slice(0, colon);
    }
    if (cleaned !== raw) {
      document.getElementById('dbHost').value = cleaned;
      dbSyncing = true;
      document.getElementById('dbConnection').value = buildConn(val('dbType'), dbPartValues());
      dbSyncing = false;
    }
  });
  for (const id of Object.values(dbPartIds)) {
    document.getElementById(id).addEventListener('input', () => {
      if (dbSyncing) { return; }
      dbSyncing = true;
      document.getElementById('dbConnection').value = buildConn(val('dbType'), dbPartValues());
      dbSyncing = false;
    });
  }
  document.getElementById('dbType').addEventListener('change', () => {
    updateDbPortPlaceholder();
    const parts = dbPartValues();
    if (Object.values(parts).some((v) => v !== '')) {
      document.getElementById('dbConnection').value = buildConn(val('dbType'), parts);
    }
  });
  updateDbPortPlaceholder();
  if (val('dbConnection').trim() !== '') { syncPartsFromString(); }

  // ---- VPN config file: read locally, carried with the form ----
  let vpnConfigContent = '';
  document.getElementById('vpnConfigFile').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) { return; }
    const reader = new FileReader();
    reader.onload = () => {
      vpnConfigContent = String(reader.result || '');
      document.getElementById('vpnConfigFileName').value = file.name;
    };
    reader.readAsText(file);
  });

  // Attachments: read as base64 so binary survives the JSON post. The name rules and
  // the size cap are enforced HERE, before anything is stored — and the file input is
  // cleared on refusal so what is shown never disagrees with what will be saved.
  var attachmentContent = '';
  var attachmentName = '';
  var imageContent = '';
  var imageName = '';
  function wireBinary(inputId, allowed, assign) {
    document.getElementById(inputId).addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) { return; }
      if (!allowed(file.name)) {
        setError('"' + file.name + '" is not an allowed type for this field.');
        event.target.value = '';
        return;
      }
      if (file.size > ${MAX_ATTACHMENT_BYTES}) {
        setError('"' + file.name + '" is larger than 4 MB.');
        event.target.value = '';
        return;
      }
      setError('');
      var reader = new FileReader();
      reader.onload = function () {
        var url = String(reader.result || '');
        assign(url.slice(url.indexOf(',') + 1), file.name);
      };
      reader.readAsDataURL(file);
    });
  }
  wireBinary('attachFile', ${fileNameRegex}.test.bind(${fileNameRegex}), function (b64, name) {
    attachmentContent = b64; attachmentName = name;
  });
  wireBinary('attachImage', ${imageNameRegex}.test.bind(${imageNameRegex}), function (b64, name) {
    imageContent = b64; imageName = name;
  });

  // ---- script editor: overlay highlighting + variable rows ----
  var scriptVarRows = INITIAL_SCRIPT_VARS.slice();
  (function wireScript() {
    var body = document.getElementById('scriptBody');
    var hl = document.getElementById('scriptHl');
    var langSel = document.getElementById('scriptLanguage');
    if (!body || !hl || !langSel) { return; }
    var wrap = body.parentElement;
    var timer;
    var watchdog;
    // The highlighter runs in the extension host, so the overlay is always one round trip
    // behind what was just typed. One frame of debounce keeps that imperceptible; the old
    // 120 ms was long enough to see, because the textarea's own text is hidden while the
    // overlay is the thing being read.
    function ask() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        vscode.postMessage({ type: 'highlight', text: body.value, lang: langSel.value });
        // If nothing answers — a handler that threw, a host that went away — stop hiding
        // the textarea's glyphs. An editor showing nothing is worse than an unhighlighted
        // one, and this is the state the user actually hit.
        clearTimeout(watchdog);
        watchdog = setTimeout(function () {
          if (wrap) { wrap.classList.remove('lit'); }
        }, 400);
      }, 16);
    }
    body.addEventListener('input', ask);
    langSel.addEventListener('change', ask);
    body.addEventListener('scroll', function () {
      hl.scrollTop = body.scrollTop; hl.scrollLeft = body.scrollLeft;
    });
    window.addEventListener('message', function (event) {
      var msg = event.data || {};
      if (msg.type === 'highlighted') {
        clearTimeout(watchdog);
        hl.innerHTML = msg.html + String.fromCharCode(10);
        hl.scrollTop = body.scrollTop;
        // Only now is it safe for the textarea to stop painting its own text: the overlay
        // demonstrably holds the same content.
        if (wrap) { wrap.classList.add('lit'); }
      }
    });
    ask();
  })();

  function renderScriptVars() {
    var host = document.getElementById('scriptVarRows');
    if (!host) { return; }
    host.textContent = '';
    scriptVarRows.forEach(function (row, index) {
      var wrap = document.createElement('div');
      wrap.className = 'argRow';
      var top = document.createElement('div');
      top.className = 'argTop';
      var on = document.createElement('input');
      on.type = 'checkbox';
      on.checked = row.disabled !== true;
      on.title = 'Substitute this variable';
      on.addEventListener('change', function () { scriptVarRows[index].disabled = !on.checked; });
      var name = document.createElement('input');
      name.type = 'text';
      name.placeholder = 'NAME';
      name.style.maxWidth = '160px';
      name.value = row.name || '';
      name.addEventListener('input', function () { scriptVarRows[index].name = name.value; });
      var value = document.createElement('input');
      value.type = 'text';
      value.placeholder = 'value';
      value.value = row.value || '';
      value.addEventListener('input', function () { scriptVarRows[index].value = value.value; });
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'secondary'; del.textContent = '×';
      del.addEventListener('click', function () { scriptVarRows.splice(index, 1); renderScriptVars(); });
      top.appendChild(on); top.appendChild(name); top.appendChild(value); top.appendChild(del);
      var note = document.createElement('input');
      note.type = 'text';
      note.placeholder = 'what it means';
      note.value = row.note || '';
      note.addEventListener('input', function () { scriptVarRows[index].note = note.value; });
      wrap.appendChild(top); wrap.appendChild(note);
      host.appendChild(wrap);
    });
  }
  (function () {
    var add = document.getElementById('addScriptVar');
    if (add) {
      add.addEventListener('click', function () {
        scriptVarRows.push({ name: '', value: '', note: '', disabled: false });
        renderScriptVars();
      });
    }
    renderScriptVars();
  })();


  // ---- port-forwarding rows ------------------------------------------------
  // Built from an array rather than scraped from the DOM, exactly as the argument and script
  // variable rows are: add/remove/reorder then has ONE implementation and the saved payload
  // comes from the same array the UI edits.
  var forwardRows = INITIAL_FORWARDS.slice();

  function renderForwards() {
    var host = document.getElementById('forwardRows');
    if (!host) { return; }
    host.textContent = '';
    forwardRows.forEach(function (row, index) {
      var wrap = document.createElement('div');
      wrap.className = 'argRow';

      var top = document.createElement('div');
      top.className = 'argTop';

      var on = document.createElement('input');
      on.type = 'checkbox';
      on.checked = row.disabled !== true;
      on.title = 'Use this forward on the next connection';
      on.addEventListener('change', function () {
        forwardRows[index].disabled = !on.checked;
        renderForwards();
      });

      var kind = document.createElement('select');
      [['local', 'Local -L'], ['remote', 'Remote -R']].forEach(function (pair) {
        var opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        if (row.kind === pair[0]) { opt.selected = true; }
        kind.appendChild(opt);
      });
      kind.addEventListener('change', function () { forwardRows[index].kind = kind.value; });

      var rule = document.createElement('input');
      rule.type = 'text';
      rule.value = row.rule;
      rule.placeholder = '5432:db.internal:5432';
      rule.spellcheck = false;
      rule.addEventListener('input', function () { forwardRows[index].rule = rule.value; });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = '×';
      remove.title = 'Remove this forward';
      remove.addEventListener('click', function () {
        forwardRows.splice(index, 1);
        renderForwards();
      });

      top.appendChild(on);
      top.appendChild(kind);
      top.appendChild(rule);
      top.appendChild(remove);
      wrap.appendChild(top);
      host.appendChild(wrap);
    });
  }
  (function () {
    var add = document.getElementById('addForward');
    if (add) {
      add.addEventListener('click', function () {
        forwardRows.push({ kind: 'local', rule: '', disabled: false });
        renderForwards();
      });
    }
    renderForwards();
  })();

  // ---- save / cancel ----
  document.getElementById('save').addEventListener('click', () => {
    setError('');
    const kind = currentKind();
    if (val('name').trim() === '') {
      setError('Name is required.');
      return;
    }
    if (kind === 'ssh' && val('host').trim() === '') {
      setError('Host is required for an SSH connection.');
      return;
    }
    const port = val('port').trim();
    if (kind === 'ssh' && port !== '' && (!new RegExp('^[0-9]+$').test(port) || Number(port) < 1 || Number(port) > 65535)) {
      setError('Port must be an integer between 1 and 65535.');
      return;
    }
    // The shape check the host repeats with the real parser: a seed that is neither a URI
    // nor base32 would be silently dropped there, and a silent drop is how a person types a
    // seed twice before noticing nothing was kept.
    const totpText = val('totp').trim();
    if (totpText !== '' && !new RegExp('^otpauth://', 'i').test(totpText) && !new RegExp('^[A-Za-z2-7 =-]+$').test(totpText)) {
      setError('The one-time code seed must be an otpauth:// URI or a base32 secret (letters A-Z, digits 2-7).');
      return;
    }
    vscode.postMessage({ type: 'save', data: {
      entityType: kind,
      name: val('name'),
      host: currentKind() === 'vpn' ? val('vpnHost') : val('host'),
      user: currentKind() === 'vpn' ? val('vpnUser') : val('user'),
      port: currentKind() === 'vpn' ? val('vpnPort') : val('port'),
      sshKeyPath: val('sshKeyPath'), publicKey: val('publicKey'),
      sshKeyEntityId: val('sshKeyEntityId'), notes: val('notes'),
      password: val('password'),
      privateKey: currentKind() === 'vpn' ? val('vpnKey') : val('privateKey'),
      clearVpnKey: chk('clearVpnKey'),
      vpnType: val('vpnType'), vpnConfigContent, vpnConfigFileName: val('vpnConfigFileName'),
      clearVpnConfig: chk('clearVpnConfig'),
      dbType: val('dbType'), dbConnection: val('dbConnection'),
      command: val('command'), commandNote: val('commandNote'), commandArgs: argRows,
      envBindings: collectEnvBindings(), lifetime: val('lifetime'),
      scriptLanguage: val('scriptLanguage'), scriptBody: val('scriptBody'), scriptVars: scriptVarRows,
      configFormat: val('configFormat'), configFileName: val('configFileName'),
      configBody: val('configBody'),
      attachmentContent: attachmentContent, attachmentName: attachmentName,
      imageContent: imageContent, imageName: imageName,
      clearAttachment: chk('clearAttachment'), clearImage: chk('clearImage'),
      clearPassword: chk('clearPassword'), clearPrivateKey: chk('clearPrivateKey'),
      totp: val('totp'), totpSteam: chk('totpSteam'), clearTotp: chk('clearTotp'),
      jumpHostEntityId: val('jumpHostEntityId'), tags: val('tags'),
      agentForward: chk('agentForward'), clearHostKey: chk('clearHostKey'),
      portForwards: forwardRows,
      dependsOn: collectDependsOn(),
      mcp: collectMcp(),
    }});
  });
  document.getElementById('cancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });

  // ---- generating a secret -------------------------------------------------
  // The page asks; the host draws. Node's crypto is where unbiased randomness lives, and a
  // webview reaching for Math.random() would produce something that only looks random.
  ${generateWiring()}

  // T28: the ± text zoom. The HOST clamps and writes the setting, then pushes the new value
  // to every open page — this page only reports the press and applies what it is told.
  for (const zoomButton of document.querySelectorAll('button[data-zoom]')) {
    zoomButton.addEventListener('click', function () {
      vscode.postMessage({ type: 'zoom', zoomDelta: Number(this.dataset.zoom) });
    });
  }

  // A generated value nobody can see is a value nobody will trust; the toggle is per click and
  // never persisted, and the field goes back to a password box on save either way.
  var reveal = document.getElementById('revealPassword');
  if (reveal) {
    reveal.addEventListener('click', function () {
      var field = document.getElementById('password');
      var shown = field.type === 'text';
      field.type = shown ? 'password' : 'text';
      reveal.textContent = shown ? 'Show' : 'Hide';
    });
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'generated') { return; }
    var field = document.getElementById(data.target);
    if (!field) { return; }
    field.value = data.value;
    if (data.target === 'password') {
      var hint = document.getElementById('genHint');
      if (hint) { hint.textContent = data.note; }
      field.type = 'text';
      if (reveal) { reveal.textContent = 'Hide'; }
    } else {
      var keyHint = document.getElementById('genKeyHint');
      if (keyHint) { keyHint.textContent = data.note; }
      if (data.publicLine) { document.getElementById('publicKey').value = data.publicLine; }
    }
  });
  ${qrPasteScript()}

  // Keyboard: Esc cancels, Ctrl/Cmd+S saves — what every editor's hands already expect.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      vscode.postMessage({ type: 'cancel' });
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      document.getElementById('save').click();
    }
  });
  // The sticky Save/Cancel bar is first in DOM order so that it can stick; keyboard focus
  // must not follow it there. Tab-then-type on a fresh form lands in Name.
  const nameField = document.getElementById('name');
  if (nameField) { nameField.focus(); }
</script>`;
}
