import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Resolve the project's existing dependency without a separate installation.
const require = createRequire(new URL('../../packages/pdf-pipeline/package.json', import.meta.url));
const { PDFDocument, StandardFonts, TextAlignment, cmyk } = require('pdf-lib');
const coverTags = ['BOOK_TITLE', 'FROM_TO'];
const plannerTags = ['xA', 'xB', 'xC', 'xD', 'xE', 'xA_Date', 'xB_Date', 'xC_Date', 'xD_Date', 'xE_Date', 'WEEK_FROMTO', 'WEEK_NUM'];

export async function addFields(bytes, manifest) {
  const allowed = manifest.module === 'cover' ? coverTags : manifest.module === 'planner' ? plannerTags : null;
  if (!allowed || manifest.version !== 1) throw new Error('Unsupported field manifest.');
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const count = manifest.module === 'cover' ? 4 : 2;
  if (pages.length !== count || manifest.pages?.length !== count) throw new Error(`Expected ${count} matching pages.`);
  const form = doc.getForm();
  if (form.getFields().length) throw new Error('The artwork PDF already contains form fields.');
  if (!manifest.fields?.length) throw new Error('No text fields found.');
  for (let i = 0; i < count; i++) {
    const trim = pages[i].getTrimBox();
    const source = manifest.pages[i];
    if (!Number.isFinite(source.width) || !Number.isFinite(source.height) || Math.abs(trim.width - source.width) > 0.5 || Math.abs(trim.height - source.height) > 0.5 || pages[i].getRotation().angle !== 0) {
      throw new Error(`Page ${i + 1}: exported trim size/rotation does not match InDesign.`);
    }
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const created = new Map();
  for (const spec of manifest.fields) {
    if (!allowed.includes(spec.name)) throw new Error(`Unsupported ${manifest.module} field: ${spec.name}. Add a generator mapping first.`);
    if (!Number.isInteger(spec.pageIndex) || !pages[spec.pageIndex]) throw new Error(`Invalid page for ${spec.name}.`);
    const { left, top, width, height, fontSize } = spec;
    const page = pages[spec.pageIndex];
    const trim = page.getTrimBox();
    if (![left, top, width, height, fontSize].every(Number.isFinite) || width <= 0 || height <= 0 || fontSize < 0 || left < 0 || top < 0 || left + width > trim.width + 0.5 || top + height > trim.height + 0.5) throw new Error(`Invalid or out-of-page bounds for ${spec.name}.`);
    const alignment = spec.alignment ?? 'left';
    if (!['left', 'center', 'right'].includes(alignment)) throw new Error(`Invalid alignment for ${spec.name}.`);
    const style = JSON.stringify([fontSize, Boolean(spec.multiline), alignment]);
    let entry = created.get(spec.name);
    if (entry && entry.style !== style) throw new Error(`Repeated field ${spec.name} has conflicting formatting.`);
    if (!entry) {
      const field = form.createTextField(spec.name);
      field.setAlignment({ left: TextAlignment.Left, center: TextAlignment.Center, right: TextAlignment.Right }[alignment]);
      if (spec.multiline) field.enableMultiline();
      entry = { field, style };
      created.set(spec.name, entry);
    }
    entry.field.addToPage(page, {
      x: trim.x + left, y: trim.y + trim.height - top - height,
      width, height, borderWidth: 0, backgroundColor: undefined,
      borderColor: undefined, font, textColor: cmyk(0, 0, 0, 1),
    });
    // addToPage initializes the default appearance; set size afterwards.
    entry.field.setFontSize(fontSize);
  }
  if (manifest.module === 'cover' && coverTags.some(name => !created.has(name))) throw new Error('Cover needs BOOK_TITLE and FROM_TO.');
  // This is a working template with annotations, not a certified PDF/X file.
  // Do not carry a stale PDF/X conformance declaration into the form template.
  if (doc.context.trailerInfo.Info) {
    const info = doc.context.lookup(doc.context.trailerInfo.Info);
    const { PDFName } = require('pdf-lib');
    info.delete(PDFName.of('GTS_PDFXVersion'));
    info.delete(PDFName.of('GTS_PDFXConformance'));
  }
  // XMP can also declare PDF/X conformance; retain profiles/output intents,
  // but remove the obsolete metadata packet from the intermediate template.
  const { PDFName } = require('pdf-lib');
  doc.catalog.delete(PDFName.of('Metadata'));
  return doc.save();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [artwork, manifestPath, output] = process.argv.slice(2);
    if (!artwork || !manifestPath || !output) throw new Error('Usage: node add-fields.mjs artwork.pdf fields.json template.pdf');
    const bytes = await addFields(await readFile(artwork), JSON.parse(await readFile(manifestPath, 'utf8')));
    await writeFile(output, bytes, { flag: 'wx' });
    console.log(`Created ${output}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
