let data = {};
let chartInstance = null;

const SUBJECTS = ["ENGLISH", "ODIA", "HINDI", "SANSKRIT", "MATHEMATICS", "SCIENCE", "SOCIAL SCIENCE", "ICT"];

// Max marks per exam for percentage calculation
const EXAM_MAX = { "PT-I": 320, "PT-II": 320, "HFY": 800, "PT-III": 320, "PT-IV": 320 };

const GRADE_SCALE = [
  { min: 91, grade: "A1", color: "#2e7d32" },
  { min: 81, grade: "A2", color: "#388e3c" },
  { min: 71, grade: "B1", color: "#689f38" },
  { min: 61, grade: "B2", color: "#f9a825" },
  { min: 51, grade: "C1", color: "#ef6c00" },
  { min: 41, grade: "C2", color: "#e53935" },
  { min: 33, grade: "D",  color: "#b71c1c" },
  { min: 0,  grade: "E",  color: "#880e4f" },
];

function getGrade(pct) {
  for (const g of GRADE_SCALE) {
    if (pct >= g.min) return g;
  }
  return GRADE_SCALE[GRADE_SCALE.length - 1];
}

// Compute true weighted % from all exam components
// PT-I/II/III/IV: 10% each (max 40), HFY: 20% (max 100), Annual (TOTAL=ANNUAL+IA): 40% (max 100)
function computeWeighted(exams, sub) {
  const total = (exams.TOTAL || {})[sub];
  if (total === "ABS") return "ABS";

  const pt1 = exams["PT-I"]?.[sub];
  const pt2 = exams["PT-II"]?.[sub];
  const hfy = exams["HFY"]?.[sub];
  const pt3 = exams["PT-III"]?.[sub];
  const pt4 = exams["PT-IV"]?.[sub];

  const toNum = v => (typeof v === "number" ? v : 0);

  const w = toNum(pt1) / 40 * 10
          + toNum(pt2) / 40 * 10
          + toNum(hfy) / 100 * 20
          + toNum(pt3) / 40 * 10
          + toNum(pt4) / 40 * 10
          + toNum(total) / 100 * 40;

  return typeof total === "number" ? w : null;
}

function getClassName() {
  const map = {
    class6: "VI", class7: "VII", class8: "VIII", class9: "IX",
    class10: "X", class11: "XI", class12: "XII"
  };
  return map[document.getElementById("classSelect").value] || "";
}

// Render a mark cell — shows ABS in red, number normally, "-" for null/undefined
function mc(val, cssClass) {
  const display = (val === null || val === undefined) ? "-"
                : (typeof val === "number" ? +val.toFixed(2) : val);
  const isAbs   = val === "ABS";
  const extra   = isAbs ? ' style="background:#ffcdd2;color:#b71c1c;font-weight:bold"' : '';
  return `<td class="${cssClass}"${extra}>${display}</td>`;
}

// Sum numeric marks for an exam across all subjects (skip ABS/null)
function examTotal(exams, key, subjects) {
  const e = exams[key];
  if (!e) return null;
  const subs = subjects || SUBJECTS;
  let sum = 0, count = 0;
  for (const sub of subs) {
    const v = e[sub];
    if (typeof v === "number") { sum += v; count++; }
  }
  return count === subs.length ? sum : (count > 0 ? sum : null);
}

async function loadClassData() {
  const cls = document.getElementById("classSelect").value;
  try {
    const res = await fetch(`data/${cls}.json`);
    data = await res.json();
  } catch {
    data = {};
  }
  document.getElementById("report-wrapper").innerHTML = "";
  document.getElementById("dl-wrap").style.display = "none";
  document.getElementById("search").value = "";
  document.getElementById("suggestions").innerHTML = "";
}

loadClassData();
document.getElementById("classSelect").addEventListener("change", loadClassData);

document.getElementById("search").addEventListener("input", function () {
  const val = this.value.toLowerCase().trim();
  const sug = document.getElementById("suggestions");
  sug.innerHTML = "";
  if (!val) return;
  for (const adm in data) {
    const s = data[adm];
    if (adm.toLowerCase().includes(val) || s.name.toLowerCase().includes(val)) {
      const d = document.createElement("div");
      d.textContent = `${s.name}  (${adm})`;
      d.onclick = () => {
        loadReport(adm);
        document.getElementById("search").value = s.name;
        sug.innerHTML = "";
      };
      sug.appendChild(d);
    }
  }
});

