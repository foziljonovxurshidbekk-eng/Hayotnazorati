// Kill old PWA service worker + caches (bir marta)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if (window.caches) { caches.keys().then(keys => keys.forEach(k => caches.delete(k))); }
}
// ===== Storage & State =====
const KEY = "lifestats_v2";
const state = JSON.parse(localStorage.getItem(KEY) || JSON.stringify({
  sleeps: [],        // {startISO,endISO,minutes}
  workouts: [],      // {date,type,minutes}
  cheatWeeks: [],    // ["2025-W37", ...]
  meals: [],         // {date,time,kind,text,kcal}
  water: [],         // {date, liters}
  focus: [],         // {date, minutes}
  settings: { sleepPendingStart:null, gasUrl:null, focusTimerStart:null }
}));
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function toISO(d){ return new Date(d).toISOString(); }
function minutesBetween(aISO,bISO){ return Math.max(0, Math.round((new Date(bISO)-new Date(aISO))/60000)); }
function fmtHM(d){ return d.toTimeString().slice(0,5); }
function parseTimeToDate(dateStr, hm){ const [h,m]=hm.split(":").map(Number); const d=new Date(dateStr+"T00:00:00"); d.setHours(h,m,0,0); return d; }
function clamp(n,min,max){ return Math.min(max, Math.max(min, n)); }
function getISOWeek(d){
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  return {week: weekNo, year: d.getUTCFullYear()};
}

// ===== Sleep =====
const sleepStartBtn = document.getElementById("sleep-start-btn");
const sleepEndBtn = document.getElementById("sleep-end-btn");
const sleepStartManual = document.getElementById("sleep-start-manual");
const sleepEndManual = document.getElementById("sleep-end-manual");
const sleepSaveManual = document.getElementById("sleep-save-manual");
const sleepRows = document.getElementById("sleep-last-rows");
sleepStartBtn.addEventListener("click", ()=>{
  if(state.settings.sleepPendingStart){ alert("Avvalgi uyqu ochiq. 'Uyg'ondim'ni bosing."); return; }
  state.settings.sleepPendingStart = toISO(new Date()); save(); renderSleepRows();
});
sleepEndBtn.addEventListener("click", ()=>{
  if(!state.settings.sleepPendingStart){ alert("Boshlanish belgilanmagan."); return; }
  const startISO = state.settings.sleepPendingStart, endISO = toISO(new Date());
  state.sleeps.push({startISO,endISO,minutes: minutesBetween(startISO,endISO)});
  state.settings.sleepPendingStart=null; save(); renderSleepRows(); updateSleepChart(currentSleepRange);
});
sleepSaveManual.addEventListener("click", ()=>{
  const s = sleepStartManual.value, e = sleepEndManual.value;
  if(!s || !e) return alert("Start/End kiriting");
  const startISO = toISO(new Date(s)), endISO=toISO(new Date(e));
  state.sleeps.push({startISO,endISO,minutes: minutesBetween(startISO,endISO)});
  state.settings.sleepPendingStart=null; sleepStartManual.value=""; sleepEndManual.value="";
  save(); renderSleepRows(); updateSleepChart(currentSleepRange);
});
function renderSleepRows(){
  const last = [...state.sleeps].slice(-7).reverse();
  sleepRows.innerHTML = last.map(s=>{
    const d = new Date(s.endISO||s.startISO);
    const start=new Date(s.startISO), end=new Date(s.endISO);
    return `<tr><td>${d.toISOString().slice(0,10)}</td><td>${start.toTimeString().slice(0,5)}</td><td>${end.toTimeString().slice(0,5)}</td><td>${(s.minutes/60).toFixed(2)}</td></tr>`;
  }).join("");
}
renderSleepRows();

