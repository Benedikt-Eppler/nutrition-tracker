// =====================================================================
// PROFILES
// =====================================================================
const PROFILE_COLORS = ['#58a6ff','#3fb950','#ffa657','#bc8cff','#f85149','#d29922'];

function profileColor(name) {
  let h = 0;
  for (const c of (name || '?')) h = (h * 31 + c.charCodeAt(0)) % PROFILE_COLORS.length;
  return PROFILE_COLORS[h];
}
function profileInitials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getProfiles()       { return JSON.parse(localStorage.getItem('nutriai-profiles') || '{}'); }
function saveProfiles(p)     { localStorage.setItem('nutriai-profiles', JSON.stringify(p)); }
function getActiveProfileId(){ return localStorage.getItem('nutriai-active') || null; }
function setActiveProfileId(id){ localStorage.setItem('nutriai-active', id); }

function getActiveProfile() {
  return getProfiles()[getActiveProfileId()] || null;
}

function createProfile(name, gender, calorieGoal) {
  const id  = 'p_' + Date.now();
  const profiles = getProfiles();
  profiles[id] = { id, name, gender, calorieGoal: calorieGoal || null };
  saveProfiles(profiles);
  return id;
}

function updateProfile(id, updates) {
  const profiles = getProfiles();
  if (!profiles[id]) return;
  Object.assign(profiles[id], updates);
  saveProfiles(profiles);
}

function deleteProfile(id) {
  const profiles = getProfiles();
  delete profiles[id];
  saveProfiles(profiles);
  // Clean up data
  localStorage.removeItem(pKey('nutriai-daily', id));
  localStorage.removeItem(pKey('nutriai-history', id));
  localStorage.removeItem(pKey('nutriai-foodlog', id));
}

// Profile-scoped localStorage key
function pKey(base, profileId) {
  return `${base}-${profileId || getActiveProfileId()}`;
}

// =====================================================================
// STATE
// =====================================================================
const state = {
  apiKey:       localStorage.getItem('nutriai-key') || '',
  lastMeal:     null,
  historyRange: 7,
  editContext:  null,
  profileFormMode: null,   // 'create' | 'edit'
  profileFormId:   null,   // id when editing
  profileFormGender: null, // selected gender in form
};

const GENDER_DEFAULTS = {
  male:   { kcal: 2500, fiber: 30 },
  female: { kcal: 2000, fiber: 25 },
};

function getGender()    { return getActiveProfile()?.gender || null; }
function getKcalGoal()  { return getActiveProfile()?.calorieGoal || GENDER_DEFAULTS[getGender()]?.kcal || 2000; }

function getTargets() {
  const kcal  = getKcalGoal();
  const fiber = GENDER_DEFAULTS[getGender()]?.fiber ?? 25;
  return {
    kcal:    { label: 'Kalorien',      val: kcal,                    unit: 'kcal', color: 'var(--orange)' },
    protein: { label: 'Protein',       val: Math.round(kcal*0.20/4), unit: 'g',    color: 'var(--blue)'   },
    carbs:   { label: 'Kohlenhydrate', val: Math.round(kcal*0.50/4), unit: 'g',    color: 'var(--green)'  },
    fat:     { label: 'Fett',          val: Math.round(kcal*0.30/9), unit: 'g',    color: 'var(--yellow)' },
    fiber:   { label: 'Ballaststoffe', val: fiber,                   unit: 'g',    color: 'var(--purple)' },
  };
}

// =====================================================================
// DAILY LOG  (profile-scoped)
// =====================================================================
function todayKey() { return new Date().toLocaleDateString('de-DE'); }

function getDailyLog() {
  const raw = localStorage.getItem(pKey('nutriai-daily'));
  if (!raw) return { date: todayKey(), meals: [] };
  return JSON.parse(raw);
}
function saveDailyLog(log) {
  localStorage.setItem(pKey('nutriai-daily'), JSON.stringify(log));
}
function addMealToDay(meal) {
  const log = getDailyLog();
  if (log.date !== todayKey()) { autoSaveToHistory(log); log.date = todayKey(); log.meals = []; }
  log.meals.push({
    name:  meal.label,
    time:  new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    total: meal.total,
    foods: meal.foods,
  });
  saveDailyLog(log);
  appendToFoodLog(meal.foods);
}
function clearDayLog() { saveDailyLog({ date: todayKey(), meals: [] }); }

