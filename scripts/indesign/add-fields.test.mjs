import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { addFields } from './add-fields.mjs';

const require = createRequire(new URL('../../packages/pdf-pipeline/package.json', import.meta.url));
const { PDFDocument, PDFName, cmyk } = require('pdf-lib');

async function fixture() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([240, 340]);
    page.setTrimBox(20, 20, 200, 300);
    page.drawRectangle({ x: 0, y: 0, width: 240, height: 340, color: cmyk(0.2, 0.1, 0, 0) });
  }
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(doc.context.stream('<xmp/>')));
  return doc.save();
}
function manifest(fields) {
  return { version: 1, module: 'planner', pages: [{ width: 200, height: 300 }, { width: 200, height: 300 }], fields };
}
const field = { name: 'WEEK_NUM', pageIndex: 1, left: 40, top: 30, width: 80, height: 20, fontSize: 11, alignment: 'right' };

test('places fields relative to trim, preserves page artwork and print boxes, and can fill/flatten', async () => {
  const originalBytes = await fixture();
  const original = await PDFDocument.load(originalBytes);
  const bytes = await addFields(originalBytes, manifest([field]));
  const result = await PDFDocument.load(bytes);
  assert.equal(result.getPageCount(), 2);
  assert.deepEqual(result.getPage(1).getTrimBox(), original.getPage(1).getTrimBox());
  const sourceStreams = original.getPage(1).node.Contents();
  const resultStreams = result.getPage(1).node.Contents();
  // pdf-lib normalizes page streams by adding a surrounding q/Q pair.
  const resultContents = Array.from({ length: resultStreams.size() }, (_, i) => result.context.lookup(resultStreams.get(i)).getContents());
  for (let i = 0; i < sourceStreams.size(); i++) {
    const source = original.context.lookup(sourceStreams.get(i)).getContents();
    assert.ok(resultContents.some(content => Buffer.from(content).equals(Buffer.from(source))));
  }
  const text = result.getForm().getTextField('WEEK_NUM');
  assert.deepEqual(text.acroField.getWidgets()[0].getRectangle(), { x: 60, y: 270, width: 80, height: 20 });
  assert.equal(text.getAlignment(), 2);
  assert.match(text.acroField.getDefaultAppearance(), /11 Tf/);
  assert.match(text.acroField.getDefaultAppearance(), /0 0 0 1 k/);
  assert.equal(text.getText(), undefined);
  assert.equal(text.acroField.getWidgets()[0].getAppearanceCharacteristics().getBackgroundColor(), undefined);
  assert.equal(result.catalog.has(PDFName.of('Metadata')), false);
  text.setText('KW 37');
  result.getForm().flatten();
  const flattened = await PDFDocument.load(await result.save());
  assert.equal(flattened.getForm().getFields().length, 0);
});

test('repeated names share a field across pages', async () => {
  const result = await PDFDocument.load(await addFields(await fixture(), manifest([field, { ...field, pageIndex: 0 }])));
  assert.equal(result.getForm().getFields().length, 1);
  assert.equal(result.getForm().getTextField('WEEK_NUM').acroField.getWidgets().length, 2);
});

test('rejects unknown tags, mismatched trim, out-of-page bounds and conflicting repeated styles', async () => {
  const bytes = await fixture();
  await assert.rejects(addFields(bytes, manifest([{ ...field, name: 'SCHOOL_NAME' }])), /Unsupported/);
  await assert.rejects(addFields(bytes, { ...manifest([field]), pages: [{ width: 240, height: 340 }, { width: 240, height: 340 }] }), /trim/);
  await assert.rejects(addFields(bytes, manifest([{ ...field, left: 190 }])), /bounds/);
  await assert.rejects(addFields(bytes, manifest([field, { ...field, fontSize: 20 }])), /conflicting/);
});
