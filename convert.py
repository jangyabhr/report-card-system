"""
convert.py — OAV Report Card Data Converter
============================================
Reads template.xlsx and outputs one JSON file per class into data/

Usage:
    python3 convert.py                     # uses template.xlsx in same folder
    python3 convert.py path/to/file.xlsx   # custom file path

Template format (one sheet per class, named "Class 6" … "Class 12"):
    Row 1  : Headers — auto-detects subjects from "ANN <SUBJECT>" columns
    Row 2  : Max marks per column (numeric)
    Row 3+ : Student data (one student per row)

Subjects and max marks are detected automatically per sheet — no hardcoding.
"""

import sys
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

# ── Configuration ─────────────────────────────────────────────────────────────

SHEET_TO_CLASS = {
    "Class 6":  "class6",
    "Class 7":  "class7",
    "Class 8":  "class8",
    "Class 9":  "class9",
    "Class 10": "class10",
    "Class 11": "class11",
    "Class 12": "class12",
}

# Template header prefix → JSON exam key
EXAM_PREFIX_MAP = {
    "PT1": "PT-I",
    "PT2": "PT-II",
    "HFY": "HFY",
    "PT3": "PT-III",
    "PT4": "PT-IV",
    "ANN": "ANNUAL",
    "IA":  "IA",
}

CO_SCHO_MAP = {
    "WORK EDUCATION":  "WORK EDUCATION",
    "ART EDUCATION":   "ART EDUCATION",
    "HEALTH PE":       "HEALTH & PHYSICAL EDUCATION",
    "DISCIPLINE":      "DISCIPLINE",
    "SPORTS":          "SPORTS",
}

GRADE_SCALE = [
    (91, "A1"), (81, "A2"), (71, "B1"), (61, "B2"),
    (51, "C1"), (41, "C2"), (33, "D"),  (0,  "E"),
]

OUTPUT_DIR = Path(__file__).parent / "data"

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_grade(pct):
    for threshold, grade in GRADE_SCALE:
        if pct >= threshold:
            return grade
    return "E"

def safe_val(v):
    """Return int/float, 'ABS' for absent, or None for blank."""
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return None
    if isinstance(v, str) and v.strip().upper() == "ABS":
        return "ABS"
    try:
        f = float(v)
        return int(f) if f == int(f) else round(f, 2)
    except (ValueError, TypeError):
        return str(v).strip() or None

def safe_str(v):
    if v is None:
        return None
    return str(v).strip() or None

# ── XLSX low-level reader (zip + XML, no openpyxl) ────────────────────────────

def load_workbook_xml(xlsx_path):
    """
    Returns dict: { sheet_name: list_of_row_dicts }
    Each row_dict maps column_letter → cell_value (str/int/float).
    """
    with zipfile.ZipFile(xlsx_path, 'r') as z:
        # Shared strings
        strings = []
        with z.open('xl/sharedStrings.xml') as f:
            root = ET.parse(f).getroot()
            for si in root.findall(f'{NS}si'):
                t = si.find(f'{NS}t')
                if t is not None:
                    strings.append(t.text or '')
                else:
                    parts = [r.find(f'{NS}t') for r in si.findall(f'{NS}r')]
                    strings.append(''.join(p.text or '' for p in parts if p is not None))

        # Sheet list
        with z.open('xl/workbook.xml') as f:
            root = ET.parse(f).getroot()
            RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
            sheets = [(s.get('name'), s.get(RID))
                      for s in root.find(f'{NS}sheets').findall(f'{NS}sheet')]

        # Relationships
        with z.open('xl/_rels/workbook.xml.rels') as f:
            root = ET.parse(f).getroot()
            PKG = '{http://schemas.openxmlformats.org/package/2006/relationships}'
            rels = {r.get('Id'): r.get('Target')
                    for r in root.findall(f'{PKG}Relationship')}

        def parse_ws(target):
            path = f'xl/{target.lstrip("/")}'
            with z.open(path) as f:
                root = ET.parse(f).getroot()
            rows = []
            for row_el in root.find(f'{NS}sheetData').findall(f'{NS}row'):
                row = {}
                for c in row_el.findall(f'{NS}c'):
                    col = re.match(r'([A-Z]+)', c.get('r')).group(1)
                    t = c.get('t', '')
                    v_el = c.find(f'{NS}v')
                    if v_el is not None and v_el.text is not None:
                        if t == 's':
                            row[col] = strings[int(v_el.text)]
                        else:
                            raw = v_el.text
                            try:
                                row[col] = int(raw) if '.' not in raw else float(raw)
                            except ValueError:
                                row[col] = raw
                rows.append(row)
            return rows

        wb = {}
        for name, rid in sheets:
            target = rels.get(rid, '')
            if not target or 'worksheet' not in target:
                continue
            try:
                wb[name] = parse_ws(target)
            except Exception as e:
                print(f"  [WARN] Could not read sheet '{name}': {e}")
        return wb

# ── Column-letter sorting ─────────────────────────────────────────────────────

def col_sort_key(col_letter):
    """Sort Excel column letters correctly: A < B < ... < Z < AA < AB ..."""
    return (len(col_letter), col_letter)

# ── Sheet processing ──────────────────────────────────────────────────────────