function loadReport(adm) {
  const s      = data[adm];
  const cls    = getClassName();
  const exams    = s.exams || {};
  const annual   = exams.ANNUAL || {};
  const totals   = exams.TOTAL  || {};
  const subjects = s.subjects || SUBJECTS;
  const n        = subjects.length;
  const maxTotal = s.max_total || 800;

  // PASS: weighted % >= 33 in every subject
  const passed = subjects.every(sub => {
    const m = computeWeighted(exams, sub);
    return typeof m === "number" && m >= 33;
  });

  // ── Subject rows ────────────────────────────────────────────────────
  let subjectRows = "";
  const weightedScores = [];  // accumulate per-subject weighted % for overall calculation

  for (const sub of subjects) {
    const pt1 = exams["PT-I"]?.[sub]   ?? null;
    const pt2 = exams["PT-II"]?.[sub]  ?? null;
    const hfy = exams["HFY"]?.[sub]    ?? null;
    const pt3 = exams["PT-III"]?.[sub] ?? null;
    const pt4 = exams["PT-IV"]?.[sub]  ?? null;
    const rawAnn = totals[sub] ?? null;           // ANNUAL + IA marks (for ANNUAL column display)
    const ann    = computeWeighted(exams, sub);  // true weighted % (PT×10% + HY×20% + Annual×40%)

    if (typeof ann === "number") weightedScores.push(ann);

    let wt = "-", gInfo = { grade: "-", color: "#ddd" };
    if (typeof ann === "number") {
      wt    = ann.toFixed(1);
      gInfo = getGrade(ann);
    } else if (ann === "ABS") {
      wt = "ABS"; gInfo = { grade: "ABS", color: "#ffcdd2" };
    }

    subjectRows += `
      <tr>
        <td class="sub-name">${sub}</td>
        ${mc(pt1, "mc-pt")}
        ${mc(pt2, "mc-pt")}
        ${mc(hfy, "mc-hfy")}
        ${mc(pt3, "mc-pt")}
        ${mc(pt4, "mc-pt")}
        ${mc(rawAnn, "mc-ann")}
        <td class="wt-pct">${wt}</td>
        <td class="grade-cell" style="background:${gInfo.color}">${gInfo.grade}</td>
      </tr>`;
  }

  // ── Per-exam totals for Total Marks row ─────────────────────────────
  const tPT1 = examTotal(exams, "PT-I",   subjects);
  const tPT2 = examTotal(exams, "PT-II",  subjects);
  const tHFY = examTotal(exams, "HFY",    subjects);
  const tPT3 = examTotal(exams, "PT-III", subjects);
  const tPT4 = examTotal(exams, "PT-IV",  subjects);
  const mPT = n * 40;
  const mHFY = n * 100;

  const fmtT = v => v !== null ? v : "-";
  const fmtP = (v, max) => v !== null ? (v / max * 100).toFixed(2) + "%" : "-";

  // Overall weighted % = average of per-subject weighted scores
  const overallWeightedPct = weightedScores.length > 0
    ? weightedScores.reduce((a, b) => a + b, 0) / weightedScores.length
    : 0;
  const overallGrade = getGrade(overallWeightedPct);

  // Recompute rank based on weighted % across all students in this class
  const weightedRank = Object.values(data).filter(st => {
    const ex = st.exams || {};
    const subs = st.subjects || SUBJECTS;
    const ws = subs.map(sub => computeWeighted(ex, sub)).filter(v => typeof v === "number");
    const pct = ws.length > 0 ? ws.reduce((a, b) => a + b, 0) / ws.length : 0;
    return pct > overallWeightedPct;
  }).length + 1;

  // ── Co-scholastic rows ──────────────────────────────────────────────
  const co = s.co_scholastic || {};
  const coActivities = [
    "WORK EDUCATION", "ART EDUCATION", "HEALTH & PHYSICAL EDUCATION",
    "DISCIPLINE", "SPORTS"
  ];
  const coRows = coActivities.map(act =>
    `<tr><td>${act}</td><td>${co[act] || "N/A"}</td></tr>`
  ).join("");

  const attendance = s.attendance != null ? s.attendance + " %" : "N/A";

  document.getElementById("report-wrapper").innerHTML = `
    <div class="report-card" id="report">

      <!-- School Header -->
      <div class="school-header">
        <img src="assets/oav-logo.png" class="school-logo" alt="OAV Logo">
        <div class="school-info">
          <div class="school-name">Odisha Adarsha Vidyalaya Jamagorada, Jagannathprasad, Ganjam</div>
          <p>Department of School &amp; Mass Education, Govt. of Odisha</p>
          <p>(Affiliated to CBSE, New Delhi)</p>
          <p class="details-line">Affiliation No: 1520188 &nbsp;&nbsp; School Code: 17274 &nbsp;&nbsp; UDISE CODE: 21191203852 &nbsp;&nbsp; Email: jagannathprasad@oav.edu.in</p>
        </div>
        <img src="assets/cbse-logo.png" class="school-logo" alt="CBSE Logo">
      </div>

      <!-- Title Bar -->
      <div class="title-bar">
        ANNUAL REPORT CARD<br>SESSION : 2025-26
      </div>

      <!-- Student Info + Chart -->
      <div class="student-section">
        <div class="student-left">
          <div class="photo-box">Affix<br>passport<br>size photo</div>
          <div>
            <table class="info-table">
              <tr>
                <td class="lbl">Roll No</td><td>: ${s.roll ?? "N/A"}</td>
                <td class="lbl">Reg No</td><td>: ${adm}</td>
              </tr>
              <tr>
                <td class="lbl">Class</td><td>: ${cls}</td>
                <td class="lbl">Sec</td><td>: ${s.section ?? "N/A"}</td>
              </tr>
              <tr>
                <td class="lbl">Name</td><td colspan="3">: ${s.name}</td>
              </tr>
              <tr>
                <td class="lbl">Father's Name</td><td colspan="3">: ${s.father_name || "N/A"}</td>
              </tr>
              <tr>
                <td class="lbl">DOB</td><td colspan="3">: ${s.dob || "N/A"}</td>
              </tr>
            </table>
            <div class="result-row">
              Result : <span class="badge ${passed ? "pass" : "fail"}">${passed ? "PASS" : "FAIL"}</span>
            </div>
          </div>
        </div>
        <div class="chart-wrap">
          <div class="chart-title">Yearly Report</div>
          <canvas id="yearlyChart"></canvas>
        </div>
      </div>

      <!-- Scholastic Area -->
      <div class="table-scroll">
        <table class="scholastic-table">
          <tbody>
            <tr><td class="area-banner" colspan="9">SCHOLASTIC AREA</td></tr>
            <tr>
              <td class="th-subject">Name of the exam</td>
              <td class="th-pt">PT-I</td>
              <td class="th-pt">PT-II</td>
              <td class="th-hfy">HFY</td>
              <td class="th-pt">PT-III</td>
              <td class="th-pt">PT-IV</td>
              <td class="th-ann">ANNUAL</td>
              <td class="th-wt" rowspan="2">WEIGHTED<br>%</td>
              <td class="th-grd" rowspan="2">GRADE</td>
            </tr>
            <tr>
              <td class="th-subject">Full Marks</td>
              <td class="fm-pt">40</td>
              <td class="fm-pt">40</td>
              <td class="fm-hfy">100</td>
              <td class="fm-pt">40</td>
              <td class="fm-pt">40</td>
              <td class="fm-ann">100</td>
            </tr>
            <tr>
              <td class="th-subject">Subject &amp; Marks</td>
              <td class="sub-pt">Marks Obtained</td>
              <td class="sub-pt">Marks Obtained</td>
              <td class="sub-hfy">Marks Obtained</td>
              <td class="sub-pt">Marks Obtained</td>
              <td class="sub-pt">Marks Obtained</td>
              <td class="sub-ann">Marks Obtained</td>
              <td class="sub-blank"></td>
              <td class="sub-blank"></td>
            </tr>
            ${subjectRows}
            <tr class="total-row">
              <td class="sub-name">Total Marks</td>
              <td>${fmtT(tPT1)}</td>
              <td>${fmtT(tPT2)}</td>
              <td>${fmtT(tHFY)}</td>
              <td>${fmtT(tPT3)}</td>
              <td>${fmtT(tPT4)}</td>
              <td>${s.total} / ${maxTotal}</td>
              <td>${overallWeightedPct.toFixed(2)}</td>
              <td class="grade-cell" style="background:${overallGrade.color}">${overallGrade.grade}</td>
            </tr>
            <tr class="pct-row">
              <td class="sub-name">Percentage</td>
              <td>${fmtP(tPT1, mPT)}</td>
              <td>${fmtP(tPT2, mPT)}</td>
              <td>${fmtP(tHFY, mHFY)}</td>
              <td>${fmtP(tPT3, mPT)}</td>
              <td>${fmtP(tPT4, mPT)}</td>
              <td>${(s.total / maxTotal * 100).toFixed(2)}%</td>
              <td>${overallWeightedPct.toFixed(2)}%</td>
              <td class="overall-grade-cell">OVERALL GRADE : ${overallGrade.grade} &nbsp;|&nbsp; Rank : ${weightedRank}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grading-note">
        8 Point Grading Scale :
        <strong>A1(91%-100%), A2(81%-90%), B1(71%-80%), B2(61%-70%), C1(51%-60%), C2(41%-50%), D(33%-40%), E(32%-Below)</strong>
      </div>

      <!-- Co-Scholastic Area -->
      <div class="co-section">
        <div class="co-left">
          <table class="co-table">
            <thead>
              <tr>
                <th>CO-SCHOLASTIC AREA<br><small>(3 point Grading Scale A, B &amp; C)</small></th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>${coRows}</tbody>
          </table>
        </div>
        <div class="co-right">
          <table class="gs-table">
            <thead>
              <tr><th colspan="3">Grading System<br><small>(Co-Scholastic Activities)</small></th></tr>
              <tr><th>Grade</th><th>Remarks</th><th>Point</th></tr>
            </thead>
            <tbody>
              <tr><td>A</td><td>Outstanding</td><td>3</td></tr>
              <tr><td>B</td><td>Very Good</td><td>2</td></tr>
              <tr><td>C</td><td>Fair</td><td>1</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="note-row">
        Note: Students has to Secure 33 marks out of 100 marks in each Subject of Annual Examination.
      </div>

      <!-- Attendance + Date -->
      <div class="bottom-info">
        <div><strong>Student's Attendance :</strong><span class="att-val">${attendance}</span></div>
        <div><strong>Result Publication Date : 31-03-2026</strong></div>
      </div>

      <!-- Signatures -->
      <div class="sig-section">
        <div>Signature of Parent</div>
        <div>Class Teacher</div>
        <div>Exam I/C</div>
        <div>Principal<br><strong>OAV JAMAGORADA</strong></div>
      </div>

    </div>
  `;

  document.getElementById("dl-wrap").style.display = "block";
  renderChart(s);
}