let sleepChart, currentSleepRange="week";
document.querySelectorAll(".range-btn").forEach(b=> b.addEventListener("click", ()=>{
  document.querySelectorAll(".range-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); currentSleepRange=b.dataset.range; updateSleepChart(currentSleepRange);
}));
function aggregateSleep(range="week"){
  const now=new Date();
  if(range==="week"||range==="month"){
    const days = range==="week"?7:30;
    return [...Array(days)].map((_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-(days-1-i));
      const ds = d.toISOString().slice(0,10);
      const mins = state.sleeps.filter(s=> new Date(s.endISO).toISOString().slice(0,10)===ds).reduce((a,b)=>a+b.minutes,0);
      return {label: ds.slice(5), hours:+(mins/60).toFixed(2)};
    });
  }
  // year: monthly avg
  const arr=[];
  for(let i=11;i>=0;i--){
    const d=new Date(now); d.setMonth(now.getMonth()-i,1);
    const y=d.getFullYear(), m=d.getMonth(), start=new Date(y,m,1), end=new Date(y,m+1,1);
    const inM = state.sleeps.filter(s=>{ const e=new Date(s.endISO); return e>=start && e<end; });
    const total = inM.reduce((a,b)=>a+b.minutes,0);
    const days=Math.round((end-start)/86400000);
    arr.push({label:`${y}-${String(m+1).padStart(2,"0")}`, hours:+((total/60)/days||0).toFixed(2)});
  }
  return arr;
}
function updateSleepChart(range="week"){
  const data=aggregateSleep(range);
  const ctx=document.getElementById("sleepChart").getContext("2d");
  if(sleepChart) sleepChart.destroy();
  sleepChart=new Chart(ctx,{type:'bar',data:{labels:data.map(d=>d.label),datasets:[{label:'Uyqu (soat)',data:data.map(d=>d.hours)}]},options:{responsive:true,animation:{duration:300},scales:{y:{beginAtZero:true,suggestedMax:10}}});
}
document.querySelector('.range-btn[data-range="week"]').classList.add("active");
updateSleepChart("week");

// ===== Workouts & Cheat stats =====
const weekStrip=document.getElementById("week-strip");
const workoutType=document.getElementById("workout-type");
const workoutDoneBtn=document.getElementById("workout-done-btn");
const woStart=document.getElementById("wo-start");
const woEnd=document.getElementById("wo-end");
const woSaveManual=document.getElementById("wo-save-manual");
const woProgress=document.getElementById("wo-progress");
const woProgressLabel=document.getElementById("wo-progress-label");
const cheatToggle=document.getElementById("cheat-toggle");
let workoutChart, cheatChart;

function buildWeekStrip(){
  weekStrip.innerHTML="";
  const now=new Date(); const dayOfWeek=(now.getDay()+6)%7; const monday=new Date(now); monday.setDate(now.getDate()-dayOfWeek);
  const initials=['Du','Se','Ch','Pa','Ju','Sh','Ya'];
  for(let i=0;i<7;i++){
    const d=new Date(monday); d.setDate(monday.getDate()+i); const ds=d.toISOString().slice(0,10);
    const done=state.workouts.some(w=>w.date===ds);
    const el=document.createElement("div");
    el.className="week-dot"+(done?" done":""); el.textContent=initials[i]; el.title=ds+(done?" — borilgan":"");
    weekStrip.appendChild(el);
  }
}
function workoutsThisWeek(){
  const now=new Date(); const iw=getISOWeek(now);
  return state.workouts.filter(w=>{ const d=new Date(w.date); const ww=getISOWeek(d); return ww.week===iw.week && ww.year===iw.year; });
}
function renderWorkoutProgress(){
  const count=new Set(workoutsThisWeek().map(w=>w.date)).size;
  const pct=clamp((count/3)*100,0,100);
  woProgressLabel.textContent=`${count}/3`;
  woProgress.style.background = `linear-gradient(90deg, var(--blue) 0%, var(--blue-deep) ${pct}%, #0d131d ${pct}%)`;
}
workoutDoneBtn.addEventListener("click", ()=>{
  const date=todayStr();
  if(state.workouts.some(w=>w.date===date)) return alert("Bugun allaqachon yozilgan.");
  state.workouts.push({date, type:workoutType.value, minutes:null}); save();
  buildWeekStrip(); renderWorkoutProgress(); updateWorkoutChart(); updateCheatChart();
});
woSaveManual.addEventListener("click", ()=>{
  const date=todayStr(); let minutes=null;
  if(woStart.value && woEnd.value){ const a=parseTimeToDate(date,woStart.value), b=parseTimeToDate(date,woEnd.value); minutes=Math.max(0, Math.round((b-a)/60000)); }
  state.workouts.push({date, type:workoutType.value, minutes}); woStart.value=""; woEnd.value=""; save();
  buildWeekStrip(); renderWorkoutProgress(); updateWorkoutChart(); updateCheatChart();
});
function cheatKeyNow(){ const now=new Date(); const iw=getISOWeek(now); return `${iw.year}-W${String(iw.week).padStart(2,"0")}`; }
function initCheatToggle(){
  const key=cheatKeyNow(); cheatToggle.checked=state.cheatWeeks.includes(key);
  cheatToggle.addEventListener("change", ()=>{
    if(cheatToggle.checked){ if(!state.cheatWeeks.includes(key)) state.cheatWeeks.push(key); }
    else{ state.cheatWeeks=state.cheatWeeks.filter(k=>k!==key); }
    save(); updateCheatChart();
  });
}
function updateWorkoutChart(){
  const ctx=document.getElementById("workoutChart").getContext("2d");
  const now=new Date(); const labels=[], data=[];
  for(let i=7;i>=0;i--){
    const d=new Date(now); d.setDate(now.getDate()-i*7); const iw=getISOWeek(d); const key=`${iw.year}-W${String(iw.week).padStart(2,"0")}`;
    labels.push(key);
    const count=new Set(state.workouts.filter(w=>{ const ww=getISOWeek(new Date(w.date)); return ww.week===iw.week && ww.year===iw.year; }).map(w=>w.date)).size;
    data.push(count);
  }
  if(workoutChart) workoutChart.destroy();
  workoutChart=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:"Haftalik zal soni",data}]},options:{responsive:true,scales:{y:{beginAtZero:true,suggestedMax:4}}}});
}
function updateCheatChart(){
  const ctx=document.getElementById("cheatChart").getContext("2d");
  const now=new Date(); const labels=[], vals=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now); d.setMonth(now.getMonth()-i,1); const y=d.getFullYear(), m=d.getMonth();
    labels.push(`${y}-${String(m+1).padStart(2,"0")}`);
    // Count cheat weeks in that month:
    let count=0;
    state.cheatWeeks.forEach(k=>{
      const [yy, ww] = k.split("-W");
      const anyDay = new Date(Number(yy), 0, 1 + (Number(ww)-1)*7);
      if(anyDay.getFullYear()===y && anyDay.getMonth()===m) count++;
    });
    vals.push(count);
  }
  if(cheatChart) cheatChart.destroy();
  cheatChart=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:"Cheat haftalari",data:vals}]},options:{responsive:true,scales:{y:{beginAtZero:true,suggestedMax:5}}}});
}
initCheatToggle(); buildWeekStrip(); renderWorkoutProgress(); updateWorkoutChart(); updateCheatChart();

