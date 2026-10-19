# Export Books Template

macOS InDesign script for creating a CMYK artwork PDF with real, empty text
form fields for the book generator. It exports the print artwork and reads field
geometry directly from InDesign; an interactive PDF export is unnecessary.

## Setup

The repository dependencies must already be installed (`bun install`), and
Node.js must be available. The helper resolves `pdf-lib` from the existing
`packages/pdf-pipeline` workspace.

In InDesign, open **Window → Utilities → Scripts**. Right-click **User** and
choose **Reveal in Finder**. Put an alias to **Export Books Template.jsx** in
that Scripts Panel folder. Keep the original script and `add-fields.mjs` together
in this repository. Alternatively, put an alias to this entire directory there.

## Prepare a document

1. Use four pages for a cover or two pages for a Wochenplaner.
2. Create a layer named `BOOKS_FIELDS`. Keep all artwork on other layers.
3. On that layer, create rectangle frames and convert them to **Text Field** via
   **Window → Interactive → Buttons and Forms**. Name each field with a tag below.
4. Set the rectangle to the intended text area and choose a font size in the
   Buttons and Forms panel. Set multiline if needed. Keep fields unrotated and
   unsheared, entirely inside their page. Use document pages rather than parent
   pages. Leave the field appearance empty; the whole layer is excluded from
   the print artwork export.
5. Double-click **Export Books Template** in the Scripts panel, select your
   production CMYK print preset and an output folder.

Each run creates its own folder containing `artwork.pdf`, `fields.json`, and
`<document>-template.pdf`. Upload the **template** PDF as your module. The helper
does not flatten its fields. The script restores layer visibility, printability,
measurement units, ruler origin, zero point and page range after export.

The chosen preset determines artwork colour conversion and output profile.
The script forces all pages into one PDF, with individual pages rather than
spreads, and exports visible printable layers. Bleed and printer marks are
supported: positions are calculated from the exported TrimBox, whose dimensions
must match the InDesign pages.

## Supported names

- Cover: `BOOK_TITLE`, `FROM_TO` (both required).
- Wochenplaner: `xA`, `xB`, `xC`, `xD`, `xE`, `xA_Date`, `xB_Date`, `xC_Date`,
  `xD_Date`, `xE_Date`, `WEEK_FROMTO`, `WEEK_NUM`.

Repeated names create multiple widgets of the same field; they must use matching
font sizes, alignment and multiline settings. Unsupported names fail explicitly.
`SCHOOL_NAME` needs a generator mapping before it can be supported.

## Typography and print output

Fields currently use Helvetica and CMYK 100% K black, matching the planner
pipeline's current font choice. InDesign's chosen font family isn't transferred.
Alignment defaults to left; advanced users can set an InDesign field's script
label using `field.insertLabel('booksAlignment', 'center')` or `'right'`.
Font size zero enables PDF automatic sizing.

The output is an intermediate form template, not a certified PDF/X deliverable.
The helper removes PDF/X declarations and the original XMP metadata packet;
artwork content streams and output intents remain in place. Generate and flatten
the finished book before final print preflight. Existing generator colour and
font handling still applies to inserted text.

## Verification

Run `node --test scripts/indesign/add-fields.test.mjs`.

The helper tests cover bleed/mark offsets, artwork preservation, filling and
flattening, repeated fields, and invalid field definitions. The InDesign export
still needs a live document check before production use.

To rerun a saved export manually:

```sh
node scripts/indesign/add-fields.mjs /path/artwork.pdf /path/fields.json /path/template.pdf
```

The helper refuses to overwrite an existing output.