function getDailyTotals(log) {
  return (log || getDailyLog()).meals.reduce((a, m) => ({
    kcal:    a.kcal    + (m.total.kcal    || 0),
    protein: a.protein + (m.total.protein || 0),
    carbs:   a.carbs   + (m.total.carbs   || 0),
    fat:     a.fat     + (m.total.fat     || 0),
    fiber:   a.fiber   + (m.total.fiber   || 0),
  }), { kcal:0, protein:0, carbs:0, fat:0, fiber:0 });
}

// =====================================================================
// HISTORY  (profile-scoped)
// =====================================================================
function getHistory()      { return JSON.parse(localStorage.getItem(pKey('nutriai-history')) || '{}'); }
function saveHistory(h)    { localStorage.setItem(pKey('nutriai-history'), JSON.stringify(h)); }

function autoSaveToHistory(log) {
  if (!log?.meals.length) return;
  const hist = getHistory();
  hist[log.date] = { ...getDailyTotals(log), meals: log.meals };
  saveHistory(hist);
}
function saveTodayToHistory() { const log = getDailyLog(); if (log.date === todayKey()) autoSaveToHistory(log); }

// =====================================================================
// FOOD LOG  (profile-scoped, silent analytics database)
// =====================================================================
// Schema: [{ ts, date, food, grams, kcal, protein, carbs, fat, fiber }, ...]
function getFoodLog()     { return JSON.parse(localStorage.getItem(pKey('nutriai-foodlog')) || '[]'); }
function saveFoodLog(log) { localStorage.setItem(pKey('nutriai-foodlog'), JSON.stringify(log)); }

function appendToFoodLog(foods) {
  const log  = getFoodLog();
  const ts   = Date.now();
  const date = todayKey();
  foods.forEach(f => log.push({
    ts, date,
    food:    f.name,
    grams:   +(f.grams.toFixed(1)),
    kcal:    +(f.kcal.toFixed(1)),
    protein: +(f.protein.toFixed(2)),
    carbs:   +(f.carbs.toFixed(2)),
    fat:     +(f.fat.toFixed(2)),
    fiber:   +(f.fiber.toFixed(2)),
  }));
  saveFoodLog(log);
}

function initDailyLog() {
  const log = getDailyLog();
  if (log.date !== todayKey() && log.meals.length) {
    autoSaveToHistory(log);
    saveDailyLog({ date: todayKey(), meals: [] });
  }
}

// =====================================================================
// GEMINI API
// =====================================================================
async function analyzeFood(text) {
  if (!state.apiKey) throw new Error('Kein API Key — bitte ⚙️ öffnen.');
  const prompt = `
Du bist ein Ernährungsexperte. Analysiere folgende Mahlzeit und berechne die Nährwerte.
Mahlzeit: "${text}"
Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärungen):
{"label":"Kurzer Mahlzeit-Name","foods":[{"name":"Lebensmittelname","grams":100,"kcal":131,"protein":5.0,"carbs":25.0,"fat":1.0,"fiber":1.8}],"total":{"kcal":131,"protein":5.0,"carbs":25.0,"fat":1.0,"fiber":1.8}}
Alle Werte sind absolute Mengen (nicht per 100g). Runde auf eine Dezimalstelle.`.trim();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.apiKey}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0} }) }
  );
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error?.message || `Gemini ${res.status}`); }
  const data = await res.json();
  let raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  raw = raw.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'').trim();
  return JSON.parse(raw);
}

