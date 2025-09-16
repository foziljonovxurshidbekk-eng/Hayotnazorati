// Kill old PWA service worker + caches (one-time cleanup)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if (window.caches) { caches.keys().then(keys => keys.forEach(k => caches.delete(k))); }
}

// ===== Minimal online app (no service worker, no CDN). =====

// ----- State -----
const KEY = "lifestats_v3";
const state = JSON.parse(localStorage.getItem(KEY) || JSON.stringify({
  sleeps: [], workouts: [], cheatWeeks: [], meals: [], water: [], focus: [],
  settings: { sleepPendingStart: null, gasUrl: null, focusTimerStart: null }
}));
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); maybeAutoSend(); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function toISO(d){ return new Date(d).toISOString(); }
function minutesBetween(a,b){ return Math.max(0, Math.round((new Date(b)-new Date(a))/60000)); }
function fmtHM(d){ return d.toTimeString().slice(0,5); }
function clamp(n,min,max){ return Math.min(max, Math.max(min, n)); }
function getISOWeek(d){
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  return {week: weekNo, year: d.getUTCFullYear()};
}
function getISOWeekKey(d){ const w=getISOWeek(new Date(d)); return `${w.year}-W${String(w.week).padStart(2,"0")}`; }

// Status badge
const statusEl = document.getElementById("status");
function setStatus(txt){ if(statusEl) statusEl.textContent = txt; }

// ====== Canvas chart (tiny) ======
function drawLineCanvas(canvas, values, {min=0, max=null, color="#8bd1ff", fill=false}={}){
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  if(values.length===0){ return; }
  if(max==null){ max = Math.max(min+1, Math.max(...values)); }
  // axes (subtle)
  ctx.strokeStyle = "#223149"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(32,h-24); ctx.lineTo(w-8,h-24); ctx.stroke();
  // line
  const padL=32, padR=8, padT=8, padB=24;
  const innerW=w-padL-padR, innerH=h-padT-padB;
  ctx.strokeStyle=color; ctx.lineWidth=2; ctx.lineJoin="round"; ctx.lineCap="round";
  ctx.beginPath();
  values.forEach((v,i)=>{
    const x = padL + (i/(values.length-1))*innerW;
    const y = padT + (1- ( (v-min)/(max-min||1) ))*innerH;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  if(fill){
    ctx.lineTo(padL+innerW, h-padB);
    ctx.lineTo(padL, h-padB);
    ctx.closePath();
    ctx.globalAlpha=0.15; ctx.fillStyle=color; ctx.fill(); ctx.globalAlpha=1.0;
  }
}

// ===== Sleep =====
const sleepStartBtn=document.getElementById("sleep-start-btn");
const sleepEndBtn=document.getElementById("sleep-end-btn");
const sleepStartManual=document.getElementById("sleep-start-manual");
const sleepEndManual=document.getElementById("sleep-end-manual");
const sleepSaveManual=document.getElementById("sleep-save-manual");
const sleepRows=document.getElementById("sleep-last-rows");
let sleepRange="week";

sleepStartBtn?.addEventListener("click", ()=>{
  if(state.settings.sleepPendingStart){ alert("Avvalgi uyqu ochiq. 'Uyg'ondim' ni bosing."); return; }
  state.settings.sleepPendingStart = toISO(new Date());
  save(); renderSleepRows();
});
sleepEndBtn?.addEventListener("click", ()=>{
  if(!state.settings.sleepPendingStart){ alert("Boshlanish belgilanmagan."); return; }
  const startISO=state.settings.sleepPendingStart, endISO=toISO(new Date());
  state.sleeps.push({startISO,endISO,minutes: minutesBetween(startISO,endISO)});
  state.settings.sleepPendingStart=null;
  save(); renderSleepRows(); updateSleepChart();
});
sleepSaveManual?.addEventListener("click", ()=>{
  if(!sleepStartManual.value || !sleepEndManual.value) return alert("Start/End kiriting");
  const startISO = toISO(new Date(sleepStartManual.value));
  const endISO = toISO(new Date(sleepEndManual.value));
  state.sleeps.push({startISO,endISO,minutes: minutesBetween(startISO,endISO)});
  state.settings.sleepPendingStart=null; sleepStartManual.value=""; sleepEndManual.value="";
  save(); renderSleepRows(); updateSleepChart();
});

function renderSleepRows(){
  if(!sleepRows) return;
  const last = [...state.sleeps].slice(-7).reverse();
  sleepRows.innerHTML = last.map(s=>{
    const d=new Date(s.endISO||s.startISO), a=new Date(s.startISO), b=new Date(s.endISO);
    return `<tr><td>${d.toISOString().slice(0,10)}</td><td>${a.toTimeString().slice(0,5)}</td><td>${b.toTimeString().slice(0,5)}</td><td>${(s.minutes/60).toFixed(2)}</td></tr>`;
  }).join("");
}
document.querySelectorAll(".range-btn").forEach(b=> b.addEventListener("click", ()=>{ sleepRange=b.dataset.range; updateSleepChart(); }));
function aggregateSleep(range="week"){
  const now=new Date();
  if(range==="week"||range==="month"){
    const days=range==="week"?7:30;
    return [...Array(days)].map((_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-(days-1-i));
      const ds=d.toISOString().slice(0,10);
      const mins=state.sleeps.filter(s=> new Date(s.endISO).toISOString().slice(0,10)===ds)
        .reduce((a,b)=>a+b.minutes,0);
      return +(mins/60).toFixed(2);
    });
  }
  // year monthly average
  const arr=[];
  for(let i=11;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i,1);
    const y=d.getFullYear(), m=d.getMonth();
    const start=new Date(y,m,1), end=new Date(y,m+1,1);
    const inM=state.sleeps.filter(s=>{ const e=new Date(s.endISO); return e>=start&&e<end; });
    const total=inM.reduce((a,b)=>a+b.minutes,0);
    const days=Math.round((end-start)/86400000);
    arr.push(+((total/60)/(days||1)).toFixed(2));
  }
  return arr;
}
function updateSleepChart(){
  const canvas=document.getElementById("sleepCanvas");
  const vals=aggregateSleep(sleepRange);
  drawLineCanvas(canvas, vals, {min:0, max:10, color:"#6ea8fe", fill:true});
}

