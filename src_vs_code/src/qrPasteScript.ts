/**
 * Reading a pasted QR image, as the browser runs it.
 *
 * <p>Its own module for the reason `mcpSwitchScript.ts` has one: `entityFormScript.ts` sits
 * against an 800-line ceiling. It returns a FRAGMENT that runs inside the page's one script,
 * beside the seed field it fills in.</p>
 *
 * <p>The division of labour is the interesting part. The page owns the only image decoder in
 * the process — a canvas — so it turns whatever was on the clipboard into grey pixels. The HOST
 * owns the reading, because a QR decoder is seven hundred lines of table-driven bit work and
 * this file is a template string that the compiler never checks and no test can reach.</p>
 */
// One template literal, like the switches and the picker: a browser program that reads top to
// bottom, and slicing it to satisfy a line budget would join it back with string concatenation.
// eslint-disable-next-line max-lines-per-function
export function qrPasteScript(): string {
  return `
  // ---- a one-time-code QR pasted as a picture ------------------------------
  // Google Authenticator exports ONLY as a picture, so the seed field has to take one. The
  // page's canvas is the only image decoder in this process, so the picture is reduced to grey
  // pixels here and read in the host, where the reader is a module tests can reach. Nothing is
  // kept on either side: the round trip answers with accounts and the page fills the field.
  (function wireQrPaste() {
    var button = document.getElementById('totpPasteQr');
    var field = document.getElementById('totp');
    var hint = document.getElementById('totpQrHint');
    var choices = document.getElementById('totpQrChoices');
    if (!button || !field || !hint || !choices) { return; }
    var say = function (text) { hint.textContent = text; };

    button.addEventListener('click', function () {
      say('Press Ctrl+V now — whatever picture is on the clipboard will be read here.');
      field.focus();
    });

    // Beyond this the modules of a screenshot are still several pixels across, and the picture
    // has to cross a JSON message: a 4K screen capture sent whole is 8 MB of base64 for nothing.
    var MAX_SIDE = 1600;
    var sendPixels = function (bitmap) {
      var scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      var width = Math.max(1, Math.round(bitmap.width * scale));
      var height = Math.max(1, Math.round(bitmap.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0, width, height);
      var rgba = context.getImageData(0, 0, width, height).data;
      var gray = new Uint8Array(width * height);
      for (var i = 0; i < gray.length; i++) {
        gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
      }
      var binary = '';
      for (var start = 0; start < gray.length; start += 8192) {
        binary += String.fromCharCode.apply(null, gray.subarray(start, start + 8192));
      }
      vscode.postMessage({ type: 'qrImage', width: width, height: height, gray: btoa(binary) });
      say('Reading the picture…');
    };

    document.addEventListener('paste', function (event) {
      var items = event.clipboardData && event.clipboardData.items;
      if (!items) { return; }
      for (var i = 0; i < items.length; i++) {
        // Only an IMAGE is intercepted; pasting text into a field must stay ordinary pasting.
        if (items[i].type.indexOf('image/') !== 0) { continue; }
        var file = items[i].getAsFile();
        if (!file) { continue; }
        event.preventDefault();
        choices.textContent = '';
        createImageBitmap(file).then(sendPixels).catch(function (error) {
          say('That picture could not be opened: ' + error.message);
        });
        return;
      }
    });

    var take = function (account) {
      field.value = account.uri;
      var steam = document.getElementById('totpSteam');
      if (steam) { steam.checked = account.uri.indexOf('encoder=steam') >= 0; }
      choices.textContent = '';
      say('Seed taken from the QR code: ' + account.title + ' — ' + account.description +
          '. It is saved when you save this entry.');
    };

    var offer = function (accounts) {
      for (var i = 0; i < accounts.length; i++) {
        (function (account) {
          var choice = document.createElement('button');
          choice.type = 'button';
          choice.className = 'secondary';
          choice.textContent = account.title + ' — ' + account.description;
          choice.addEventListener('click', function () { take(account); });
          choices.appendChild(choice);
        })(accounts[i]);
      }
    };

    var explain = function (text) {
      var line = document.createElement('div');
      line.className = 'qrWhy';
      line.textContent = text;
      choices.appendChild(line);
    };

    window.addEventListener('message', function (event) {
      var data = event.data;
      if (!data || data.type !== 'qrResult') { return; }
      choices.textContent = '';
      var accounts = data.accounts || [];
      var skipped = data.skipped || [];
      if (accounts.length === 1) {
        take(accounts[0]);
      } else if (accounts.length > 1) {
        say('That export holds ' + accounts.length + ' accounts. Choose the one for this entry:');
        offer(accounts);
      } else {
        say(data.error || 'Nothing usable was found in that picture.');
      }
      for (var i = 0; i < skipped.length; i++) { explain(skipped[i]); }
    });
  })();
`;
}
