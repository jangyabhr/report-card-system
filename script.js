let data = {};
let chartInstance = null;

const SUBJECTS = ["ENGLISH", "ODIA", "HINDI", "SANSKRIT", "MATHEMATICS", "SCIENCE", "SOCIAL SCIENCE", "ICT"];

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

function getClassName() {
  const map = { class6: "VI", class7: "VII", class8: "VIII", class9: "IX", class10: "X" };
  return map[document.getElementById("classSelect").value] || "";
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
  const s = data[adm];
  const cls = getClassName();
  const annual = s.exams.ANNUAL || {};
  const ia     = s.exams.IA     || {};
  const totals = s.exams.TOTAL  || {};

  // PASS: every subject annual marks >= 33 out of 80
  const passed = SUBJECTS.every(sub => {
    const m = annual[sub];
    return m === "ABS" || m === undefined ? false : m >= 33;
  });

  // Build subject rows
  let subjectRows = "";
  for (const sub of SUBJECTS) {
    const annMark  = annual[sub]  ?? "-";
    const iaMark   = ia[sub]     ?? "-";
    const totMark  = totals[sub] ?? "-";

    let wt = "-", gInfo = { grade: "-", color: "#ccc" };
    if (typeof totMark === "number") {
      wt = totMark.toFixed(1);
      gInfo = getGrade(totMark);
    }

    subjectRows += `
      <tr>
        <td class="sub-name">${sub}</td>
        <td class="mc-pt">-</td>
        <td class="mc-pt">-</td>
        <td class="mc-hfy">-</td>
        <td class="mc-pt">-</td>
        <td class="mc-pt">-</td>
        <td class="mc-ann">${annMark !== "-" ? annMark + " + " + iaMark : "-"}</td>
        <td class="wt-pct">${wt}</td>
        <td class="grade-cell" style="background:${gInfo.color}">${gInfo.grade}</td>
      </tr>`;
  }

  // Co-scholastic
  const co = s.co_scholastic || {};
  const coActivities = ["WORK EDUCATION", "ART EDUCATION", "HEALTH & PHYSICAL EDUCATION", "DISCIPLINE", "SPORTS"];
  const coRows = coActivities.map(act =>
    `<tr><td>${act}</td><td>${co[act] || "N/A"}</td></tr>`
  ).join("");

  const overallGrade = getGrade(s.percent);
  const attendance = s.attendance != null ? s.attendance + " %" : "N/A";
  const resultClass = passed ? "pass" : "fail";

  document.getElementById("report-wrapper").innerHTML = `
    <div class="report-card" id="report">

      <!-- School Header -->
      <div class="school-header">
        <div class="logo-circle">OAV<br>LOGO</div>
        <div class="school-info">
          <div class="school-name">Odisha Adarsha Vidyalaya Jamagorada, Jagannathprasad, Ganjam</div>
          <p>Department of School &amp; Mass Education, Govt. of Odisha</p>
          <p>(Affiliated to CBSE, New Delhi)</p>
          <p class="details-line">Affiliation No: 1520188 &nbsp;&nbsp; School Code: 17274 &nbsp;&nbsp; UDISE CODE: 21191203852 &nbsp;&nbsp; Email: jagannathprasad@oav.edu.in</p>
        </div>
        <div class="logo-circle">CBSE<br>LOGO</div>
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
                <td class="lbl">Roll No</td><td>: ${s.roll}</td>
                <td class="lbl">Reg No</td><td>: ${adm}</td>
              </tr>
              <tr>
                <td class="lbl">Class</td><td>: ${cls}</td>
                <td class="lbl">Sec</td><td>: ${s.section}</td>
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
              Result : <span class="badge ${resultClass}">${passed ? "PASS" : "FAIL"}</span>
            </div>
          </div>
        </div>
        <div class="chart-wrap">
          <div class="chart-title">Yearly Report</div>
          <canvas id="yearlyChart" width="290" height="190"></canvas>
        </div>
      </div>

      <!-- Scholastic Area -->
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
            <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
            <td>${s.total} / 800</td>
            <td>${s.percent}</td>
            <td class="grade-cell" style="background:${overallGrade.color}">${s.grade}</td>
          </tr>
          <tr class="pct-row">
            <td class="sub-name">Percentage</td>
            <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
            <td>${s.percent}%</td>
            <td class="overall-grade-cell" colspan="2">OVERALL GRADE : ${s.grade} &nbsp; | &nbsp; Rank : ${s.rank}</td>
          </tr>
        </tbody>
      </table>

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

  // Show per-exam-slot bars; only ANNUAL is populated from current data
  const labels = ["PT-I", "PT-II", "HFY", "PT-III", "PT-IV", "ANNUAL"];
  const values = [0, 0, 0, 0, 0, s.percent];

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          "#90caf9","#90caf9","#90caf9","#90caf9","#90caf9","#4472c4"
        ],
        borderColor: "#1a237e",
        borderWidth: 1,
      }]
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true, max: 100,
          title: { display: true, text: "Percentage", font: { size: 9 } },
          ticks: { font: { size: 9 } }
        },
        x: { ticks: { font: { size: 9 } } }
      }
    }
  });
}

function downloadPDF() {
  const el = document.getElementById("report");
  html2pdf().set({
    margin: 0.3,
    filename: "report-card.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "in", format: "a4", orientation: "portrait" }
  }).from(el).save();
}
