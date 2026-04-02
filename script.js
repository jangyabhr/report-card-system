let data = {};

async function loadClassData() {
  const cls = document.getElementById("classSelect").value;
  const res = await fetch(`data/${cls}.json`);
  data = await res.json();
}
loadClassData();

document.getElementById("classSelect").addEventListener("change", loadClassData);

document.getElementById("search").addEventListener("input", function(){
  let val = this.value.toLowerCase();
  let sug = document.getElementById("suggestions");
  sug.innerHTML = "";

  for(let adm in data){
    let s = data[adm];
    if(adm.includes(val) || s.name.toLowerCase().includes(val)){
      let d=document.createElement("div");
      d.innerText=`${s.name} (${adm})`;
      d.onclick=()=>loadReport(adm);
      sug.appendChild(d);
    }
  }
});

function loadReport(adm){
  let s=data[adm];
  let html=`<h3>${s.name}</h3>
  <p>Total: ${s.total} | %: ${s.percent} | Grade: ${s.grade} | Rank: ${s.rank}</p>
  <table><tr><th>Subject</th><th>Annual</th></tr>`;

  let subjects=Object.keys(s.exams["ANNUAL"]||{});
  subjects.forEach(sub=>{
    html+=`<tr><td>${sub}</td><td>${s.exams["ANNUAL"][sub]}</td></tr>`;
  });

  html+="</table>";
  document.getElementById("report").innerHTML=html;
}

function downloadPDF(){
  html2pdf().from(document.getElementById("report")).save();
}
