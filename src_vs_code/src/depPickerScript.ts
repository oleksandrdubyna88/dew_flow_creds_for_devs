import { DEP_COLOR_FALLBACK, DEP_COLOR_KEYS, DEP_COLOR_LABELS } from './depColors';
import { jsonForScript } from './webviewHtml';
import { DependencyFolderCandidate, DependencyRow } from './depGraph';

/**
 * The Depends-on picker, as the browser runs it.
 *
 * <p>Its own module for the reason `entityFormScript.ts` was split off `entityFormPanel.ts` in
 * the first place: that file sits at 778 lines against an 800-line limit, and this is 140. It
 * returns a FRAGMENT, not a `<script>` element — it has to run inside the page's one script,
 * beside `val()` and the save handler it contributes a field to.</p>
 *
 * <p>Everything it needs is interpolated once, when the page is built: the folders, their
 * entities, the colours already in use, and the rows this entity opens with. There is no round
 * trip to the extension host, so the second dropdown is populated by the same click that chose
 * the folder rather than a frame or two later.</p>
 *
 * <p><b>Every one of those goes through `jsonForScript`, never `JSON.stringify`.</b> This
 * fragment runs inside the form's one `&lt;script&gt;` element and it carries FOLDER AND ENTITY
 * NAMES, which arrive from a synced vault, a shared entry or a restored backup. `JSON.stringify`
 * leaves `&lt;` alone, and an HTML parser ends a script element at `&lt;/script&gt;` wherever it
 * appears — inside a string literal included — so a name carrying it closed this script early
 * and the rest of the form's own code was parsed as markup. Fixed here after the identical
 * defect was found and fixed in `entityFormScript.ts`, which is the file this fragment is
 * interpolated into and which already imported the escaper.</p>
 */

interface PickerData {
  rows: DependencyRow[];
  folders: DependencyFolderCandidate[];
  colors: Record<string, string>;
}

/**
 * The swatch palette, as the page needs it: key, human name, and a colour to paint.
 *
 * <p>Through `jsonForScript` like everything else here, even though the values are our own
 * constants. Safe by CONTENT is not safe by construction, and the site is what a later edit
 * changes — see that function's own note.</p>
 */
function paletteJson(): string {
  return jsonForScript(
    DEP_COLOR_KEYS.map((key) => ({
      key,
      label: DEP_COLOR_LABELS[key],
      // The theme's own value when it is there, the dark-theme hex when it is not.
      css: `var(--vscode-credSshManager-${key}, ${DEP_COLOR_FALLBACK[key]})`,
    })),
  );
}