def process_sheet(rows, sheet_name):
    if len(rows) < 3:
        print(f"  [SKIP] {sheet_name}: fewer than 3 rows")
        return {}

    header_row   = rows[0]   # Row 1: column headers
    max_mark_row = rows[1]   # Row 2: max marks
    data_rows    = rows[2:]  # Row 3+: students

    # Build header map: UPPER(header) → col_letter
    hdr = {str(v).strip().upper(): k for k, v in header_row.items() if v is not None and str(v).strip()}

    # Build max marks map: col_letter → numeric max mark
    col_max = {k: v for k, v in max_mark_row.items() if isinstance(v, (int, float))}

    # ── Auto-detect subjects from "ANN <SUBJECT>" headers ───────────────
    # Collect (col_letter, subject_name) sorted by column position
    ann_entries = []
    for h_upper, col_letter in hdr.items():
        if h_upper.startswith("ANN "):
            sub = h_upper[4:].strip()
            ann_entries.append((col_letter, sub))
    ann_entries.sort(key=lambda x: col_sort_key(x[0]))
    subjects = [sub for _, sub in ann_entries]

    if not subjects:
        print(f"  [ERROR] {sheet_name}: no 'ANN <SUBJECT>' columns found")
        return {}

    max_total = len(subjects) * 100

    # Verify essential student-info columns
    for req in ["ADMISSION NO", "NAME"]:
        if req not in hdr:
            print(f"  [ERROR] {sheet_name}: required column '{req}' not found")
            return {}

    # ── Process each student row ─────────────────────────────────────────
    students = []

    for row in data_rows:
        adm  = safe_str(row.get(hdr.get("ADMISSION NO")))
        name = safe_str(row.get(hdr.get("NAME")))

        if not adm and not name:
            continue   # blank row
        if not name:
            print(f"  [WARN] Admission {adm} has no name — skipping")
            continue
        if not adm:
            adm = f"UNKNOWN_{name}"

        student = {
            "name":        name,
            "father_name": safe_str(row.get(hdr.get("FATHER NAME"))) if "FATHER NAME" in hdr else None,
            "dob":         safe_str(row.get(hdr.get("DOB")))          if "DOB" in hdr else None,
            "roll":        safe_val(row.get(hdr.get("ROLL NO")))       if "ROLL NO" in hdr else None,
            "section":     safe_str(row.get(hdr.get("SECTION")))       if "SECTION" in hdr else None,
            "attendance":  safe_val(row.get(hdr.get("ATTENDANCE")))    if "ATTENDANCE" in hdr else None,
            "subjects":    subjects,
            "max_total":   max_total,
        }

        # Co-scholastic
        co = {}
        for tmpl_key, json_key in CO_SCHO_MAP.items():
            if tmpl_key in hdr:
                co[json_key] = safe_str(row.get(hdr[tmpl_key]))
        student["co_scholastic"] = co

        # Exam marks — iterate over each exam prefix
        exams = {}
        for tmpl_prefix, json_key in EXAM_PREFIX_MAP.items():
            subj_marks = {}
            for sub in subjects:
                h_key = f"{tmpl_prefix} {sub}"
                col_letter = hdr.get(h_key)
                subj_marks[sub] = safe_val(row.get(col_letter)) if col_letter else None
            exams[json_key] = subj_marks

        # TOTAL per subject = ANNUAL + IA
        totals = {}
        for sub in subjects:
            ann = exams["ANNUAL"].get(sub)
            ia  = exams["IA"].get(sub)
            if ann == "ABS" or ia == "ABS":
                totals[sub] = "ABS"
            elif isinstance(ann, (int, float)) and isinstance(ia, (int, float)):
                totals[sub] = ann + ia
            else:
                totals[sub] = None
        exams["TOTAL"] = totals

        student["exams"] = exams

        # Overall total & percentage
        total_marks = sum(t for sub in subjects
                          if isinstance(t := totals.get(sub), (int, float)))
        student["total"]   = total_marks
        student["percent"] = round(total_marks / max_total * 100, 2) if max_total > 0 else 0
        student["grade"]   = get_grade(student["percent"])

        students.append((adm, student))

    # Rank by percent descending
    students.sort(key=lambda x: x[1]["percent"], reverse=True)
    for rank, (_, s) in enumerate(students, start=1):
        s["rank"] = rank

    result = {adm: s for adm, s in students}
    print(f"  [OK] {sheet_name}: {len(result)} students | "
          f"{len(subjects)} subjects | max_total={max_total}")
    print(f"       subjects: {subjects}")
    return result

# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "template.xlsx"

    if not xlsx_path.exists():
        print(f"ERROR: File not found: {xlsx_path}")
        sys.exit(1)

    print(f"Reading: {xlsx_path}\n")
    wb = load_workbook_xml(xlsx_path)
    print(f"Sheets found: {list(wb.keys())}\n")

    OUTPUT_DIR.mkdir(exist_ok=True)
    generated = []

    for sheet_name, class_key in SHEET_TO_CLASS.items():
        if sheet_name not in wb:
            print(f"  [SKIP] Sheet '{sheet_name}' not in workbook")
            continue

        class_data = process_sheet(wb[sheet_name], sheet_name)

        if class_data:
            out_path = OUTPUT_DIR / f"{class_key}.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(class_data, f, indent=2, ensure_ascii=False)
            print(f"         → {out_path}\n")
            generated.append(str(out_path))

    print(f"Done. {len(generated)} file(s) written.")

if __name__ == "__main__":
    main()
