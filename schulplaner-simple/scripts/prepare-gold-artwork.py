"""Run: uv run --with pymupdf python scripts/prepare-gold-artwork.py.

Extract the approved gold variant and remove the sample week text.
Original vector artwork and A5 trim/bleed boxes remain intact.
"""
from pathlib import Path
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'modules/gold'
OUT.mkdir(parents=True, exist_ok=True)


def extract(source, indices, target):
    original = fitz.open(ROOT / 'received-planner' / source)
    doc = fitz.open()
    for index in indices:
        doc.insert_pdf(original, from_page=index, to_page=index)
    if target == 'wochenplan-artwork.pdf':
        page = doc[0]
        pix = page.get_pixmap(colorspace=fitz.csRGB)
        bg = tuple(c / 255 for c in pix.pixel(30, 45))
        page.add_redact_annot(fitz.Rect(25, 48, 412, 63), fill=bg)
        page.apply_redactions(images=0, graphics=0)
        assert 'August 2026' not in page.get_text()
        assert 'KW34' not in page.get_text()
    doc.save(OUT / target, garbage=4, deflate=True)
    print(target, len(doc), 'pages')


extract('wochenplan_2.pdf', [2, 3], 'wochenplan-artwork.pdf')
extract('stundenplan_einzeln.pdf', [2, 3], 'stundenplan.pdf')
extract('meine_leistungen_2604.pdf', [1], 'meine-leistungen.pdf')