// ===== Water =====
const waterTodayEl=document.getElementById("water-today");
const waterBtns=document.querySelectorAll("[data-water]");
const waterReset=document.getElementById("water-reset");
let waterChart; let currentWaterRange="week";
function getWater(date){ const r=state.water.find(w=>w.date===date); return r? r.liters:0; }
function setWater(date, liters){
  const idx=state.water.findIndex(w=>w.date===date);
  if(idx>=0) state.water[idx].liters = Math.max(0, +(liters).toFixed(2));
  else state.water.push({date, liters: Math.max(0, +(liters).toFixed(2))});
  save(); renderWaterToday(); updateWaterChart(currentWaterRange);
}
function renderWaterToday(){ waterTodayEl.textContent = getWater(todayStr()).toFixed(2); }
waterBtns.forEach(b=> b.addEventListener("click", ()=>{
  const inc=parseFloat(b.dataset.water);
  setWater(todayStr(), getWater(todayStr()) + inc);
}));
waterReset.addEventListener("click", ()=> setWater(todayStr(), 0));
function aggregateWater(range="week"){
  const now=new Date();
  if(range==="week"||range==="month"){
    const days=range==="week"?7:30;
    return [...Array(days)].map((_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-(days-1-i));
      const ds=d.toISOString().slice(0,10);
      return {label: ds.slice(5), liters: getWater(ds)};
    });
  }
  // year: monthly averages
  const arr=[];
  for(let i=11;i>=0;i--){
    const d=new Date(now); d.setMonth(now.getMonth()-i,1);
    const y=d.getFullYear(), m=d.getMonth(), start=new Date(y,m,1), end=new Date(y,m+1,1);
    let sum=0,count=0;
    for(let dd=new Date(start); dd<end; dd.setDate(dd.getDate()+1)){
      const ds=dd.toISOString().slice(0,10); const v=getWater(ds); sum+=v; count++;
    }
    arr.push({label:`${y}-${String(m+1).padStart(2,"0")}`, liters:+((sum/(count||1))).toFixed(2)});
  }
  return arr;
}
function updateWaterChart(range="week"){
  const data=aggregateWater(range);
  const ctx=document.getElementById("waterChart").getContext("2d");
  if(waterChart) waterChart.destroy();
  waterChart=new Chart(ctx,{type:'line',data:{labels:data.map(d=>d.label),datasets:[{label:"Suv (L)",data:data.map(d=>d.liters)}]},options:{responsive:true,scales:{y:{beginAtZero:true,suggestedMax:4}}}});
}
document.querySelector('.water-range-btn[data-range="week"]').classList.add("active");
document.querySelectorAll(".water-range-btn").forEach(b=> b.addEventListener("click", ()=>{
  document.querySelectorAll(".water-range-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); currentWaterRange=b.dataset.range; updateWaterChart(currentWaterRange);
}));
renderWaterToday(); updateWaterChart("week");

// ===== Meals (same as v1 with small polish) =====
const mealType=document.getElementById("meal-type");
const mealText=document.getElementById("meal-text");
const mealAddBtn=document.getElementById("meal-add-btn");
const mealsRows=document.getElementById("meals-today-rows");
const mealsTodayTotal=document.getElementById("meals-today-total");
let mealsChart; let currentMealRange="week";
function extractKcal(text){ const m=text.match(/(\d{2,4})\s?k?cal/i); return m?parseInt(m[1],10):null; }
const kcalDict={"plov":650,"palov":650,"osh":650,"somsa":320,"samsa":320,"lagman":550,"shashlik":400,"kabob":400,"manti":450,"chuchvara":420,"oatmeal":250,"bo'tqa":250,"botqa":250,"salad":220,"salat":220,"tovuq":250,"chicken":250,"sho'rva":180,"shorva":180,"soup":180,"non":250,"qatiq":150,"yogurt":150,"cola":140,"pepsi":150,"pizza":700,"burger":700};
function estimateCalories(text){
  const explicit=extractKcal(text); if(explicit) return explicit;
  const t=text.toLowerCase(); let guess=0; for(const [k,v] of Object.entries(kcalDict)){ if(t.includes(k)) guess=Math.max(guess,v); }
  if(guess===0){ if(/\b(2|ikki|double)\b/.test(t)) guess=400; else guess=300; } return guess;
}
function renderMealsToday(){
  const rows=state.meals.filter(m=>m.date===todayStr());
  mealsRows.innerHTML=rows.map(m=> `<tr><td>${m.time}</td><td>${m.kind}</td><td>${m.text}</td><td>${m.kcal||""}</td></tr>`).join("");
  const total=rows.reduce((a,b)=>a+(b.kcal||0),0); mealsTodayTotal.textContent=total;
}
mealAddBtn.addEventListener("click", ()=>{
  const text=mealText.value.trim(); if(!text) return alert("Ta'rif kiriting");
  const kcal=estimateCalories(text), now=new Date();
  state.meals.push({date:todayStr(), time:fmtHM(now), kind:mealType.value, text, kcal});
  mealText.value=""; save(); renderMealsToday(); updateMealsChart(currentMealRange);
});
function aggregateMeals(range="week"){
  const now=new Date();
  if(range==="week"||range==="month"){
    const days=range==="week"?7:30;
    return [...Array(days)].map((_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-(days-1-i)); const ds=d.toISOString().slice(0,10);
      const kcal=state.meals.filter(m=>m.date===ds).reduce((a,b)=>a+(b.kcal||0),0);
      return {label: ds.slice(5), kcal};
    });
  }
  const arr=[]; for(let i=11;i>=0;i--){ const d=new Date(now); d.setMonth(now.getMonth()-i,1);
    const y=d.getFullYear(), m=d.getMonth(), start=new Date(y,m,1), end=new Date(y,m+1,1);
    const kcal=state.meals.filter(mm=>{ const md=new Date(mm.date); return md>=start && md<end; }).reduce((a,b)=>a+(b.kcal||0),0);
    arr.push({label:`${y}-${String(m+1).padStart(2,"0")}`, kcal});
  } return arr;
}
function updateMealsChart(range="week"){
  const data=aggregateMeals(range); const ctx=document.getElementById("mealsChart").getContext("2d");
  if(mealsChart) mealsChart.destroy();
  mealsChart=new Chart(ctx,{type:'line',data:{labels:data.map(d=>d.label),datasets:[{label:"Kkal",data:data.map(d=>d.kcal)}]},options:{responsive:true,scales:{y:{beginAtZero:true}}}});
}
document.querySelector('.meal-range-btn[data-range="week"]').classList.add("active");
document.querySelectorAll(".meal-range-btn").forEach(b=> b.addEventListener("click", ()=>{
  document.querySelectorAll(".meal-range-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); currentMealRange=b.dataset.range; updateMealsChart(currentMealRange);
}));
renderMealsToday(); updateMealsChart("week");

// ===== Focus =====
const focusStart=document.getElementById("focus-start");
const focusStop=document.getElementById("focus-stop");
const focusAdd=document.getElementById("focus-add");
const focusMins=document.getElementById("focus-mins");
const focusTodayEl=document.getElementById("focus-today");
let focusChart; let currentFocusRange="week";
function getFocus(date){ const r=state.focus.find(f=>f.date===date); return r? r.minutes:0; }
function setFocus(date, minutes){
  const idx=state.focus.findIndex(f=>f.date===date);
  if(idx>=0) state.focus[idx].minutes = Math.max(0, Math.round(minutes));
  else state.focus.push({date, minutes: Math.max(0, Math.round(minutes))});
  save(); renderFocusToday(); updateFocusChart(currentFocusRange);
}
function renderFocusToday(){ focusTodayEl.textContent=getFocus(todayStr()); }
focusStart.addEventListener("click", ()=>{
  if(state.settings.focusTimerStart) return alert("Timer allaqachon ishlayapti.");
  state.settings.focusTimerStart = toISO(new Date()); save();
});
focusStop.addEventListener("click", ()=>{
  if(!state.settings.focusTimerStart) return alert("Timer yo'q.");
  const startISO=state.settings.focusTimerStart, endISO=toISO(new Date());
  const mins=minutesBetween(startISO,endISO);
  setFocus(todayStr(), getFocus(todayStr()) + mins);
  state.settings.focusTimerStart=null; save();
});
focusAdd.addEventListener("click", ()=>{
  const val=parseInt(focusMins.value||"0",10); if(!val) return;
  setFocus(todayStr(), getFocus(todayStr()) + val); focusMins.value="";
});
function aggregateFocus(range="week"){
  const now=new Date();
  if(range==="week"||range==="month"){
    const days=range==="week"?7:30;
    return [...Array(days)].map((_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-(days-1-i)); const ds=d.toISOString().slice(0,10);
      return {label: ds.slice(5), minutes: getFocus(ds)};
    });
  }
  const arr=[]; for(let i=11;i>=0;i--){ const d=new Date(now); d.setMonth(now.getMonth()-i,1);
    const y=d.getFullYear(), m=d.getMonth(), start=new Date(y,m,1), end=new Date(y,m+1,1);
    let sum=0; for(let dd=new Date(start); dd<end; dd.setDate(dd.getDate()+1)){ sum+=getFocus(dd.toISOString().slice(0,10)); }
    arr.push({label:`${y}-${String(m+1).padStart(2,"0")}`, minutes: sum});
  } return arr;
}
function updateFocusChart(range="week"){
  const data=aggregateFocus(range); const ctx=document.getElementById("focusChart").getContext("2d");
  if(focusChart) focusChart.destroy();
  focusChart=new Chart(ctx,{type:'bar',data:{labels:data.map(d=>d.label),datasets:[{label:"Fokus (min)",data:data.map(d=>d.minutes)}]},options:{responsive:true,scales:{y:{beginAtZero:true}}}});
}
document.querySelector('.focus-range-btn[data-range="week"]').classList.add("active");
document.querySelectorAll(".focus-range-btn").forEach(b=> b.addEventListener("click", ()=>{
  document.querySelectorAll(".focus-range-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); currentFocusRange=b.dataset.range; updateFocusChart(currentFocusRange);
}));
renderFocusToday(); updateFocusChart("week");

// ===== Export / Import =====
document.getElementById("export-json").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {href:url, download:"lifestats.json"});
  a.click(); URL.revokeObjectURL(url);
});
document.getElementById("export-csv").addEventListener("click", ()=>{
  function csvLines(){
    const lines = ["type,date,startISO,endISO,minutes,kind,text,kcal,woType,woMinutes,waterL,focusMin"];
    state.sleeps.forEach(s=> lines.push(`sleep,${new Date(s.endISO).toISOString().slice(0,10)},${s.startISO},${s.endISO},${s.minutes},,,`));
    state.meals.forEach(m=> lines.push(`meal,${m.date},,,,"${m.kind}","${(m.text||"").replace(/"/g,'""')}",${m.kcal||""}`));
    state.workouts.forEach(w=> lines.push(`workout,${w.date},,,,,"",,${w.type},${w.minutes||""}`));
    state.water.forEach(w=> lines.push(`water,${w.date},,,,,,,,${w.liters},`));
    state.focus.forEach(f=> lines.push(`focus,${f.date},,,,,,,,,,${f.minutes}`));
    return lines.join("\n");
  }
  const blob = new Blob([csvLines()], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {href:url, download:"lifestats.csv"});
  a.click(); URL.revokeObjectURL(url);
});
document.getElementById("import-json").addEventListener("change", (e)=>{
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      ["sleeps","workouts","cheatWeeks","meals","water","focus","settings"].forEach(k=>{ if(data[k]!==undefined) state[k]=data[k]; });
      save();
      renderSleepRows(); updateSleepChart(currentSleepRange);
      buildWeekStrip(); renderWorkoutProgress(); updateWorkoutChart(); updateCheatChart();
      renderWaterToday(); updateWaterChart(currentWaterRange);
      renderMealsToday(); updateMealsChart(currentMealRange);
      renderFocusToday(); updateFocusChart(currentFocusRange);
      alert("Import OK");
    }catch(err){ alert("Import xato: "+err.message); }
  };
  reader.readAsText(file);
});
document.getElementById("clear-all").addEventListener("click", ()=>{
  if(confirm("Haqiqatan ham hammasini o‘chirasizmi?")){ localStorage.removeItem(KEY); location.reload(); }
});