// ===== Workout + cheat =====
const weekStrip=document.getElementById("week-strip");
const workoutType=document.getElementById("workout-type");
const workoutDoneBtn=document.getElementById("workout-done-btn");
const woProgress=document.getElementById("wo-progress");
const woProgressLabel=document.getElementById("wo-progress-label");
const cheatToggle=document.getElementById("cheat-toggle");

workoutDoneBtn?.addEventListener("click", ()=>{
  const date=todayStr();
  if(state.workouts.some(w=>w.date===date)) return alert("Bugun allaqachon yozilgan.");
  state.workouts.push({date, type:workoutType.value, minutes:null});
  save(); buildWeekStrip(); renderWorkoutProgress(); updateWorkoutChart();
});
function workoutsThisWeek(){
  const key=getISOWeekKey(new Date());
  return state.workouts.filter(w=> getISOWeekKey(w.date)===key );
}
function buildWeekStrip(){
  if(!weekStrip) return;
  weekStrip.innerHTML="";
  const now=new Date(); const dayOfWeek=(now.getDay()+6)%7; const monday=new Date(now); monday.setDate(now.getDate()-dayOfWeek);
  const names=['Du','Se','Ch','Pa','Ju','Sh','Ya'];
  for(let i=0;i<7;i++){
    const d=new Date(monday); d.setDate(monday.getDate()+i);
    const ds=d.toISOString().slice(0,10);
    const done=state.workouts.some(w=>w.date===ds);
    const el=document.createElement("div"); el.className="week-dot"+(done?" done":""); el.textContent=names[i]; el.title=ds;
    weekStrip.appendChild(el);
  }
}
function renderWorkoutProgress(){
  if(!woProgress) return;
  const count=new Set(workoutsThisWeek().map(w=>w.date)).size;
  const pct=clamp((count/3)*100,0,100);
  if(woProgressLabel) woProgressLabel.textContent=`${count}/3`;
  woProgress.style.background = `linear-gradient(90deg, #1f3b64 0%, #0e2a47 ${pct}%, #0d131d ${pct}%)`;
}
cheatToggle?.addEventListener("change", ()=>{
  const key=getISOWeekKey(new Date());
  if(cheatToggle.checked){ if(!state.cheatWeeks.includes(key)) state.cheatWeeks.push(key); }
  else{ state.cheatWeeks = state.cheatWeeks.filter(k=>k!==key); }
  save(); updateCheatChart();
});
function updateWorkoutChart(){
  const canvas=document.getElementById("workoutCanvas");
  if(!canvas) return;
  const now=new Date(); const vals=[];
  for(let i=7;i>=0;i--){
    const d=new Date(now); d.setDate(now.getDate()-i*7);
    const key=getISOWeekKey(d);
    const count=new Set(state.workouts.filter(w=>getISOWeekKey(w.date)===key).map(w=>w.date)).size;
    vals.push(count);
  }
  drawLineCanvas(canvas, vals, {min:0, max:4, color:"#6ea8fe", fill:false});
}
function updateCheatChart(){
  const canvas=document.getElementById("cheatCanvas");
  if(!canvas) return;
  const now=new Date(); const vals=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now); d.setMonth(now.getMonth()-i,1);
    const y=d.getFullYear(), m=d.getMonth();
    let count=0;
    state.cheatWeeks.forEach(k=>{
      const [yy,ww]=k.split("-W"); const anyDay=new Date(Number(yy),0,1+(Number(ww)-1)*7);
      if(anyDay.getFullYear()===y && anyDay.getMonth()===m) count++;
    });
    vals.push(count);
  }
  drawLineCanvas(canvas, vals, {min:0, max:5, color:"#a8f0c9", fill:false});
}
buildWeekStrip(); renderWorkoutProgress(); updateWorkoutChart(); updateCheatChart();