function renderChart(s) {
  const ctx = document.getElementById("yearlyChart");
  if (!ctx) return;
  if (chartInstance) { chartInstance.destroy(); }

  const exams  = s.exams || {};
  const n      = (s.subjects || SUBJECTS).length;
  const mPT    = n * 40;
  const mHFY   = n * 100;
  const subs   = s.subjects || SUBJECTS;
  const labels = ["PT-I", "PT-II", "HFY", "PT-III", "PT-IV", "ANNUAL"];
  const maxes  = [mPT, mPT, mHFY, mPT, mPT, mHFY];
  const keys   = ["PT-I", "PT-II", "HFY", "PT-III", "PT-IV", null]; // null → use s.percent

  const values = keys.map((key, i) => {
    if (key === null) return s.percent;
    const t = examTotal(exams, key, subs);
    return t !== null ? Math.round(t / maxes[i] * 100 * 100) / 100 : 0;
  });

  const colors = ["#90caf9","#90caf9","#64b5f6","#90caf9","#90caf9","#4472c4"];

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: "#1a237e",
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true, max: 100,
          ticks: { font: { size: 9 }, stepSize: 10 }
        },
        x: { ticks: { font: { size: 9 } } }
      }
    }
  });
}

function downloadPDF() {
  // Set document title → browser uses it as the default PDF filename
  const nameEl = document.querySelector('.info-table tr:nth-child(3) td:nth-child(4)');
  const studentName = nameEl
    ? nameEl.textContent.replace(/^:\s*/, '').trim()
    : 'Report Card';
  const prevTitle = document.title;
  document.title = `Report Card - ${studentName}`;
  window.print();
  document.title = prevTitle;
}
