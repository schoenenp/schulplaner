#target indesign

// Keep this script beside add-fields.mjs in the repository. Create a shortcut
// to it in InDesign's Scripts Panel folder rather than moving it alone.
(function () {
    function quoteShell(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }
    function quoteApple(s) { return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"'; }
    function json(value) {
        if (value === null) return 'null';
        if (typeof value === 'string') return quoteApple(value).replace(/\t/g, '\\t');
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        var parts = [], i, key;
        if (value instanceof Array) {
            for (i = 0; i < value.length; i++) parts.push(json(value[i]));
            return '[' + parts.join(',') + ']';
        }
        for (key in value) if (value.hasOwnProperty(key)) parts.push(json(key) + ':' + json(value[key]));
        return '{' + parts.join(',') + '}';
    }
    function write(file, content) {
        file.encoding = 'UTF-8';
        if (!file.open('w')) throw Error('Cannot write ' + file.fsName);
        try { if (!file.write(content)) throw Error('Cannot write ' + file.fsName); }
        finally { file.close(); }
    }
    if (!app.documents.length) { alert('Open your cover or Wochenplaner document first.'); return; }
    if ($.os.toLowerCase().indexOf('mac') < 0) { alert('This first version requires macOS and Node.js.'); return; }
    var doc = app.activeDocument;
    var count = doc.pages.length;
    if (count !== 2 && count !== 4) { alert('Use 2 pages for Wochenplaner or 4 pages for a cover.'); return; }
    var layer = doc.layers.itemByName('BOOKS_FIELDS');
    if (!layer.isValid) { alert('Create a BOOKS_FIELDS layer and put your named text form fields on it.'); return; }
    var helper = File(File($.fileName).parent.fsName + '/add-fields.mjs');
    if (!helper.exists) { alert('Keep this script beside add-fields.mjs in the project.'); return; }
    var presets = app.pdfExportPresets.everyItem().getElements();
    var dialog = new Window('dialog', 'Export Books Template');
    dialog.add('statictext', undefined, 'Select your production CMYK PDF preset:');
    var names = [], i;
    for (i = 0; i < presets.length; i++) names.push(presets[i].name);
    var choice = dialog.add('dropdownlist', undefined, names);
    choice.selection = 0;
    dialog.add('statictext', undefined, 'Fields use Helvetica and 100% K black, matching the generator.');
    var buttons = dialog.add('group');
    buttons.add('button', undefined, 'Export', {name: 'ok'});
    buttons.add('button', undefined, 'Cancel', {name: 'cancel'});
    if (dialog.show() !== 1) return;
    var folder = Folder.selectDialog('Choose the folder for the exported template');
    if (!folder) return;
    var base = doc.name.replace(/\.[^.]+$/, '').replace(/[\/\\:]/g, '_');
    // Each export gets a separate folder so existing deliverables stay intact.
    var run = Folder(folder.fsName + '/' + base + '-books-' + new Date().getTime());
    if (!run.create()) { alert('Cannot create the export folder.'); return; }
    var artwork = File(run.fsName + '/artwork.pdf');
    var manifestFile = File(run.fsName + '/fields.json');
    var output = File(run.fsName + '/' + base + '-template.pdf');
    var oldUnits = app.scriptPreferences.measurementUnit;
    var oldOrigin = doc.viewPreferences.rulerOrigin;
    var oldZero = doc.zeroPoint;
    var oldVisible = layer.visible;
    var oldPrintable = layer.printable;
    var oldRange = app.pdfExportPreferences.pageRange;
    var preset;
    try {
        // Use a consistent coordinate system for both page and item bounds.
        app.scriptPreferences.measurementUnit = MeasurementUnits.POINTS;
        doc.viewPreferences.rulerOrigin = RulerOrigin.SPREAD_ORIGIN;
        doc.zeroPoint = [0, 0];
        var manifest = {version: 1, module: count === 4 ? 'cover' : 'planner', pages: [], fields: []};
        var items = doc.allPageItems, item, p, b, pb, alignment;
        for (i = 0; i < count; i++) {
            pb = doc.pages[i].bounds;
            manifest.pages.push({width: pb[3] - pb[1], height: pb[2] - pb[0]});
        }
        for (i = 0; i < items.length; i++) {
            item = items[i];
            if (item.itemLayer.id !== layer.id) continue;
            if (item.constructor.name === 'Group') continue;
            if (item.constructor.name !== 'TextBox') throw Error('BOOKS_FIELDS must contain only text form fields: ' + item.name);
            p = item.parentPage;
            if (!p || !p.isValid || p.parent.constructor.name === 'MasterSpread') throw Error('Override parent-page fields onto document pages first.');
            if (Math.abs(item.absoluteRotationAngle) > 0.01 || Math.abs(item.absoluteShearAngle) > 0.01) throw Error('Rotated or sheared fields are not supported: ' + item.name);
            b = item.geometricBounds;
            pb = p.bounds;
            alignment = item.extractLabel('booksAlignment') || 'left';
            manifest.fields.push({name: item.name, pageIndex: p.documentOffset,
                left: b[1] - pb[1], top: b[0] - pb[0], width: b[3] - b[1], height: b[2] - b[0],
                fontSize: Number(item.fontSize), multiline: item.multiline, alignment: alignment});
        }
        // Parent-page items aren't reliably included in doc.allPageItems.
        for (i = 0; i < doc.masterSpreads.length; i++) {
            items = doc.masterSpreads[i].allPageItems;
            for (var j = 0; j < items.length; j++) if (items[j].itemLayer.id === layer.id) throw Error('Move or override BOOKS_FIELDS items from parent pages before exporting.');
        }
        if (!manifest.fields.length) throw Error('No text form fields found on BOOKS_FIELDS.');
        write(manifestFile, json(manifest));
        preset = presets[choice.selection.index].duplicate();
        preset.exportReaderSpreads = false;
        preset.exportAsSinglePages = false;
        preset.exportNonprintingObjects = false;
        preset.exportWhichLayers = ExportLayerOptions.EXPORT_VISIBLE_PRINTABLE_LAYERS;
        app.pdfExportPreferences.pageRange = PageRange.ALL_PAGES;
        layer.visible = false;
        layer.printable = false;
        doc.exportFile(ExportFormat.PDF_TYPE, artwork, false, preset);
        var node = File('/opt/homebrew/bin/node');
        if (!node.exists) node = File('/usr/local/bin/node');
        if (!node.exists) node = File.openDialog('Locate your Node.js executable');
        if (!node) throw Error('Node.js is needed to finish. Artwork and field map are saved in ' + run.fsName);
        var command = quoteShell(node.fsName) + ' ' + quoteShell(helper.fsName) + ' ' + quoteShell(artwork.fsName) + ' ' + quoteShell(manifestFile.fsName) + ' ' + quoteShell(output.fsName);
        app.doScript('do shell script ' + quoteApple(command), ScriptLanguage.APPLESCRIPT_LANGUAGE);
        if (!output.exists) throw Error('The helper did not create the template.');
        alert('Template created:\n' + output.fsName);
    } catch (error) {
        alert('Export failed:\n' + error.message + '\n\nExport folder: ' + run.fsName);
    } finally {
        layer.visible = oldVisible;
        layer.printable = oldPrintable;
        doc.viewPreferences.rulerOrigin = oldOrigin;
        doc.zeroPoint = oldZero;
        app.scriptPreferences.measurementUnit = oldUnits;
        app.pdfExportPreferences.pageRange = oldRange;
        if (preset && preset.isValid) preset.remove();
    }
}());