// =====================================================================
// DEFICIT DISPLAY
// =====================================================================
function renderDeficit() {
  const totals  = getDailyTotals();
  const targets = getTargets();
  const wrap    = document.getElementById('deficit-wrap');

  const items = [
    { key:'kcal',    label:'Kalorien',      unit:'kcal', color:'var(--orange)', fmt: v => Math.round(v) },
    { key:'protein', label:'Protein',       unit:'g',    color:'var(--blue)',   fmt: v => v.toFixed(1)  },
    { key:'carbs',   label:'Kohlenhydrate', unit:'g',    color:'var(--green)',  fmt: v => v.toFixed(1)  },
    { key:'fat',     label:'Fett',          unit:'g',    color:'var(--yellow)', fmt: v => v.toFixed(1)  },
    { key:'fiber',   label:'Ballaststoffe', unit:'g',    color:'var(--purple)', fmt: v => v.toFixed(1)  },
  ].map(item => {
    const rem = targets[item.key].val - (totals[item.key] || 0);
    return { ...item, rem };
  }).filter(item => item.rem > 0);

  if (!items.length) {
    wrap.innerHTML = '<p class="deficit-done">Tagesziel erreicht!</p>';
  } else {
    wrap.innerHTML = `<p class="deficit-label">Noch offen</p>
      <div class="deficit-pills">${items.map(item => `
        <span class="deficit-pill" style="border-color:${item.color};color:${item.color}">
          ${item.fmt(item.rem)} ${item.unit} ${item.label}
        </span>`).join('')}
      </div>`;
  }
  wrap.classList.remove('hidden');
}

// =====================================================================
// RENDER: RINGS
// =====================================================================
const CIRC = 207.3;

function buildRingsHTML(totals, targets) {
  return ['kcal','protein','carbs','fat','fiber'].map((key, i) => {
    const t      = targets[key];
    const val    = totals[key] || 0;
    const ratio  = val / t.val;
    const pctNum = Math.round(ratio * 100);
    const pct    = Math.min(ratio, 1);
    const color  = ratio > 1 ? 'var(--red)' : t.color;
    const valStr = key === 'kcal' ? Math.round(val) : val.toFixed(1);
    return `
      <div class="macro-ring-wrap" style="animation-delay:${i*70}ms">
        <div class="macro-ring-svg-wrap">
          <svg class="macro-ring-svg" viewBox="0 0 80 80">
            <circle class="ring-track" cx="40" cy="40" r="33"/>
            <circle class="ring-arc" cx="40" cy="40" r="33"
              stroke="${color}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"
              data-offset="${(CIRC*(1-pct)).toFixed(2)}"/>
          </svg>
          <div class="macro-ring-center">
            <span class="macro-ring-pct" style="color:${color}">${pctNum}%</span>
            <span class="macro-ring-label">${t.label}</span>
          </div>
        </div>
        <div class="macro-ring-detail"><strong>${valStr} ${t.unit}</strong><br>von ${t.val} ${t.unit}</div>
      </div>`;
  }).join('');
}

function animateRings(container) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    container.querySelectorAll('.ring-arc').forEach(el => { el.style.strokeDashoffset = el.dataset.offset; });
  }));
}

// =====================================================================
// RENDER: FOOD CARDS
// =====================================================================
function buildFoodCardsHTML(foods) {
  return (foods||[]).map((f, i) => `
    <div class="food-card" style="animation-delay:${i*60}ms">
      <div class="food-card-top">
        <span class="food-card-name">${f.name}</span>
        <span class="food-card-grams">${f.grams}g</span>
      </div>
      <div class="food-macros">
        <div class="macro-pill"><span class="macro-pill-val pill-kcal">${Math.round(f.kcal)}</span><span class="macro-pill-label">kcal</span></div>
        <div class="macro-pill"><span class="macro-pill-val pill-prot">${f.protein.toFixed(1)}g</span><span class="macro-pill-label">Protein</span></div>
        <div class="macro-pill"><span class="macro-pill-val pill-carbs">${f.carbs.toFixed(1)}g</span><span class="macro-pill-label">Carbs</span></div>
        <div class="macro-pill"><span class="macro-pill-val pill-fat">${f.fat.toFixed(1)}g</span><span class="macro-pill-label">Fett</span></div>
        <div class="macro-pill"><span class="macro-pill-val pill-fiber">${f.fiber.toFixed(1)}g</span><span class="macro-pill-label">Fiber</span></div>
      </div>
    </div>`).join('');
}

