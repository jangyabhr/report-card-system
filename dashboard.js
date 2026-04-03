// ── Shared constants (copied from script.js — no import to avoid DOM side-effects) ──
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

const CLASS_LABELS = {
  class6: "VI", class7: "VII", class8: "VIII",
  class9: "IX", class10: "X", class11: "XI", class12: "XII"
};
const CLASS_FILES = ["class6", "class7", "class8", "class9", "class10", "class11", "class12"];

const SUBJECT_COLORS = [
  "#1565c0", "#2e7d32", "#f57f17", "#6a1b9a",
  "#c62828", "#00838f", "#4e342e", "#37474f"
];

// ── State ────────────────────────────────────────────────────────────────────
let data = {};
let gradeChartInstance = null;
let subjectChartInstance = null;
let crossClassChartInstance = null;
const allClassData = {};

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadClassData() {
  const cls = document.getElementById("classSelect").value;
  sessionStorage.setItem("lastClass", cls);

  document.getElementById("dashboard-wrapper").style.display = "none";
  document.getElementById("loading-msg").style.display = "block";
  document.getElementById("error-msg").style.display = "none";

  try {
    const res = await fetch(`data/${cls}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    data = {};
    document.getElementById("loading-msg").style.display = "none";
    document.getElementById("error-msg").style.display = "block";
    document.getElementById("error-msg").textContent = `Failed to load data for ${CLASS_LABELS[cls] || cls}. Please check the data files.`;
    return;
  }

  renderDashboard();
}

async function loadAllClassData() {
  const results = await Promise.all(
    CLASS_FILES.map(cls =>
      fetch(`data/${cls}.json`)
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}))
    )
  );
  CLASS_FILES.forEach((cls, i) => { allClassData[cls] = results[i]; });
  document.getElementById("cross-class-loading").style.display = "none";

  const { subjects } = computeCrossClassStats();
  const sel = document.getElementById("subjectSelect");
  sel.innerHTML = subjects.map(s => `<option value="${s}">${s}</option>`).join("");
  sel.addEventListener("change", () => renderCrossClassChart(sel.value));
  renderCrossClassChart(subjects[0]);
}

// ── Core aggregation ─────────────────────────────────────────────────────────
function computeStats(classData) {
  const students = Object.values(classData);
  const total = students.length;
  if (total === 0) return null;

  // Determine pass/fail per student
  const studentResults = students.map(s => {
    const totals = s.exams?.TOTAL || {};
    const subjects = s.subjects || [];
    const passed = subjects.length > 0 && subjects.every(sub => {
      const m = totals[sub];
      return typeof m === "number" && m >= 33;
    });
    return { ...s, passed };
  });

  const passCount = studentResults.filter(s => s.passed).length;
  const failCount = total - passCount;
  const passPct = ((passCount / total) * 100).toFixed(1);
  const classAvg = (students.reduce((sum, s) => sum + (s.percent || 0), 0) / total).toFixed(1);

  // Topper = student with rank 1
  const topper = students.reduce((a, b) => ((a.rank || 999) < (b.rank || 999) ? a : b));

  // Grade bands
  const BANDS = [
    { label: "90%+ (Outstanding)", min: 90, max: Infinity },
    { label: "80-90% (Excellent)",  min: 80, max: 90 },
    { label: "70-80% (Very Good)",  min: 70, max: 80 },
    { label: "60-70% (Good)",       min: 60, max: 70 },
    { label: "33-60% (Average)",    min: 33, max: 60 },
    { label: "<33% (Fail)",         min: -Infinity, max: 33, isFail: true },
  ];
  const gradeBands = BANDS.map(band => {
    const count = band.isFail
      ? failCount
      : studentResults.filter(s => s.passed && s.percent >= band.min && s.percent < band.max).length;
    return { ...band, count, pct: ((count / total) * 100).toFixed(1) };
  });

  // Top 5 / bottom 5
  const sorted = [...students].sort((a, b) => (a.rank || 9999) - (b.rank || 9999));
  const top5    = sorted.slice(0, 5);
  const bottom5 = sorted.slice(-5).reverse();

  // Subject list (union from student records)
  const subjectSet = new Set();
  students.forEach(s => (s.subjects || []).forEach(sub => subjectSet.add(sub)));
  const allSubjects = [...subjectSet];

  // Subject stats
  const subjectStats = allSubjects.map(sub => {
    const marks = [];
    students.forEach(s => {
      const v = s.exams?.TOTAL?.[sub];
      if (typeof v === "number") marks.push(v);
    });
    if (marks.length === 0) return null;
    const passMarks = marks.filter(m => m >= 33);
    return {
      subject: sub,
      avg: (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1),
      high: Math.max(...marks),
      low:  Math.min(...marks),
      pass: passMarks.length,
      fail: marks.length - passMarks.length,
      passPct: ((passMarks.length / marks.length) * 100).toFixed(1),
    };
  }).filter(Boolean);

  // Section-wise averages
  const sections = [...new Set(students.map(s => s.section))].filter(Boolean).sort();
  const sectionData = {};
  sections.forEach(sec => {
    const secStudents = students.filter(s => s.section === sec);
    sectionData[sec] = {};
    allSubjects.forEach(sub => {
      const marks = secStudents
        .map(s => s.exams?.TOTAL?.[sub])
        .filter(v => typeof v === "number");
      sectionData[sec][sub] = marks.length > 0
        ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1)
        : null;
    });
  });

  // Failed students with per-subject breakdown
  const failedStudents = studentResults
    .filter(s => !s.passed)
    .map(s => {
      const totals = s.exams?.TOTAL || {};
      const failedSubjects = (s.subjects || []).filter(sub => {
        const m = totals[sub];
        return !(typeof m === "number" && m >= 33);
      });
      return { name: s.name, section: s.section, rank: s.rank, percent: s.percent, failedSubjects };
    })
    .sort((a, b) => (a.rank || 9999) - (b.rank || 9999));

  return { total, passCount, failCount, passPct, classAvg, topper, gradeBands, top5, bottom5, subjectStats, allSubjects, sections, sectionData, failedStudents };
}

// ── Cross-class aggregation ───────────────────────────────────────────────────
function computeCrossClassStats() {
  // For each class, compute per-subject average from TOTAL column
  const subjectClassCounts = {}; // track how many classes each subject appears in

  const seriesData = {}; // subject -> [avg for class6, class7, ...]
  CLASS_FILES.forEach(cls => {
    const students = Object.values(allClassData[cls] || {});
    const subjectSet = new Set();
    students.forEach(s => (s.subjects || []).forEach(sub => subjectSet.add(sub)));

    subjectSet.forEach(sub => {
      if (!seriesData[sub]) seriesData[sub] = {};
      subjectClassCounts[sub] = (subjectClassCounts[sub] || 0) + 1;
      const marks = students
        .map(s => s.exams?.TOTAL?.[sub])
        .filter(v => typeof v === "number");
      seriesData[sub][cls] = marks.length > 0
        ? parseFloat((marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1))
        : null;
    });
  });

  // Only include subjects present in >= 2 classes
  const subjects = Object.keys(subjectClassCounts).filter(s => subjectClassCounts[s] >= 2);

  return { subjects, seriesData };
}

// ── Render functions ─────────────────────────────────────────────────────────
function renderKPICards(stats) {
  const topperName = stats.topper?.name || "—";
  const topperScore = stats.topper?.percent != null ? stats.topper.percent + "%" : "—";
  const cards = [
    { label: "Total Students", value: stats.total },
    { label: "Pass %",         value: stats.passPct + "%", highlight: true },
    { label: "Fail / ER",      value: stats.failCount, warn: stats.failCount > 0 },
    { label: "Class Average %",value: stats.classAvg + "%" },
    { label: "Topper",         value: topperName, small: true },
    { label: "Top Score %",    value: topperScore, highlight: true },
  ];
  document.getElementById("kpi-row").innerHTML = cards.map(c => {
    const cls = c.highlight ? " kpi-highlight" : c.warn ? " kpi-warn" : "";
    const style = c.small ? ' style="font-size:14px;"' : '';
    return `<div class="kpi-card${cls}"><div class="kpi-value"${style}>${c.value}</div><div class="kpi-label">${c.label}</div></div>`;
  }).join("");
}

function renderGradeDistTable(stats) {
  document.getElementById("grade-dist-tbody").innerHTML = stats.gradeBands.map(b => {
    const failRow = b.isFail && b.count > 0 ? ' class="fail-row"' : '';
    return `<tr${failRow}><td>${b.label}</td><td>${b.count}</td><td>${b.pct}%</td></tr>`;
  }).join("");
}

function renderRankTable(students, tbodyId) {
  document.getElementById(tbodyId).innerHTML = students.map(s =>
    `<tr><td>${s.rank}</td><td>${s.name}</td><td>${s.section || "—"}</td><td>${s.percent}%</td></tr>`
  ).join("");
}

function renderSubjectTable(stats) {
  document.getElementById("subject-tbody").innerHTML = stats.subjectStats.map(s =>
    `<tr>
      <td>${s.subject}</td>
      <td>${s.avg}</td>
      <td>${s.high}</td>
      <td>${s.low}</td>
      <td>${s.pass}</td>
      <td class="${s.fail > 0 ? 'fail-cell' : ''}">${s.fail}</td>
      <td>${s.passPct}%</td>
    </tr>`
  ).join("");
}

function renderSectionTable(stats) {
  const tbody = document.getElementById("section-tbody");
  if (stats.sections.length < 2) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#888;padding:12px;">Only one section — comparison not applicable.</td></tr>`;
    return;
  }
  const [secA, secB] = stats.sections;
  tbody.innerHTML = stats.allSubjects.map(sub => {
    const a = parseFloat(stats.sectionData[secA]?.[sub]);
    const b = parseFloat(stats.sectionData[secB]?.[sub]);
    const aVal = isNaN(a) ? "—" : a.toFixed(1);
    const bVal = isNaN(b) ? "—" : b.toFixed(1);
    let diff = "—", diffClass = "";
    if (!isNaN(a) && !isNaN(b)) {
      const d = (a - b).toFixed(1);
      diff = (parseFloat(d) > 0 ? "+" : "") + d;
      diffClass = parseFloat(d) > 0 ? "pos-diff" : parseFloat(d) < 0 ? "neg-diff" : "";
    }
    return `<tr><td>${sub}</td><td>${aVal}</td><td>${bVal}</td><td class="${diffClass}">${diff}</td></tr>`;
  }).join("");
}

function renderGradeChart(stats) {
  if (gradeChartInstance) gradeChartInstance.destroy();
  const ctx = document.getElementById("gradeChart").getContext("2d");
  gradeChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: stats.gradeBands.map(b => b.label),
      datasets: [{
        label: "Number of Students",
        data: stats.gradeBands.map(b => b.count),
        backgroundColor: ["#2e7d32", "#388e3c", "#689f38", "#f9a825", "#ef6c00", "#b71c1c"],
        borderWidth: 1,
        borderColor: "#1a237e"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Grade Distribution", font: { size: 13 } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.raw} students (${stats.gradeBands[ctx.dataIndex].pct}%)`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0 },
          title: { display: true, text: "Number of Students" }
        },
        x: { ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderSubjectChart(stats) {
  if (subjectChartInstance) subjectChartInstance.destroy();
  const ctx = document.getElementById("subjectChart").getContext("2d");
  subjectChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: stats.subjectStats.map(s => s.subject),
      datasets: [
        {
          label: "Pass",
          data: stats.subjectStats.map(s => s.pass),
          backgroundColor: "#4caf50",
          stack: "stack0"
        },
        {
          label: "Fail",
          data: stats.subjectStats.map(s => s.fail),
          backgroundColor: "#ef5350",
          stack: "stack0"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        title: { display: true, text: "Pass vs Fail by Subject", font: { size: 13 } },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} students` }
        }
      },
      scales: {
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0 },
          title: { display: true, text: "Number of Students" }
        },
        x: { stacked: true, ticks: { font: { size: 10 }, maxRotation: 30 } }
      }
    }
  });
}

function renderCrossClassChart(subject) {
  if (crossClassChartInstance) crossClassChartInstance.destroy();
  const { seriesData } = computeCrossClassStats();
  if (!subject || !seriesData[subject]) return;

  const allSubjects = Object.keys(seriesData);
  const colorIndex = allSubjects.indexOf(subject);
  const color = SUBJECT_COLORS[colorIndex % SUBJECT_COLORS.length];

  const ctx = document.getElementById("crossClassChart").getContext("2d");
  crossClassChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: CLASS_FILES.map(c => "Class " + CLASS_LABELS[c]),
      datasets: [{
        label: subject,
        data: CLASS_FILES.map(cls => seriesData[subject]?.[cls] ?? null),
        spanGaps: false,
        borderColor: color,
        backgroundColor: color + "22",
        fill: true,
        pointRadius: 6,
        pointHoverRadius: 8,
        borderWidth: 2.5,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      spanGaps: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: `${subject} — Average Score by Class (Annual Exam)`, font: { size: 13 } },
        tooltip: {
          callbacks: { label: ctx => `Avg: ${ctx.raw ?? "N/A"}` }
        }
      },
      scales: {
        y: {
          min: 0, max: 100,
          title: { display: true, text: "Average Score (out of 100)" },
          ticks: { stepSize: 10 }
        },
        x: { title: { display: true, text: "Class" } }
      }
    }
  });
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
function renderDashboard() {
  if (!data || Object.keys(data).length === 0) return;
  const stats = computeStats(data);
  if (!stats) return;

  renderKPICards(stats);
  renderGradeDistTable(stats);
  renderRankTable(stats.top5, "top5-tbody");
  renderRankTable(stats.bottom5, "bottom5-tbody");
  renderGradeChart(stats);
  renderFailedStudentsTable(stats);
  renderSubjectTable(stats);
  renderSectionTable(stats);
  renderSubjectChart(stats);

  document.getElementById("loading-msg").style.display = "none";
  document.getElementById("dashboard-wrapper").style.display = "block";
}

function renderFailedStudentsTable(stats) {
  const wrap = document.getElementById("failed-students-wrap");
  if (stats.failedStudents.length === 0) {
    wrap.innerHTML = `<div style="background:#e8f5e9;color:#2e7d32;padding:12px 16px;border-radius:6px;font-size:13px;font-weight:bold;margin-top:8px;">
      &#10003; All students passed this class.
    </div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="dash-table" style="margin-top:8px;">
      <thead>
        <tr>
          <th>Rank</th><th>Name</th><th>Section</th><th>Overall %</th>
          <th>Subjects Failed</th><th>No. of Fails</th>
        </tr>
      </thead>
      <tbody>
        ${stats.failedStudents.map(s => `
          <tr>
            <td>${s.rank}</td>
            <td>${s.name}</td>
            <td>${s.section || "—"}</td>
            <td>${s.percent}%</td>
            <td class="fail-cell">${s.failedSubjects.join(", ")}</td>
            <td style="text-align:center;font-weight:bold;color:#b71c1c;">${s.failedSubjects.length}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ── Init ──────────────────────────────────────────────────────────────────────
const saved = sessionStorage.getItem("lastClass");
if (saved) document.getElementById("classSelect").value = saved;

document.getElementById("classSelect").addEventListener("change", loadClassData);

loadClassData();
loadAllClassData();
