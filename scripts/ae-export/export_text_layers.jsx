/**
 * Bring My Matter — After Effects text layer exporter.
 *
 * Extracts text content, font, fill color, exact position, and start/stop
 * time for every text layer in the active composition, and writes a JSON
 * manifest that the admin panel's "Import from After Effects" button can
 * read. Does NOT export animation — only the static layout data. Entrance/
 * exit animation is picked manually in the platform after import, same as
 * any other block.
 *
 * How to run:
 *   1. Open the composition you want to export in After Effects.
 *   2. File > Scripts > Run Script File... > select this file.
 *   3. Choose where to save the .json — upload that file in the admin
 *      template editor's "Import from After Effects" button.
 *
 * Only TextLayer objects are read. Shape layers, solids, images, precomps,
 * and nested/precomp text layers are skipped (not descended into).
 */

(function () {
  var comp = app.project.activeItem;

  if (!comp || !(comp instanceof CompItem)) {
    alert("Bring My Matter export: open a composition first, then run this script again.");
    return;
  }

  function toHex2(n) {
    var h = Math.max(0, Math.min(255, Math.round(n * 255))).toString(16);
    return h.length === 1 ? "0" + h : h;
  }

  function fillColorHex(textDoc) {
    // textDocument.fillColor is [r, g, b] as 0-1 floats, uniform-color only
    // (per-character mixed colors aren't readable via this legacy API —
    // such layers export with no color and fall back to the block default
    // after import).
    try {
      if (!textDoc.applyFill) return null;
      var c = textDoc.fillColor;
      if (!c || c.length < 3) return null;
      return "#" + toHex2(c[0]) + toHex2(c[1]) + toHex2(c[2]);
    } catch (e) {
      return null;
    }
  }

  // A hard Enter in TextDocument.text can come through as \r, \r\n, or the
  // Unicode PARAGRAPH SEPARATOR (U+2029); a soft Shift+Enter line break can
  // come through as the Unicode LINE SEPARATOR (U+2028) — this varies by AE
  // version/platform. Normalize every form to a plain \n so it matches our
  // own "white-space: pre-wrap" rendering on import.
  var LINE_SEP = String.fromCharCode(0x2028);
  var PARA_SEP = String.fromCharCode(0x2029);
  function normalizeLineBreaks(s) {
    return String(s || "")
      .split("\r\n").join("\n")
      .split("\r").join("\n")
      .split(LINE_SEP).join("\n")
      .split(PARA_SEP).join("\n");
  }

  var layersOut = [];
  var skipped = [];

  for (var i = 1; i <= comp.layers.length; i++) {
    var layer = comp.layers[i];

    if (!(layer instanceof TextLayer)) {
      continue;
    }

    try {
      var textDoc = layer.sourceText.value;
      var font = textDoc.font; // PostScript name, e.g. "PlayfairDisplay-Bold"
      var color = fillColorHex(textDoc); // "#rrggbb" or null if unreadable/no fill

      // Actual multi-line text content (NOT layer.name — the layer's name
      // is just an editor label and doesn't reliably carry line breaks,
      // which is why multi-line AE text was collapsing onto one line after
      // import).
      var text = normalizeLineBreaks(textDoc.text);

      // Reported fontSize is the BASE size before any layer scale transform
      // — if the artist scaled the layer up/down instead of changing the
      // font size property directly, the raw fontSize under-/over-states
      // what's actually on screen. Correct for it using the layer's own
      // scale (skip 3D non-uniform edge cases and just average x/y).
      var fontSize = textDoc.fontSize;
      try {
        var scale = layer.transform.scale.value; // [sx, sy] or [sx, sy, sz], percent
        var avgScale = ((scale[0] + scale[1]) / 2) / 100;
        if (avgScale > 0 && isFinite(avgScale)) fontSize = fontSize * avgScale;
      } catch (scaleErr) {
        // No scale property (rare) — fall back to the raw reported size.
      }

      var pos = layer.transform.position.value; // [x, y] or [x, y, z] if 3D
      var x = pos[0];
      var y = pos[1];

      var inPoint = layer.inPoint; // seconds, comp-relative
      var outPoint = layer.outPoint;

      layersOut.push({
        name: layer.name,
        text: text,
        font: font,
        font_size: fontSize,
        color: color,
        x: x,
        y: y,
        "in": inPoint,
        out: outPoint
      });
    } catch (e) {
      skipped.push(layer.name + ": " + e.toString());
    }
  }

  if (layersOut.length === 0) {
    alert("Bring My Matter export: no text layers found in \"" + comp.name + "\".");
    return;
  }

  var manifest = {
    comp_name: comp.name,
    comp_width: comp.width,
    comp_height: comp.height,
    fps: comp.frameRate,
    exported_at: new Date().toISOString ? new Date().toISOString() : String(new Date()),
    layers: layersOut
  };

  var defaultName = comp.name.replace(/[^a-zA-Z0-9_-]+/g, "_") + "_layout.json";
  var saveFile = File.saveDialog("Save Bring My Matter layout export", "JSON:*.json");

  if (!saveFile) {
    return; // user cancelled
  }

  if (saveFile.name.indexOf(".json") === -1) {
    saveFile = new File(saveFile.fsName + ".json");
  }

  saveFile.encoding = "UTF-8";
  saveFile.open("w");
  saveFile.write(JSON.stringify(manifest, null, 2));
  saveFile.close();

  var msg = "Exported " + layersOut.length + " text layer(s) to:\n" + saveFile.fsName;
  if (skipped.length > 0) {
    msg += "\n\nSkipped " + skipped.length + " layer(s) due to errors:\n" + skipped.join("\n");
  }
  alert(msg);
})();