// =====================================================================
// RENDER: CURRENT MEAL RESULTS
// =====================================================================
function renderResults(data) {
  document.getElementById('food-breakdown').innerHTML = buildFoodCardsHTML(data.foods);
  const barsEl = document.getElementById('macro-bars');
  barsEl.innerHTML = buildRingsHTML(data.total, getTargets());
  animateRings(barsEl);
  show('results');
}

// =====================================================================
// RENDER: TODAY
// =====================================================================
function renderToday() {
  const log = getDailyLog();
  if (log.date !== todayKey() || !log.meals.length) {
    hide('today-section'); hide('divider-line'); hide('deficit-wrap'); return;
  }
  show('today-section'); show('divider-line');

  document.getElementById('today-meal-count').textContent =
    ` — ${log.meals.length} Mahlzeit${log.meals.length !== 1 ? 'en' : ''}`;

  const ringsEl = document.getElementById('today-rings');
  ringsEl.innerHTML = buildRingsHTML(getDailyTotals(log), getTargets());
  animateRings(ringsEl);

  document.getElementById('today-meal-list').innerHTML = log.meals.map((m, i) => `
    <div class="meal-entry" data-i="${i}">
      <span class="meal-entry-time">${m.time}</span>
      <span class="meal-entry-name">${m.name}</span>
      <span class="meal-entry-kcal">${Math.round(m.total.kcal)} kcal</span>
      <span class="meal-entry-arrow">›</span>
    </div>`).join('');

  document.querySelectorAll('.meal-entry').forEach(el =>
    el.addEventListener('click', () =>
      openMealEdit(log.meals[+el.dataset.i], { source:'today', mealIndex:+el.dataset.i })
    )
  );

  renderDeficit();
}

