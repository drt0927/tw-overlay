// 계수 및 명중 계산기 통합 렌더러 (빌드 오류 수정 완료본)

interface Equipment { name: string; series: string; stab?: number; hack?: number; def?: number; mag_atk?: number; mag_def?: number; hit?: number; }
interface ProfileData { id: string; name: string; data: any; }

let gearData: any = { armors: {}, weapons: {}, defense: {}, wrists: {}, artifacts: {} };
let activeBuffs: any[] = [];
let profiles: Record<string, ProfileData> = {};
let currentProfileId = 'default';
let currentType = 'stab';

const categories = [
  { id: 'helm', source: 'defense', key: '투구' }, { id: 'armor', source: 'armors', isNested: true },
  { id: 'weapon', source: 'weapons', isNested: true }, { id: 'wrist', source: 'wrists', isNested: true },
  { id: 'amulet', source: 'defense', key: '머리' }, { id: 'wing', source: 'defense', key: '몸' },
  { id: 'gauntlet', source: 'defense', key: '손' }, { id: 'boots', source: 'defense', key: '다리' },
  { id: 'artifact', source: 'artifacts', isNested: true }
];

const statNames: Record<string, string[]> = {
  stab: ['STAB', 'HACK'], hack: ['HACK', 'STAB'], phycomp: ['STAB', 'HACK'],
  magatk: ['INT', 'MR'], maghack: ['HACK', 'INT'], magdef: ['MR', 'INT']
};

const STANDARD_BUFFS = ['util_snowman', 'dmg_potion_plus', 'stat_trust_plus', 'stat_izabel_fixed', 'stat_izabel_ratio', 'dmg_izabel', 'dmg_club_p', 'util_ampoule', 'util_haste'];
const PROFILES_KEY = 'tw-coefficient-calculator-profiles-v1';
const SAVE_KEY = 'tw-coefficient-calculator-settings-v7final';

