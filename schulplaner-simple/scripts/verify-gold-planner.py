"""Integration check: uv run --with pymupdf python scripts/verify-gold-planner.py."""
from pathlib import Path
import json
import pymupdf as fitz

root = Path(__file__).resolve().parents[1]
doc = fitz.open(root / 'output/gold/schulplaner-beige-gold-2026-2027.pdf')
assert len(doc) % 4 == 0, 'Saddle-stitch page count'
assert len(doc) == 104
cover = doc[0].get_text()
assert 'Mein Schulplaner' in cover and '2026/2027' in cover
assert 'Nicht auf dem schlichten Umschlag' not in cover
assert all(not doc[i].get_text().strip() for i in [1, len(doc)-2, len(doc)-1])
weekly = [(i, p) for i, p in enumerate(doc) if 'Hausaufgaben' in p.get_text() and 'KW ' in p.get_text()]
assert len(weekly) > 40
assert all('21. bis 25. August 2026' not in p.get_text() for p in doc)
school_start = next(p for p in doc if 'Schulstart' in p.get_text())
assert '24. August bis 28. August 2026' in school_start.get_text()
assert 'KW 35' in school_start.get_text() and '24.08' in school_start.get_text()
assert 'Elternabend der Klassen 5 bis 8 um 18 Uhr in der Aula' in doc[8].get_text()
assert '27.08' in doc[8].get_text() and '28.08' in doc[8].get_text()
new_year = next(p for _, p in weekly if '28. Dezember 2026 bis 01. Januar 2027' in p.get_text())
assert 'KW 53' in new_year.get_text()
assert any('Projektwoche' in p.get_text() and '05.01' in p.get_text() for p in doc)
all_text = '\n'.join(p.get_text() for p in doc)
for name in ['1. Weihnachtsfeiertag', 'Karfreitag', 'Ostermontag', 'Christi Himmelfahrt', 'Pfingstmontag', 'Herbstferien Start', 'Tag der Deutschen Einheit']:
    assert name in all_text, name
assert 'Sa 03.10' in all_text
# Check actual text geometry, not just presence: the footer is below the
# bottom table rule and the custom event is inset within its last writing row.
for index in range(2, len(doc)-2):
    label = str(index-1)
    spans = [s for b in doc[index].get_text('dict')['blocks'] if 'lines' in b for l in b['lines'] for s in l['spans'] if s['text'] == label]
    assert spans, (index, label)
    assert any(s['bbox'][1] > 593.3 and s['bbox'][3] < 603.8 for s in spans), (index, spans)
event = doc[8].search_for('Elternabend der Klassen 5 bis 8 um 18 Uhr in der Aula')[0]
assert event.x0 > 82 and event.y0 > 158 and event.y1 < 181
for p in doc:
    assert abs(p.rect.width - 154 * 72 / 25.4) < 1
    assert abs(p.rect.height - 216 * 72 / 25.4) < 1
summary = {'pages': len(doc), 'weeklySpreads': len(weekly), 'format': 'A5 + 3 mm bleed', 'cover': 'beige/gold, title and school year only', 'checks': ['school start and ISO week', 'five day dates', 'custom events', 'year boundary and KW 53', 'beige/gold cover with title and school year only', 'page count divisible by four', 'no stale example date']}
(root / 'output/gold/verification.json').write_text(json.dumps(summary, indent=2))
sample = fitz.open()
for index in [0, 2, 3, 4, 7, 8]:
    sample.insert_pdf(doc, from_page=index, to_page=index)
sample.save(root / 'output/gold/modulvorschau-beige-gold.pdf', garbage=4, deflate=True)
corrections = fitz.open()
indices = {7, 8}
for i, page in enumerate(doc):
    if any(name in page.get_text() for name in ['Tag der Deutschen Einheit', 'Karfreitag', '1. Weihnachtsfeiertag']):
        indices.add(i)
for i in sorted(indices):
    corrections.insert_pdf(doc, from_page=i, to_page=i)
corrections.save(root / 'output/gold/korrektur-seitenzahlen-termine-feiertage.pdf', garbage=4, deflate=True)
print(json.dumps(summary))