// =====================================================================
// RENDER: HISTORY
// =====================================================================
function renderHistory() {
  const hist  = getHistory();
  const goal  = getKcalGoal();
  const range = state.historyRange;
  const days  = [];
  for (let i = range-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toLocaleDateString('de-DE');
    days.push({ key:k, date:d, data: hist[k] || null });
  }

  const container = document.getElementById('history-content');

  if (range === 7) {
    container.innerHTML = `<div class="history-bars">${days.map(day => {
      if (!day.data) return `
        <div class="history-bar-row empty">
          <span class="hist-label">${formatDayLabel(day.date)}</span>
          <div class="hist-bar-wrap"><div class="hist-bar-empty">—</div></div>
        </div>`;
      const pct   = Math.min(day.data.kcal / goal * 100, 100);
      const color = day.data.kcal > goal ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)';
      return `
        <div class="history-bar-row" data-day-key="${day.key}">
          <span class="hist-label">${formatDayLabel(day.date)}</span>
          <div class="hist-bar-wrap">
            <div class="hist-bar" style="width:0%;background:${color}" data-target="${pct.toFixed(1)}"></div>
          </div>
          <span class="hist-kcal" style="color:${color}">${Math.round(day.data.kcal)}</span>
        </div>`;
    }).join('')}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      container.querySelectorAll('.hist-bar').forEach(b => { b.style.width = b.dataset.target + '%'; });
    }));
  } else {
    container.innerHTML = `
      <div class="hist-grid-legend">
        <span>Kein Eintrag</span>
        <div class="hist-grid-legend-dots">
          <div class="hist-dot" style="background:var(--surface2)"></div>
          <div class="hist-dot" style="background:var(--green)"></div>
          <div class="hist-dot" style="background:var(--yellow)"></div>
          <div class="hist-dot" style="background:var(--red)"></div>
        </div>
        <span>Über Ziel</span>
      </div>
      <div class="hist-grid">${days.map(day => {
        if (!day.data) return `<div class="hist-dot empty" title="${day.key}"></div>`;
        const pct   = day.data.kcal / goal;
        const color = pct > 1 ? 'var(--red)' : pct > 0.85 ? 'var(--yellow)' : 'var(--green)';
        return `<div class="hist-dot filled" style="background:${color}"
                     data-day-key="${day.key}" title="${day.key}: ${Math.round(day.data.kcal)} kcal"></div>`;
      }).join('')}</div>`;
  }

  container.querySelectorAll('[data-day-key]').forEach(el =>
    el.addEventListener('click', () => openDayDetail(el.dataset.dayKey, hist[el.dataset.dayKey]))
  );
}

// =====================================================================
// MEAL EDIT MODAL
// =====================================================================
function openMealEdit(meal, context) {
  state.editContext = context;
  document.getElementById('meal-modal-title').textContent = meal.name;
  document.getElementById('meal-modal-time').textContent  = meal.time;

  const foods = meal.foods || [];
  document.getElementById('meal-modal-body').innerHTML = `
    <div class="edit-food-list">
      ${foods.map((f, i) => `
        <div class="edit-food-row">
          <span class="edit-food-name">${f.name}</span>
          <div class="edit-gram-wrap">
            <input class="edit-gram-input" type="number" min="1" max="2000"
                   value="${Math.round(f.grams)}" data-index="${i}"
                   data-base-kcal="${f.kcal}" data-base-grams="${f.grams}">
            <span>g</span>
          </div>
          <span class="edit-kcal" data-index="${i}">${Math.round(f.kcal)} kcal</span>
        </div>`).join('')}
    </div>
    <div class="edit-total-row">
      <span>Gesamt</span>
      <span class="edit-total-kcal" id="edit-total-kcal">${Math.round(meal.total.kcal)} kcal</span>
    </div>
    <button class="btn-primary" id="save-meal-btn">Speichern</button>
    <button class="btn-danger" id="delete-meal-btn">🗑 Mahlzeit löschen</button>
  `;

  document.querySelectorAll('.edit-gram-input').forEach(input => {
    input.addEventListener('input', () => {
      const newG = parseFloat(input.value) || 0;
      const scaled = parseFloat(input.dataset.baseGrams) > 0
        ? parseFloat(input.dataset.baseKcal) * (newG / parseFloat(input.dataset.baseGrams)) : 0;
      document.querySelector(`.edit-kcal[data-index="${input.dataset.index}"]`).textContent =
        `${Math.round(scaled)} kcal`;
      let total = 0;
      document.querySelectorAll('.edit-gram-input').forEach(inp => {
        const g = parseFloat(inp.value)||0, bG = parseFloat(inp.dataset.baseGrams), bK = parseFloat(inp.dataset.baseKcal);
        total += bG > 0 ? bK*(g/bG) : 0;
      });
      document.getElementById('edit-total-kcal').textContent = `${Math.round(total)} kcal`;
    });
  });

  document.getElementById('save-meal-btn').addEventListener('click',   () => saveMealEdit(meal));
  document.getElementById('delete-meal-btn').addEventListener('click',  () => deleteMeal());
  show('meal-modal');
}

function saveMealEdit(originalMeal) {
  const inputs = document.querySelectorAll('.edit-gram-input');
  const foods  = originalMeal.foods.map((f, i) => {
    const newG = Math.max(1, parseFloat(inputs[i].value) || f.grams);
    const s    = f.grams > 0 ? newG/f.grams : 1;
    return { ...f, grams:newG, kcal:f.kcal*s, protein:f.protein*s, carbs:f.carbs*s, fat:f.fat*s, fiber:f.fiber*s };
  });
  const total = foods.reduce((a,f) => ({kcal:a.kcal+f.kcal,protein:a.protein+f.protein,
    carbs:a.carbs+f.carbs,fat:a.fat+f.fat,fiber:a.fiber+f.fiber}), {kcal:0,protein:0,carbs:0,fat:0,fiber:0});
  const updated = { ...originalMeal, foods, total };
  const ctx = state.editContext;

  if (ctx.source === 'today') {
    const log = getDailyLog(); log.meals[ctx.mealIndex] = updated; saveDailyLog(log);
    hide('meal-modal'); renderToday();
  } else {
    const hist = getHistory(); hist[ctx.dateKey].meals[ctx.mealIndex] = updated;
    const dt = hist[ctx.dateKey].meals.reduce((a,m) => ({kcal:a.kcal+m.total.kcal,protein:a.protein+m.total.protein,
      carbs:a.carbs+m.total.carbs,fat:a.fat+m.total.fat,fiber:a.fiber+m.total.fiber}),{kcal:0,protein:0,carbs:0,fat:0,fiber:0});
    Object.assign(hist[ctx.dateKey], dt); saveHistory(hist);
    hide('meal-modal'); renderHistory();
  }
}

function deleteMeal() {
  if (!confirm('Mahlzeit löschen?')) return;
  const ctx = state.editContext;
  if (ctx.source === 'today') {
    const log = getDailyLog(); log.meals.splice(ctx.mealIndex, 1); saveDailyLog(log);
    hide('meal-modal'); renderToday();
  } else {
    const hist = getHistory(); hist[ctx.dateKey].meals.splice(ctx.mealIndex, 1);
    if (!hist[ctx.dateKey].meals.length) { delete hist[ctx.dateKey]; }
    else {
      const dt = hist[ctx.dateKey].meals.reduce((a,m) => ({kcal:a.kcal+m.total.kcal,protein:a.protein+m.total.protein,
        carbs:a.carbs+m.total.carbs,fat:a.fat+m.total.fat,fiber:a.fiber+m.total.fiber}),{kcal:0,protein:0,carbs:0,fat:0,fiber:0});
      Object.assign(hist[ctx.dateKey], dt);
    }
    saveHistory(hist); hide('meal-modal'); renderHistory();
  }
}

function openDayDetail(dateKey, data) {
  if (!data) return;
  document.getElementById('meal-modal-title').textContent = dateKey;
  document.getElementById('meal-modal-time').textContent  =
    `${Math.round(data.kcal)} kcal · ${data.meals.length} Mahlzeit${data.meals.length!==1?'en':''}`;
  document.getElementById('meal-modal-body').innerHTML = data.meals.map((m, i) => `
    <div class="day-meal-entry" data-i="${i}">
      <div class="day-meal-entry-info">
        <span class="day-meal-entry-name">${m.name}</span>
        <span class="day-meal-entry-meta">${m.time} · ${Math.round(m.total.kcal)} kcal</span>
      </div>
      <span class="meal-entry-arrow">›</span>
    </div>`).join('');
  document.querySelectorAll('.day-meal-entry').forEach(el =>
    el.addEventListener('click', () => {
      hide('meal-modal');
      openMealEdit(data.meals[+el.dataset.i], { source:'history', dateKey, mealIndex:+el.dataset.i });
    })
  );
  show('meal-modal');
}

// =====================================================================
// PROFILE MODAL
// =====================================================================
function renderProfileAvatar() {
  const p   = getActiveProfile();
  const btn = document.getElementById('profile-btn');
  if (!p) { btn.textContent = '?'; btn.style.background = '#30363d'; return; }
  btn.textContent        = profileInitials(p.name);
  btn.style.background   = profileColor(p.name);
  btn.style.borderColor  = profileColor(p.name);
}

function openProfileModal() {
  renderProfileList();
  hide('profile-form');
  show('profile-modal');
}

function renderProfileList() {
  const profiles   = getProfiles();
  const activeId   = getActiveProfileId();
  const list       = document.getElementById('profile-list');
  const entries    = Object.values(profiles);

  if (!entries.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Noch keine Profile. Leg jetzt eines an.</p>';
    showProfileForm('create');
    return;
  }

  list.innerHTML = entries.map(p => `
    <div class="profile-entry ${p.id === activeId ? 'active' : ''}" data-id="${p.id}">
      <div class="profile-entry-avatar" style="background:${profileColor(p.name)}">${profileInitials(p.name)}</div>
      <div class="profile-entry-info">
        <span class="profile-entry-name">${p.name}</span>
        <span class="profile-entry-meta">${p.gender === 'male' ? '♂ Mann' : p.gender === 'female' ? '♀ Frau' : '—'} · ${p.calorieGoal || (GENDER_DEFAULTS[p.gender]?.kcal || 2000)} kcal</span>
      </div>
      <div class="profile-entry-actions">
        ${p.id === activeId ? '<span class="profile-active-badge">Aktiv</span>' : ''}
        <button class="profile-edit-btn" data-id="${p.id}" title="Bearbeiten">✏️</button>
        <button class="profile-delete-btn" data-id="${p.id}" title="Löschen">🗑</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.profile-entry').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.profile-edit-btn, .profile-delete-btn')) return;
      const id = el.dataset.id;
      setActiveProfileId(id);
      initDailyLog();
      renderProfileAvatar();
      hide('profile-modal');
      renderToday();
    });
  });
  list.querySelectorAll('.profile-edit-btn').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); showProfileForm('edit', btn.dataset.id); })
  );
  list.querySelectorAll('.profile-delete-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Profil löschen? Alle Daten dieses Profils werden entfernt.`)) return;
      const wasActive = btn.dataset.id === getActiveProfileId();
      deleteProfile(btn.dataset.id);
      if (wasActive) {
        const remaining = Object.keys(getProfiles());
        if (remaining.length) { setActiveProfileId(remaining[0]); initDailyLog(); renderToday(); }
        else localStorage.removeItem('nutriai-active');
        renderProfileAvatar();
      }
      renderProfileList();
    })
  );
}

