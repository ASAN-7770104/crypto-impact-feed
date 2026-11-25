// utils.js
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function isoNow(){
  return new Date().toISOString();
}

function formatTs(iso){
  const d = new Date(iso);
  const pad = (x) => String(x).padStart(2,"0");
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function impactLevel(score){
  if (score >= 80) return "high";
  if (score >= 50) return "mid";
  return "low";
}

function moveClass(pct){
  if (pct > 0.15) return "good";
  if (pct < -0.15) return "bad";
  return "flat";
}

// localStorage helpers
const LS = {
  get(key, fallback){
    try{
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    }catch{ return fallback; }
  },
  set(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }
};