// One template literal, like `formPageScript`: a browser program that reads top to bottom, and
// slicing it to satisfy a line budget would make it harder to read and harder for the test that
// parses it.
// eslint-disable-next-line max-lines-per-function
export function dependencyPickerScript(data: PickerData): string {
  return `
  // ---- depends on -------------------------------------------------------
  var DEP_FOLDERS = ${jsonForScript(data.folders)};
  var DEP_TAKEN = ${jsonForScript(data.colors)};
  var DEP_PALETTE = ${paletteJson()};
  var depRows = ${jsonForScript(data.rows)};

  function depFolderById(id) {
    for (var i = 0; i < DEP_FOLDERS.length; i++) {
      if (DEP_FOLDERS[i].id === id) { return DEP_FOLDERS[i]; }
    }
    return undefined;
  }

  // The colour a NEW pick gets: whatever the target already wears, otherwise the first key
  // nobody is using — counting both the vault's existing targets and the other rows on screen,
  // so picking two brand-new targets in one sitting does not hand out the same colour twice.
  function depAutoColor(targetId, rowIndex) {
    if (DEP_TAKEN[targetId]) { return DEP_TAKEN[targetId]; }
    var used = {};
    for (var id in DEP_TAKEN) { used[DEP_TAKEN[id]] = true; }
    for (var i = 0; i < depRows.length; i++) {
      if (i !== rowIndex && depRows[i].color) { used[depRows[i].color] = true; }
    }
    for (var p = 0; p < DEP_PALETTE.length; p++) {
      if (!used[DEP_PALETTE[p].key]) { return DEP_PALETTE[p].key; }
    }
    return DEP_PALETTE[0].key;
  }

  function depSelect(options, value, onChange) {
    var select = document.createElement('select');
    for (var i = 0; i < options.length; i++) {
      var option = document.createElement('option');
      option.value = options[i].value;
      option.textContent = options[i].label;
      if (options[i].value === value) { option.selected = true; }
      select.appendChild(option);
    }
    select.addEventListener('change', function () { onChange(select.value); });
    return select;
  }

  function depSwatches(row, index) {
    var wrap = document.createElement('span');
    wrap.className = 'depSwatches';
    for (var i = 0; i < DEP_PALETTE.length; i++) {
      wrap.appendChild(depSwatch(DEP_PALETTE[i], row, index));
    }
    return wrap;
  }

  function depSwatch(entry, row, index) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'depSwatch' + (row.color === entry.key ? ' depSwatchOn' : '');
    button.style.background = entry.css;
    button.title = entry.label;
    button.setAttribute('aria-label', entry.label);
    button.addEventListener('click', function () {
      // Changing it here changes it for EVERY entry depending on this target — the colour
      // lives on the target, so there is only one place it is written.
      depRows[index].color = entry.key;
      DEP_TAKEN[depRows[index].targetId] = entry.key;
      renderDepRows();
    });
    return button;
  }

  function depEntityOptions(folderId) {
    var folder = depFolderById(folderId);
    var options = [{ value: '', label: '— pick an entry —' }];
    var entities = folder ? folder.entities : [];
    for (var i = 0; i < entities.length; i++) {
      options.push({ value: entities[i].id, label: entities[i].name });
    }
    return options;
  }

  function depRowElement(row, index) {
    var line = document.createElement('div');
    line.className = 'depRow';
    if (row.missing) {
      var gone = document.createElement('span');
      gone.className = 'depGone';
      gone.textContent = 'An entry that is no longer in this vault — kept in case it returns.';
      line.appendChild(gone);
    } else {
      line.appendChild(depFolderSelect(row, index));
      line.appendChild(depEntitySelect(row, index));
      if (row.targetId) { line.appendChild(depSwatches(row, index)); }
    }
    line.appendChild(depRemoveButton(index));
    return line;
  }

  function depFolderSelect(row, index) {
    var options = [{ value: '', label: '— pick a folder —' }];
    for (var i = 0; i < DEP_FOLDERS.length; i++) {
      options.push({ value: DEP_FOLDERS[i].id, label: DEP_FOLDERS[i].name });
    }
    return depSelect(options, row.folderId, function (value) {
      depRows[index].folderId = value;
      depRows[index].targetId = '';
      depRows[index].color = '';
      renderDepRows();
    });
  }

  function depEntitySelect(row, index) {
    return depSelect(depEntityOptions(row.folderId), row.targetId, function (value) {
      depRows[index].targetId = value;
      depRows[index].color = value ? depAutoColor(value, index) : '';
      renderDepRows();
    });
  }

  function depRemoveButton(index) {
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'depRemove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', function () {
      depRows.splice(index, 1);
      renderDepRows();
    });
    return remove;
  }

  function renderDepRows() {
    var host = document.getElementById('dependsOnRows');
    if (!host) { return; }
    host.textContent = '';
    for (var i = 0; i < depRows.length; i++) {
      host.appendChild(depRowElement(depRows[i], i));
    }
  }

  // Only rows that actually name something. A half-filled row is somebody still choosing, not
  // a relationship — and a folder with no entity picked would post an empty id the host drops
  // anyway, one layer later and less legibly.
  function collectDependsOn() {
    if (!chk('dependsOnOn')) { return []; }
    var out = [];
    for (var i = 0; i < depRows.length; i++) {
      if (depRows[i].targetId) {
        out.push({ targetId: depRows[i].targetId, color: depRows[i].color });
      }
    }
    return out;
  }

  (function () {
    var toggle = document.getElementById('dependsOnOn');
    var body = document.getElementById('dependsOnBody');
    var add = document.getElementById('addDependency');
    function sync() { if (body) { body.style.display = toggle && toggle.checked ? '' : 'none'; } }
    if (toggle) { toggle.addEventListener('change', sync); }
    if (add) {
      add.addEventListener('click', function () {
        depRows.push({ folderId: '', targetId: '', color: '', missing: false });
        renderDepRows();
      });
    }
    sync();
    renderDepRows();
  })();
`;
}