function showProfileForm(mode, editId) {
  state.profileFormMode   = mode;
  state.profileFormId     = editId || null;
  state.profileFormGender = null;

  const form = document.getElementById('profile-form');
  document.getElementById('profile-form-label').textContent = mode === 'edit' ? 'Profil bearbeiten' : 'Neues Profil';
  document.getElementById('profile-name-input').value  = '';
  document.getElementById('profile-goal-input').value  = '';
  document.querySelectorAll('#profile-gender-toggle .gender-btn').forEach(b => b.classList.remove('active'));

  if (mode === 'edit' && editId) {
    const p = getProfiles()[editId];
    document.getElementById('profile-name-input').value = p.name;
    document.getElementById('profile-goal-input').value = p.calorieGoal || '';
    state.profileFormGender = p.gender;
    document.querySelectorAll('#profile-gender-toggle .gender-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.gender === p.gender)
    );
  }
  form.classList.remove('hidden');
}

function setupProfileModal() {
  document.getElementById('profile-btn').addEventListener('click', openProfileModal);
  document.getElementById('profile-modal-close').addEventListener('click', () => hide('profile-modal'));
  document.getElementById('profile-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('profile-modal')) hide('profile-modal');
  });

  document.getElementById('new-profile-btn').addEventListener('click', () => showProfileForm('create'));
  document.getElementById('cancel-profile-btn').addEventListener('click', () => {
    hide('profile-form');
    if (!Object.keys(getProfiles()).length) hide('profile-modal');
  });

  document.querySelectorAll('#profile-gender-toggle .gender-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      state.profileFormGender = btn.dataset.gender;
      document.querySelectorAll('#profile-gender-toggle .gender-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.gender === state.profileFormGender)
      );
    })
  );

  document.getElementById('save-profile-btn').addEventListener('click', () => {
    const name = document.getElementById('profile-name-input').value.trim();
    if (!name) { document.getElementById('profile-name-input').focus(); return; }
    const goal   = parseInt(document.getElementById('profile-goal-input').value) || null;
    const gender = state.profileFormGender;

    if (state.profileFormMode === 'create') {
      const id = createProfile(name, gender, goal);
      if (!getActiveProfileId()) { setActiveProfileId(id); initDailyLog(); }
    } else {
      updateProfile(state.profileFormId, { name, gender, calorieGoal: goal });
    }

    renderProfileAvatar();
    renderToday();
    hide('profile-form');
    renderProfileList();
  });
}