// ===== Water =====
const waterTodayEl=document.getElementById("water-today");
const waterBtns=document.querySelectorAll("[data-water]");
const waterReset=document.getElementById("water-reset");
let waterRange="week";
function getWater(date){ const r=state.water.find(w=>w.date===date); return r? r.liters:0; }
function setWater(date, liters){
  const idx=state.water.findIndex(w=>w.date===date);
  if(idx>=0) state.water[idx].liters=Math.max(0, +liters.toFixed(2));
  else state.water.push({date, liters: Math.max(0, +liters.toFixed(2))});
  save(); renderWaterToday(); updateWaterChart();
}
function renderWaterToday(){ if(waterTodayEl) waterTodayEl.textContent = getWater(todayStr()).toFixed(2); }
waterBtns.forEach(b=> b.addEventListener("click", ()=>{
  const inc=parseFloat(b.dataset.water.replace("+",""));
  setWater(todayStr(), getWater(todayStr()) + inc);
}));
waterReset?.addEventListener("click", ()=> setWater(todayStr(), 0));
document.querySelectorAll(".water-range-btn").forEach(b=> b.addEventListener("click", ()=>{ waterRange=b.dataset.range; updateWaterChart(); }));
function aggregateWater(range="week"){
  const now=new Date();
  if(range==="week"||range==="month"){
    const days=range==="week"?7:30;
    return [...Array(days)].map((_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-(days-1-i)); const ds=d.toISOString().slice(0,10);
      return getWater(ds);
    });
  }
  const arr=[]; for(let i=11;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i,1);
    const y=d.getFullYear(), m=d.getMonth(), start=new Date(y,m,1), end=new Date(y,m+1,1);
    let sum=0,count=0;
    for(let dd=new Date(start); dd<end; dd.setDate(dd.getDate()+1)){ sum+=getWater(dd.toISOString().slice(0,10)); count++; }
    arr.push(+(sum/(count||1)).toFixed(2));
  } return arr;
}
function updateWaterChart(){
  const vals=aggregateWater(waterRange);
  drawLineCanvas(document.getElementById("waterCanvas"), vals, {min:0, max:4, color:"#6ea8fe", fill:false});
}
renderWaterToday(); updateWaterChart();

// ===== Meals =====
const mealType=document.getElementById("meal-type");
const mealText=document.getElementById("meal-text");
const mealAddBtn=document.getElementById("meal-add-btn");
const mealsRows=document.getElementById("meals-today-rows");
const mealsTodayTotal=document.getElementById("meals-today-total");
let mealRange="week";