// ===== Apps Script integration (optional) =====
const gasInput=document.getElementById("gas-url");
const gasSave=document.getElementById("save-gas");
const gasSend=document.getElementById("send-now");
gasInput.value = state.settings.gasUrl || "";
// --- Inject default GAS URL for Xurshidbek ---
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxLWoNkbCKREX9gIh74YYpt3WtCZBR23vcGCOFFqhExKUuEnq_8-mynl0OmUqo7P0tF/exec";
if (!state.settings.gasUrl) {
  state.settings.gasUrl = DEFAULT_GAS_URL;
  save();
}

gasSave.addEventListener("click", ()=>{
  const url = gasInput.value.trim(); state.settings.gasUrl = url || null; save(); alert("Saqlandi.");
});
gasSend.addEventListener("click", ()=> sendToGAS());

async function sendToGAS(){
  if(!state.settings.gasUrl) return alert("Apps Script URL kiriting.");
  const payload = {
    ts: new Date().toISOString(),
    data: state
  };
  try{
    const res = await fetch(state.settings.gasUrl, {
      method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)
    });
    const txt = await res.text();
    alert("Yuborildi: "+txt.slice(0,120));
  }catch(e){
    alert("Yuborishda xato: "+e.message);
  }
}

// ===== PWA SW =====
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=> navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