// =====================================================================
// SETTINGS MODAL (API Key only)
// =====================================================================
function setupModal() {
  const overlay  = document.getElementById('modal-overlay');
  const apiInput = document.getElementById('api-key-input');
  if (state.apiKey) apiInput.placeholder = '(gespeichert)';
  const close = () => overlay.classList.add('hidden');
  document.getElementById('settings-btn').addEventListener('click', () => overlay.classList.remove('hidden'));
  document.getElementById('modal-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.getElementById('save-key-btn').addEventListener('click', () => {
    const key = apiInput.value.trim();
    if (key) {
      state.apiKey = key; localStorage.setItem('nutriai-key', key);
      apiInput.value = ''; apiInput.placeholder = '(gespeichert)'; close();
    }
  });
}

// =====================================================================
// VIEW TABS
// =====================================================================
function setupTabs() {
  document.querySelectorAll('.view-tab').forEach(tab =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const v = tab.dataset.view;
      document.getElementById('view-today').classList.toggle('hidden', v !== 'today');
      document.getElementById('view-history').classList.toggle('hidden', v !== 'history');
      if (v === 'history') renderHistory();
    })
  );
  document.querySelectorAll('.range-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.historyRange = parseInt(btn.dataset.range);
      renderHistory();
    })
  );
}

