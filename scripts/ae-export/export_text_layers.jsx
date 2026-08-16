/**
 * Bring My Matter — After Effects text layer exporter.
 *
 * Extracts font, exact position, and start/stop time for every text layer in
 * the active composition, and writes a JSON manifest that the admin panel's
 * "Import from After Effects" button can read. Does NOT export animation —
 * only the static layout data (font, position, in/out point). Entrance/exit
 * animation is picked manually in the platform after import, same as any
 * other block.
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
      var fontSize = textDoc.fontSize;

      var pos = layer.transform.position.value; // [x, y] or [x, y, z] if 3D
      var x = pos[0];
      var y = pos[1];

      var inPoint = layer.inPoint; // seconds, comp-relative
      var outPoint = layer.outPoint;

      layersOut.push({
        name: layer.name,
        font: font,
        font_size: fontSize,
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