function extractKcal(text){ const m=text.match(/(\d{2,4})\s?k?cal/i); return m?parseInt(m[1],10):null; }
const kcalDict={"plov":650,"palov":650,"osh":650,"somsa":320,"samsa":320,"lagman":550,"shashlik":400,"kabob":400,"manti":450,"chuchvara":420,"oatmeal":250,"bo'tqa":250,"botqa":250,"salad":220,"salat":220,"tovuq":250,"chicken":250,"sho'rva":180,"shorva":180,"soup":180,"non":250,"qatiq":150,"yogurt":150,"cola":140,"pepsi":150,"pizza":700,"burger":700};
function estimateCalories(text){
  const explicit=extractKcal(text); if(explicit) return explicit;
  const t=text.toLowerCase(); let guess=0; for(const [k,v] of Object.entries(kcalDict)){ if(t.includes(k)) guess=Math.max(guess,v); }
  if(guess===0){ if(/\b(2|ikki|double)\b/.test(t)) guess=400; else guess=300; } return guess;
}
mealAddBtn?.addEventListener("click", ()=>{
  const text=mealText.value.trim(); if(!text) return alert("Ta'rif kiriting");
  const kcal=estimateCalories(text); const now=new Date();
  state.meals.push({date:todayStr(), time:fmtHM(now), kind:mealType.value, text, kcal});
  mealText.value=""; save(); renderMealsToday(); updateMealsChart();
});
function renderMealsToday(){
  if(!mealsRows) return;
  const rows=state.meals.filter(m=>m.date===todayStr());
  mealsRows.innerHTML=rows.map(m=> `<tr><td>${m.time}</td><td>${m.kind}</td><td>${m.text}</td><td>${m.kcal||""}</td></tr>`).join("");
  const total=rows.reduce((a,b)=>a+(b.kcal||0),0); if(mealsTodayTotal) mealsTodayTotal.textContent=total;
}
document.querySelectorAll(".meal-range-btn").forEach(b=> b.addEventListener("click", ()=>{ mealRange=b.dataset.range; updateMealsChart(); }));
function aggregateMeals(range="week"){
  const now=new Date();
  if(range==="week"||range==="month"){
    const days=range==="week"?7:30;
    return [...Array(days)].map((_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-(days-1-i)); const ds=d.toISOString().slice(0,10);
      return state.meals.filter(m=>m.date===ds).reduce((a,b)=>a+(b.kcal||0),0);
    });
  }
  const arr=[]; for(let i=11;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i,1);
    const y=d.getFullYear(), m=d.getMonth(), start=new Date(y,m,1), end=new Date(y,m+1,1);
    const kcal=state.meals.filter(mm=>{ const md=new Date(mm.date); return md>=start && md<end; }).reduce((a,b)=>a+(b.kcal||0),0);
    arr.push(kcal);
  } return arr;
}
function updateMealsChart(){
  const vals=aggregateMeals(mealRange);
  drawLineCanvas(document.getElementById("mealsCanvas"), vals, {min:0, max:null, color:"#ffd27a", fill:false});
}
renderMealsToday(); updateMealsChart();

// ===== GAS integration =====
const gasInput=document.getElementById("gas-url");
const gasSave=document.getElementById("save-gas");
const gasSend=document.getElementById("send-now");
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxLWoNkbCKREX9gIh74YYpt3WtCZBR23vcGCOFFqhExKUuEnq_8-mynl0OmUqo7P0tF/exec";
if(!state.settings.gasUrl){ state.settings.gasUrl = DEFAULT_GAS_URL; }
if(gasInput) gasInput.value = state.settings.gasUrl || "";
gasSave?.addEventListener("click", ()=>{ state.settings.gasUrl = gasInput.value.trim()||null; save(); alert("Saqlandi"); });
gasSend?.addEventListener("click", ()=> sendToGAS(true));

let sendTimer=null;
function maybeAutoSend(){
  if(!state.settings.gasUrl) return;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(()=> sendToGAS(false), 2000);
}
async function sendToGAS(showAlert){
  try{
    const payload = { ts: new Date().toISOString(), data: state };
    const res = await fetch(state.settings.gasUrl, { method:"POST", body: JSON.stringify(payload) });
    const txt = await res.text();
    if(!res.ok) throw new Error("HTTP "+res.status+" "+txt);
    if(showAlert){ alert("Yuborildi: OK"); }
    setStatus("✅ Online — yuborildi");
  }catch(e){
    if(showAlert){ alert("Xato: "+e.message); }
    setStatus("⚠️ Yuborilmadi: "+e.message.slice(0,60));
  }
}

// Network status
window.addEventListener('online', ()=> setStatus("✅ Online"));
window.addEventListener('offline', ()=> setStatus("⏳ Offline"));
if(navigator.onLine) setStatus("✅ Online");