// =====================================================================
// MIC
// =====================================================================
let recognition = null;
function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('mic-btn');
  if (!SR) { btn.style.opacity='.4'; btn.disabled=true; return; }
  recognition = new SR();
  recognition.lang = 'de-DE'; recognition.interimResults = false;
  recognition.onresult = e => { document.getElementById('food-input').value = e.results[0][0].transcript; stopMic(); };
  recognition.onerror = () => stopMic(); recognition.onend = () => stopMic();
  btn.addEventListener('click', () => btn.classList.contains('active') ? stopMic() : startMic());
}
function startMic(){ recognition?.start(); document.getElementById('mic-btn').classList.add('active'); show('mic-status'); }
function stopMic() { recognition?.stop();  document.getElementById('mic-btn').classList.remove('active'); hide('mic-status'); }

// =====================================================================
// HELPERS
// =====================================================================
function formatDayLabel(date) {
  return ['So','Mo','Di','Mi','Do','Fr','Sa'][date.getDay()] + ` ${date.getDate()}.${date.getMonth()+1}.`;
}
function show(id){ document.getElementById(id).classList.remove('hidden'); }
function hide(id){ document.getElementById(id).classList.add('hidden'); }
function showError(msg){ document.getElementById('error-msg').textContent=msg; show('error-box'); }

// =====================================================================
// MAIN FLOW
// =====================================================================
async function handleAnalyze() {
  const text = document.getElementById('food-input').value.trim();
  if (!text) return;
  hide('results'); hide('error-box'); show('loading');
  document.getElementById('analyze-btn').disabled = true;
  try {
    state.lastMeal = await analyzeFood(text);
    renderResults(state.lastMeal);
  } catch(err) { showError(err.message); }
  finally { hide('loading'); document.getElementById('analyze-btn').disabled = false; }
}

// =====================================================================
// INIT
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
  // If there's an active profile, init its daily log
  if (getActiveProfileId()) initDailyLog();

  setupMic();
  setupModal();
  setupProfileModal();
  setupTabs();
  renderProfileAvatar();
  renderToday();

  document.getElementById('analyze-btn').addEventListener('click', handleAnalyze);
  document.getElementById('food-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAnalyze();
  });

  document.getElementById('add-to-day-btn').addEventListener('click', () => {
    if (!state.lastMeal) return;
    addMealToDay(state.lastMeal); state.lastMeal = null;
    hide('results'); document.getElementById('food-input').value = '';
    renderToday(); window.scrollTo({ top:0, behavior:'smooth' });
  });
  document.getElementById('discard-btn').addEventListener('click', () => {
    state.lastMeal = null; hide('results'); hide('error-box');
    document.getElementById('food-input').value = '';
  });
  document.getElementById('reset-day-btn').addEventListener('click', () => {
    if (!confirm('Heutigen Tag speichern und zurücksetzen?')) return;
    saveTodayToHistory(); clearDayLog(); renderToday();
  });

  document.getElementById('meal-modal-close').addEventListener('click', () => hide('meal-modal'));
  document.getElementById('meal-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('meal-modal')) hide('meal-modal');
  });

  // Onboarding: open profile modal if no profiles exist
  if (!Object.keys(getProfiles()).length) {
    setTimeout(() => openProfileModal(), 300);
  }
});