async function init() {
  try {
    const [armors, weapons, defense, wrists, artifacts, buffs] = await Promise.all([
      fetch('./assets/data/equipment/armors.json').then(r => r.json()),
      fetch('./assets/data/equipment/weapons.json').then(r => r.json()),
      fetch('./assets/data/equipment/defense_gear.json').then(r => r.json()),
      fetch('./assets/data/equipment/wrists.json').then(r => r.json()),
      fetch('./assets/data/equipment/artifacts.json').then(r => r.json()),
      fetch('./assets/data/buffs.json').then(r => r.json())
    ]);
    gearData = { armors, weapons, defense, wrists, artifacts };
    activeBuffs = buffs;
    renderEquipmentOptions();
    initProfiles();
    initBuffPresets();
    updateLabels();
    calculate();
    if ((window as any).lucide) (window as any).lucide.createIcons();
  } catch (e) { console.error('Data Load Failed', e); }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      currentType = (e.currentTarget as HTMLElement).dataset.type || 'stab';
      updateLabels(); calculate(); saveCurrentProfile();
    });
  });

  const handleInput = () => { calculate(); saveCurrentProfile(); };
  document.addEventListener('input', (e) => { if (['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) handleInput(); });
  document.addEventListener('change', (e) => { if ((e.target as HTMLElement).tagName === 'SELECT') handleInput(); });
  document.getElementById('profile-select')?.addEventListener('change', (e) => switchProfile((e.target as HTMLSelectElement).value));
  document.getElementById('buff-preset-select')?.addEventListener('change', () => { calculate(); saveCurrentProfile(); });
  document.getElementById('btn-add-profile')?.addEventListener('click', async () => { const n = await showPrompt('새 프로필', '이름 입력:'); if (n?.trim()) addProfile(n.trim()); });
  document.getElementById('btn-rename-profile')?.addEventListener('click', async () => { const p = profiles[currentProfileId]; if (p) { const n = await showPrompt('이름 변경', '새 이름:', p.name); if (n?.trim() && n !== p.name) renameProfile(currentProfileId, n.trim()); } });
  document.getElementById('btn-delete-profile')?.addEventListener('click', async () => { if (Object.keys(profiles).length > 1 && await showConfirm('삭제', '정말 삭제할까요?')) deleteProfile(currentProfileId); else if (Object.keys(profiles).length <= 1) showAlert('알림', '최소 1개는 유지해야 합니다.'); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const m = document.getElementById('modal-overlay'); if (m && !m.classList.contains('hidden')) document.getElementById('modal-cancel')?.click(); else window.close(); } });
}

function initBuffPresets() {
  const select = document.getElementById('buff-preset-select') as HTMLSelectElement;
  if (!select) return;
  const savedPresets = localStorage.getItem('buff_presets');
  if (savedPresets) {
    const presets = JSON.parse(savedPresets);
    presets.forEach((p: any) => { const opt = document.createElement('option'); opt.value = p.id.toString(); opt.innerText = p.name; select.appendChild(opt); });
  }
}

function calculate() {
  const presetId = (document.getElementById('buff-preset-select') as HTMLSelectElement)?.value || 'none';
  let buffIds: string[] = [];
  if (presetId === 'standard') buffIds = STANDARD_BUFFS;
  else if (presetId !== 'none') {
    const savedPresets = localStorage.getItem('buff_presets');
    if (savedPresets) {
      const presets = JSON.parse(savedPresets);
      const preset = presets.find((p: any) => p.id.toString() === presetId);
      if (preset) buffIds = preset.buffIds;
    }
  }

  let bFix = 0, bPct = 0;
  buffIds.forEach(id => {
    const b = activeBuffs.find(x => x.id === id);
    if (b) {
      const f = b.effect.match(/능력치\s*\+?(\d+)(?!%)/); if (f) bFix += parseInt(f[1]);
      const p = b.effect.match(/능력치\s*\+?(\d+)%/); if (p) bPct += parseInt(p[1]);
    }
  });

  const getV = (id: string) => Number((document.getElementById(id) as HTMLInputElement)?.value) || 0;
  const [mainLabel, subLabel] = statNames[currentType];

  const calcBonus = (baseId: string) => {
    const base = getV(baseId);
    const bonusFromPct = Math.floor((base + bFix) * (bPct / 100));
    return { fixed: bFix, ratio: bPct, bonusFromPct };
  };

  const mainBonus = calcBonus(`stat-${mainLabel.toLowerCase()}`);
  const subBonus = calcBonus(`stat-${subLabel.toLowerCase()}`);
  const dexBonus = calcBonus('stat-dex');

  const bInfo = document.getElementById('active-buff-info');
  if (bInfo) {
    if (buffIds.length > 0) {
      const row = (label: string, bonus: any) => `
        <div class="flex justify-between items-center text-[10px]">
          <span class="text-slate-400 w-8 font-black">${label}:</span>
          <span class="text-purple-300 font-bold">+${bonus.fixed}, +${bonus.ratio}% (+${bonus.bonusFromPct})</span>
        </div>
      `;
      bInfo.innerHTML = `
        <div class="flex flex-col gap-1 mt-1 bg-purple-500/10 p-2.5 rounded-xl border border-purple-500/20">
          <div class="flex justify-between items-center mb-1 border-b border-purple-500/20 pb-1">
            <span class="text-[10px] text-purple-200 font-black">도핑 상세보너스</span>
            <span class="text-[9px] bg-purple-500/30 text-purple-100 px-1.5 rounded">${buffIds.length}종</span>
          </div>
          ${row(mainLabel, mainBonus)}
          ${row(subLabel, subBonus)}
          ${row('DEX', dexBonus)}
        </div>
      `;
    } else { bInfo.innerHTML = `<span class="text-slate-500">프리셋을 선택하면 스탯에 반영됩니다.</span>`; }
  }

  const applyB = (v: number) => Math.floor((v + bFix) * (1 + bPct / 100));
  const cStats = { stab: applyB(getV('stat-stab')), hack: applyB(getV('stat-hack')), int: applyB(getV('stat-int')), mr: applyB(getV('stat-mr')), dex: applyB(getV('stat-dex')) };

  let gMain = 0, gSub = 0, gHit = 0, uMain = 0, uSub = 0;
  categories.forEach(cat => {
    const s = document.getElementById(`gear-${cat.id}`) as HTMLSelectElement;
    if (s?.value) {
      const item = JSON.parse(s.value);
      const abilS = getV(`abil-${cat.id}-stat`), abilH = getV(`abil-${cat.id}-hit`);
      gHit += (item.hit || 0) + abilH;
      let iM = 0, iS = 0;
      if (['stab', 'phycomp'].includes(currentType)) { iM = item.stab || 0; iS = item.hack || 0; }
      else if (currentType === 'hack') { iM = item.hack || 0; iS = item.stab || 0; }
      else if (currentType === 'magatk') { iM = item.mag_atk || 0; iS = item.mag_def || 0; }
      else if (currentType === 'maghack') { iM = item.hack || 0; iS = item.mag_atk || 0; }
      else if (currentType === 'magdef') { iM = item.mag_def || 0; iS = item.mag_atk || 0; }
      gMain += iM + abilS; gSub += iS;
      uMain += getV(`upg-${cat.id}-main`); uSub += getV(`upg-${cat.id}-sub`);
      const p = document.getElementById(`preview-${cat.id}`); if (p) p.innerText = `M:${iM} / S:${iS} (D:${item.hit || 0})`;
    } else { const p = document.getElementById(`preview-${cat.id}`); if (p) p.innerText = ""; }
  });

  ['avatar', 'cuff', 'effect', 'relic'].forEach(k => { gMain += getV(`bonus-${k}-main`); gSub += getV(`bonus-${k}-sub`); gHit += getV(`bonus-${k}-hit`); });
  gMain += getV('bonus-title');
  const core = getV('bonus-core'), coreCoeff = core * 32.5;

  let cMain = 0, cSub = 0;
  if (['stab', 'phycomp'].includes(currentType)) { cMain = cStats.stab; cSub = cStats.hack; }
  else if (currentType === 'hack') { cMain = cStats.hack; cSub = cStats.stab; }
  else if (currentType === 'magatk') { cMain = cStats.int; cSub = cStats.mr; }
  else if (currentType === 'maghack') { cMain = cStats.hack; cSub = cStats.int; }
  else if (currentType === 'magdef') { cMain = cStats.mr; cSub = cStats.int; }

  const fMain = cMain + gMain + uMain, fSub = cSub + gSub + uSub, fHit = cStats.dex + gHit;
  const setT = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  setT('sum-main-char', cMain.toString()); setT('sum-main-gear', gMain.toString()); setT('sum-main-upg', uMain.toString()); setT('sum-main-total', fMain.toString());
  setT('sum-sub-char', cSub.toString()); setT('sum-sub-gear', gSub.toString()); setT('sum-sub-upg', uSub.toString()); setT('sum-sub-total', fSub.toString());
  setT('sum-hit-char', cStats.dex.toString()); setT('sum-hit-gear', Math.floor(gHit).toString()); setT('sum-hit-total', Math.floor(fHit).toString());

  let coeff = 0;
  if (currentType === 'stab') coeff = (gMain * 23.75) + (uMain * 32.5) + (gSub * 3.75) + (uSub * 18.75) + (cStats.stab * 2.1) + (cStats.hack * 1.08);
  else if (currentType === 'hack') coeff = (gMain * 23.75) + (uMain * 32.5) + (gSub * 3.75) + (uSub * 18.75) + (cStats.hack * 2.1) + (cStats.stab * 1.08);
  else if (currentType === 'phycomp') coeff = (gMain * 14.5) + (uMain * 28.75) + (gSub * 14.5) + (uSub * 28.75) + (cStats.stab * 1.8) + (cStats.hack * 1.8);
  else if (currentType === 'magatk') coeff = (gMain * 23.75) + (uMain * 32.5) + (gSub * 2.5) + (uSub * 18.25) + (cStats.int * 2.4) + (cStats.mr * 0.6);
  else if (currentType === 'maghack') coeff = (gMain * 23.75) + (uMain * 32.5) + (gSub * 2.5) + (uSub * 18.25) + (cStats.hack * 2.4) + (cStats.int * 0.6);
  else if (currentType === 'magdef') coeff = (gMain * 20.5) + (uMain * 32.5) + (gSub * 2.5) + (uSub * 16.75) + (cStats.mr * 2.55) + (cStats.int * 0.45);
  coeff += coreCoeff;

  setT('total-coefficient', coeff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  setT('total-hit-display', Math.floor(fHit).toString());
  updateGuide(coeff, fHit, coreCoeff);
}

function updateGuide(coeff: number, hit: number, coreCoeff: number) {
  const container = document.getElementById('content-guide'); if (!container) return;
  container.innerHTML = '';
  const contents = [
    { name: '최후의 결전', hit: 2500, target: 95000, calc: (c: number) => c <= 90000 ? '불가능' : c <= 93000 ? '힘듬' : c <= 95000 ? '가능' : '원활' },
    { name: '골고다 부대장', hit: 2450, target: 0, calc: (_c: number) => '원활' },
    { name: '아페테리아 (어려움)', hit: 2400, target: 72500, calc: (c: number) => c <= 67500 ? '불가능' : c <= 70000 ? '힘듬' : c <= 72500 ? '가능' : '원활' },
    { name: '오딘 전면전', hit: 1350, target: 51000, isOdin: true, calc: (c: number) => (c - coreCoeff) <= 47000 ? '불가능' : (c - coreCoeff) <= 49500 ? '힘듬' : (c - coreCoeff) <= 51000 ? '가능' : '원활' },
    { name: '이클립스 토벌전', hit: 2300, target: 72500, calc: (c: number) => c <= 67500 ? '불가능' : c <= 70000 ? '힘듬' : c <= 72500 ? '가능' : '원활' },
    { name: '오를리방어전 (지옥)', hit: 2200, target: 0, calc: (_c: number) => '원활' },
    { name: '아페테리아 (일반)', hit: 2200, target: 0, calc: (_c: number) => '원활' },
    { name: '베스티지', hit: 1800, target: 0, calc: (_c: number) => '원활' },
    { name: '이클립스 6보스', hit: 1650, target: 55000, calc: (c: number) => c <= 45000 ? '불가능' : c <= 52500 ? '힘듬' : c <= 55000 ? '가능' : '원활' },
    { name: '어비스 (지옥)', hit: 1350, target: 0, calc: (_c: number) => '원활' },
    { name: '신조 (어려움)', hit: 1300, target: 0, calc: (_c: number) => '원활' },
    { name: '어비스 (어려움)', hit: 800, target: 0, calc: (_c: number) => '원활' },
    { name: '어비스 (일반)', hit: 800, target: 0, calc: (_c: number) => '원활' },
    { name: '신조 (일반)', hit: 800, target: 0, calc: (_c: number) => '원활' },
    { name: '머큐리얼/루미너스', hit: 800, target: 0, calc: (_c: number) => '원활' }
  ];
  contents.forEach(ct => {
    const cur = ct.isOdin ? (coeff - coreCoeff) : coeff;
    const status = ct.target === 0 ? '정보부족' : ct.calc(cur), hitOk = hit >= ct.hit, color = status === '원활' ? 'text-green-400' : status === '가능' ? 'text-yellow-400' : status === '힘듬' ? 'text-orange-400' : 'text-red-400';
    const pct = ct.target > 0 ? Math.min(100, Math.floor((cur / ct.target) * 100)) : 0;
    const div = document.createElement('div'); div.className = 'bg-slate-900/60 p-3 rounded-xl border border-slate-800/50 space-y-1.5 mb-2';
    div.innerHTML = `<div class="flex justify-between items-center"><span class="text-slate-200 text-[12px] font-black">${ct.name}</span><div class="flex gap-2"><span class="${hitOk ? 'text-green-500' : 'text-red-500'} text-[10px] font-bold">DEX ${ct.hit} ${hitOk ? 'OK' : '부족'}</span><span class="${color} text-[10px] font-black">${status}</span></div></div><div class="flex justify-between text-[9px] text-slate-500 font-bold"><span>목표: ${ct.target > 0 ? ct.target.toLocaleString() : '미정'}</span><span>현재: ${Math.floor(cur).toLocaleString()} ${ct.target > 0 ? `(${pct}%)` : ''}</span></div>${ct.target > 0 ? `<div class="w-full h-1 bg-slate-800 rounded-full overflow-hidden"><div class="h-full ${pct >= 100 ? (hitOk ? 'bg-green-500' : 'bg-yellow-500') : 'bg-blue-500'}" style="width: ${pct}%"></div></div>` : ''}`;
    container.appendChild(div);
  });
}

function showModal(t: string, m: string, i = false, d = ''): Promise<string | boolean> {
  return new Promise(res => {
    const o = document.getElementById('modal-overlay'), ti = document.getElementById('modal-title'), ms = document.getElementById('modal-message'), inp = document.getElementById('modal-input') as HTMLInputElement, c = document.getElementById('modal-confirm'), ca = document.getElementById('modal-cancel');
    if (!o || !ti || !ms || !inp || !c || !ca) return res(false);
    ti.innerText = t; ms.innerText = m; if (i) { inp.classList.remove('hidden'); inp.value = d; inp.focus(); } else inp.classList.add('hidden');
    o.classList.remove('hidden');
    const cl = () => { o.classList.add('hidden'); c.removeEventListener('click', ok); ca.removeEventListener('click', no); };
    const ok = () => { cl(); res(i ? inp.value : true); }; const no = () => { cl(); res(false); };
    c.addEventListener('click', ok); ca.addEventListener('click', no);
  });
}
const showPrompt = (t: string, m: string, d = '') => showModal(t, m, true, d).then(r => typeof r === 'string' ? r : null);
const showConfirm = (t: string, m: string) => showModal(t, m).then(r => !!r);
const showAlert = (t: string, m: string) => { const ca = document.getElementById('modal-cancel'); if (ca) ca.classList.add('hidden'); return showModal(t, m).then(() => ca?.classList.remove('hidden')); };

function initProfiles() {
  const s = localStorage.getItem(PROFILES_KEY), last = localStorage.getItem(PROFILES_KEY + '_last');
  if (s) { profiles = JSON.parse(s); currentProfileId = last && profiles[last] ? last : Object.keys(profiles)[0]; }
  else { const d = localStorage.getItem(SAVE_KEY); profiles = { 'default': { id: 'default', name: '기본 프로필', data: d ? JSON.parse(d) : null } }; }
  renderProfileSelect(); loadProfileData(currentProfileId);
}
function renderProfileSelect() { const s = document.getElementById('profile-select') as HTMLSelectElement; if (s) { s.innerHTML = Object.values(profiles).map(p => `<option value="${p.id}" ${p.id === currentProfileId ? 'selected' : ''}>${p.name}</option>`).join(''); } }
function addProfile(n: string) { const id = 'p' + Date.now(); profiles[id] = { id, name: n, data: captureCurrentData() }; saveProfilesToStorage(); switchProfile(id); }
function renameProfile(id: string, n: string) { if (profiles[id]) { profiles[id].name = n; saveProfilesToStorage(); renderProfileSelect(); } }
function deleteProfile(id: string) { delete profiles[id]; saveProfilesToStorage(); switchProfile(Object.keys(profiles)[0]); }
function switchProfile(id: string) { if (!profiles[id]) return; saveCurrentProfile(); currentProfileId = id; localStorage.setItem(PROFILES_KEY + '_last', id); loadProfileData(id); renderProfileSelect(); calculate(); }
function saveCurrentProfile() { if (profiles[currentProfileId]) { profiles[currentProfileId].data = captureCurrentData(); saveProfilesToStorage(); } }
function saveProfilesToStorage() { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); localStorage.setItem(PROFILES_KEY + '_last', currentProfileId); }
function captureCurrentData() {
  const d: any = { stats: {}, bonuses: {}, gears: {}, upgradesMain: {}, upgradesSub: {}, abilsStat: {}, abilsHit: {}, currentType, buffPreset: (document.getElementById('buff-preset-select') as HTMLSelectElement)?.value };
  ['stab', 'hack', 'int', 'mr', 'dex'].forEach(k => d.stats[k] = (document.getElementById(`stat-${k}`) as HTMLInputElement)?.value);
  ['avatar', 'cuff', 'effect', 'relic'].forEach(k => { d.bonuses[`${k}Main`] = (document.getElementById(`bonus-${k}-main`) as HTMLInputElement)?.value; d.bonuses[`${k}Sub`] = (document.getElementById(`bonus-${k}-sub`) as HTMLInputElement)?.value; d.bonuses[`${k}Hit`] = (document.getElementById(`bonus-${k}-hit`) as HTMLInputElement)?.value; });
  d.bonuses.title = (document.getElementById('bonus-title') as HTMLInputElement)?.value; d.bonuses.core = (document.getElementById('bonus-core') as HTMLInputElement)?.value;
  categories.forEach(cat => { d.gears[cat.id] = (document.getElementById(`gear-${cat.id}`) as HTMLSelectElement)?.value; d.upgradesMain[cat.id] = (document.getElementById(`upg-${cat.id}-main`) as HTMLInputElement)?.value; d.upgradesSub[cat.id] = (document.getElementById(`upg-${cat.id}-sub`) as HTMLInputElement)?.value; d.abilsStat[cat.id] = (document.getElementById(`abil-${cat.id}-stat`) as HTMLInputElement)?.value; d.abilsHit[cat.id] = (document.getElementById(`abil-${cat.id}-hit`) as HTMLInputElement)?.value; });
  return d;
}
function loadProfileData(id: string) {
  const p = profiles[id]; if (!p?.data) return; const d = p.data;
  if (d.stats) Object.keys(d.stats).forEach(k => { const el = document.getElementById(`stat-${k}`) as HTMLInputElement; if (el) el.value = d.stats[k] || ''; });
  if (d.bonuses) Object.keys(d.bonuses).forEach(k => { const id = `bonus-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`; const el = document.getElementById(id) as HTMLInputElement; if (el) el.value = d.bonuses[k] || ''; });
  if (d.gears) categories.forEach(cat => {
    (document.getElementById(`gear-${cat.id}`) as HTMLSelectElement).value = d.gears[cat.id] || '';
    (document.getElementById(`upg-${cat.id}-main`) as HTMLInputElement).value = d.upgradesMain[cat.id] || '';
    (document.getElementById(`upg-${cat.id}-sub`) as HTMLInputElement).value = d.upgradesSub[cat.id] || '';
    (document.getElementById(`abil-${cat.id}-stat`) as HTMLInputElement).value = d.abilsStat[cat.id] || '';
    (document.getElementById(`abil-${cat.id}-hit`) as HTMLInputElement).value = d.abilsHit[cat.id] || '';
  });
  if (d.buffPreset) (document.getElementById('buff-preset-select') as HTMLSelectElement).value = d.buffPreset;
  if (d.currentType) { currentType = d.currentType; document.querySelectorAll('.tab-btn').forEach(b => { if ((b as HTMLElement).dataset.type === currentType) b.classList.add('active'); else b.classList.remove('active'); }); updateLabels(); }
}

function updateLabels() {
  const [m, s] = statNames[currentType] || ['STAB', 'HACK'];
  document.querySelectorAll('.bonus-label-main').forEach(el => (el as HTMLElement).innerText = m); document.querySelectorAll('.bonus-label-sub').forEach(el => (el as HTMLElement).innerText = s);
  const em = document.getElementById('sum-label-main'), es = document.getElementById('sum-label-sub'); if (em) em.innerText = m; if (es) es.innerText = s;
  categories.forEach(cat => {
    const um = document.getElementById(`upg-${cat.id}-main`) as HTMLInputElement, us = document.getElementById(`upg-${cat.id}-sub`) as HTMLInputElement, am = document.getElementById(`abil-${cat.id}-stat`) as HTMLInputElement;
    if (um) um.placeholder = m; if (us) us.placeholder = s; if (am) am.placeholder = m;
  });
  const sn = document.getElementById('current-series-name'), ab = document.querySelector(`.tab-btn[data-type="${currentType}"]`); if (sn && ab) sn.innerText = ab.textContent || "";
  const f = document.getElementById('sum-formula'); if (f) {
    if (['stab', 'hack'].includes(currentType)) f.innerText = `장비(${m}*23.75 + ${s}*3.75) + 강화(${m}*32.5 + ${s}*18.75) + 캐릭터(${m}*2.1 + ${s}*1.08) + 코어*32.5`;
    else if (currentType === 'phycomp') f.innerText = `장비(${m}*14.5 + ${s}*14.5) + 강화(${m}*28.75 + ${s}*28.75) + 캐릭터(${m}*1.8 + ${s}*1.8) + 코어*32.5`;
    else f.innerText = `장비(${m}*23.75 + ${s}*2.5) + 강화(${m}*32.5 + ${s}*18.25) + 캐릭터(${m}*2.4 + ${s}*0.6) + 코어*32.5`;
  }
}

function renderEquipmentOptions() {
  categories.forEach(cat => {
    const s = document.getElementById(`gear-${cat.id}`) as HTMLSelectElement; if (!s) return;
    s.innerHTML = '<option value="">장착 안함</option>';
    const d = gearData[cat.source];
    if (cat.isNested) Object.keys(d).forEach(sc => { const g = document.createElement('optgroup'); g.label = sc; d[sc].forEach((i: any) => { const o = document.createElement('option'); o.value = JSON.stringify(i); o.innerText = i.name; g.appendChild(o); }); s.appendChild(g); });
    else d[cat.key || '']?.forEach((i: any) => { const o = document.createElement('option'); o.value = JSON.stringify(i); o.innerText = i.name; s.appendChild(o); });
  });
}

window.addEventListener('DOMContentLoaded', init);
