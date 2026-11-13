import { paletteJson } from './depPickerScript';
import { DepColorKey } from './depColors';
import { jsonForScript } from './webviewHtml';

/**
 * The folder form's Colour row, as the browser runs it.
 *
 * <p>A page-script FRAGMENT, in the shape of `mcpSwitchScript.ts`: it runs inside the folder page's one
 * script and contributes `collectFolderColor()` to `save()`. The swatches are the dependency swatches
 * (`depSwatch` in `depPickerScript.ts`) — the same palette JSON, the same classes — so the row cannot
 * drift from the picker whose colours it shares.</p>
 *
 * <p><b>Marking is not choosing.</b> The stored colour is marked when the row first paints, but
 * `folderChosen` stays undefined until a click, and only `folderChosen` is posted. A Save that clicked no
 * swatch therefore sends no colour at all and cannot overwrite one written meanwhile. A click on the
 * already-marked swatch still counts as a choice; the host writes nothing for an equal key.</p>
 *
 * <p>The one host value, the marked key, goes through `jsonForScript` like every value here: it comes off
 * a vault record that arrived by sync or import, and `JSON.stringify` leaves a closing script tag alone.</p>
 */
export function folderSwatchScript(marked: DepColorKey | undefined): string {
  return `
  // ---- folder colour -----------------------------------------------------
  var FOLDER_PALETTE = ${paletteJson()};
  var folderMarked = ${jsonForScript(marked ?? null)};
  var folderChosen = undefined;

  var folderButtons = [];

  // Built once. A click only moves the mark (below), so the button the person clicked is still the one in focus.
  function paintFolderSwatches() {
    var wrap = document.getElementById('folderSwatches');
    wrap.textContent = '';
    for (var i = 0; i < FOLDER_PALETTE.length; i++) {
      var button = folderSwatch(FOLDER_PALETTE[i]);
      folderButtons.push(button);
      wrap.appendChild(button);
    }
    markFolderSwatches();
  }

  function markFolderSwatches() {
    var shown = folderChosen ?? folderMarked;
    for (var i = 0; i < folderButtons.length; i++) {
      var on = folderButtons[i].getAttribute('data-key') === shown;
      folderButtons[i].className = 'depSwatch' + (on ? ' depSwatchOn' : '');
      folderButtons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function folderSwatch(entry) {
    var button = document.createElement('button');
    button.type = 'button';
    button.style.background = entry.css;
    button.title = entry.label;
    button.setAttribute('aria-label', entry.label);
    button.setAttribute('data-key', entry.key);
    button.addEventListener('click', function () {
      folderChosen = entry.key;
      markFolderSwatches();
    });
    return button;
  }

  // Only a click is a choice; the marked colour alone sends nothing.
  function collectFolderColor() { return folderChosen; }

  paintFolderSwatches();
  `;
}
