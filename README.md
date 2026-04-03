# OAV Jamagorada — Report Card System

A static web app for **Odisha Adarsha Vidyalaya, Jamagorada** that lets teachers look up individual student report cards and view class-level performance analytics. No backend or database — runs entirely from JSON files on GitHub Pages.

---

## Features

### Report Cards (`index.html`)
- Search students by name or admission number, filtered by class (VI–XII)
- Full CBSE-format report card: student info, marks across 6 exams (PT-I, PT-II, Half-Yearly, PT-III, PT-IV, Annual), co-scholastic grades, attendance, rank, pass/fail status
- 8-point grading scale (A1 → E)
- Print / Save as PDF via browser

### Class Performance Dashboard (`dashboard.html`)
**Section 1 — Class Overview**
- KPI cards: Total students, Pass %, Fail count, Class average, Topper, Top score
- Grade distribution table and bar chart
- Top 5 rank holders and Bottom 5 at-risk students
- Failed students table with subject-wise breakdown (which subjects each student failed)

**Section 2 — Subject-wise Analysis**
- Subject performance table: average, highest, lowest, pass/fail counts per subject
- Section A vs Section B average comparison
- Pass vs Fail stacked bar chart per subject

**Section 3 — Cross-Class Subject Trend**
- Subject dropdown to select one subject at a time
- Line chart showing that subject's class average from Class VI to XII
- Gaps shown where a subject is not offered (e.g. Sanskrit in Class XI/XII)

---

## Project Structure

```
report-card-system/
├── index.html          # Report card viewer
├── dashboard.html      # Class performance dashboard
├── script.js           # Report card logic
├── dashboard.js        # Dashboard logic and charts
├── style.css           # Shared styles (print-optimised + dashboard)
├── convert.py          # Excel → JSON data pipeline
├── template.xlsx       # Excel data entry template
├── assets/
│   ├── oav-logo.png
│   └── cbse-logo.png
└── data/
    ├── class6.json     # 76 students
    ├── class7.json     # 73 students
    ├── class8.json     # 79 students
    ├── class9.json     # 73 students
    ├── class10.json    # 71 students
    ├── class11.json    # 27 students
    └── class12.json    # 21 students
```

---

## Deploying to GitHub Pages

1. Push this repository to GitHub
2. Go to **Settings → Pages**
3. Set source to **main branch**, root folder
4. Save — your site will be live at `https://<username>.github.io/report-card-system/`

---

## Updating Student Data

Data lives in `/data/class6.json` … `class12.json`. To update for a new exam cycle:

1. Fill in `template.xlsx` with the new marks
2. Run the conversion script:
   ```bash
   python convert.py
   ```
   This reads the Excel file and regenerates all JSON files in `/data/`.
3. Commit and push the updated JSON files — the site updates automatically.

> The script calculates totals, percentages, grades (A1–E), and class rankings automatically.

---

## Pass / Fail Criteria

A student **passes** only if they score **≥ 33 out of 100** in **every subject** individually (CBSE standard). A high overall percentage does not override a subject failure.

- Absent (ABS) in any subject = fail for that subject
- Grade D = 33–40% | Grade E (Fail) = below 33%

---

## Tech Stack

- Vanilla HTML / CSS / JavaScript — no build tools, no framework
- [Chart.js](https://www.chartjs.org/) (CDN) for all charts
- Python 3 + openpyxl for the data pipeline
- GitHub Pages for hosting
