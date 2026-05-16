/**
 * 시에나의 기운 강화 시뮬레이터 렌더러 로직 (Final Probability Sync + Stop Feature + i18n)
 */

// --- Constants (Official Probability Based: 2026-05-16) ---
const AMPLIFY_PROBABILITIES = [1.0, 0.8, 0.6, 0.4, 0.2, 0.1, 0.03, 0.02, 0.01, 0.005];

const AM_COST_SEED = [
  100000000, 110000000, 121000000, 133100000, 146410000, 
  175692000, 210830400, 252996480, 303595776, 455393664
];
const AM_COST_ELSO = [
  15000, 16500, 18150, 19965, 21961, 
  26354, 31625, 37950, 45540, 68310
];

const AM_COST_POWDER = [10, 12, 14, 16, 19, 26, 36, 50, 70, 119];
const AM_COST_SOUL = [0, 0, 0, 0, 0, 0, 0, 1, 2, 3];

const STAT_RESET_COST_SEED = [
  1000000, 2000000, 3000000, 4000000, 5000000, 
  6000000, 7000000, 8000000, 9000000, 10000000
];
const STAT_RESET_COST_ELSO = [
  150, 300, 450, 600, 750, 900, 1050, 1200, 1350, 1500
];
const STAT_RESET_COST_HAMMER = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];

const EXTRA_RESET_ALL_SEED = 1000000;
const EXTRA_RESET_ALL_ELSO = 150;
const EXTRA_RESET_SINGLE_SEED = 100000000;
const EXTRA_RESET_SINGLE_ELSO = 15000;

type EquipType = 'weapon' | 'armor';
type StatGrade = '하' | '중' | '상';
type Currency = 'seed' | 'elso';

interface StatOption {
  name: string;
  grades: Record<StatGrade, { range: [number, number], chance: number }>;
}

const WEAPON_STAT_POOL: StatOption[] = [
  { name: '찌르기', grades: { '하': { range: [1, 2], chance: 0.112 }, '중': { range: [4, 5], chance: 0.05 }, '상': { range: [6, 10], chance: 0.005 } } },
  { name: '베기', grades: { '하': { range: [1, 2], chance: 0.110 }, '중': { range: [4, 5], chance: 0.05 }, '상': { range: [6, 10], chance: 0.005 } } },
  { name: '마공', grades: { '하': { range: [1, 2], chance: 0.112 }, '중': { range: [4, 5], chance: 0.05 }, '상': { range: [6, 10], chance: 0.005 } } },
  { name: '마방', grades: { '하': { range: [1, 2], chance: 0.112 }, '중': { range: [4, 5], chance: 0.05 }, '상': { range: [6, 10], chance: 0.005 } } },
  { name: '마법베기', grades: { '하': { range: [1, 2], chance: 0.112 }, '중': { range: [4, 5], chance: 0.05 }, '상': { range: [6, 10], chance: 0.005 } } },
  { name: '물복', grades: { '하': { range: [1, 2], chance: 0.112 }, '중': { range: [4, 5], chance: 0.05 }, '상': { range: [6, 10], chance: 0.005 } } },
];

const ARMOR_STAT_POOL: StatOption[] = [
  { name: '물리 피해 저항', grades: { '하': { range: [1, 1], chance: 0.03 }, '중': { range: [2, 2], chance: 0.02 }, '상': { range: [3, 3], chance: 0.006 } } },
  { name: '마법 피해 저항', grades: { '하': { range: [1, 1], chance: 0.03 }, '중': { range: [2, 2], chance: 0.02 }, '상': { range: [3, 3], chance: 0.006 } } },
  { name: '크리 피격 감소', grades: { '하': { range: [1, 1], chance: 0.06 }, '중': { range: [2, 2], chance: 0.05 }, '상': { range: [3, 3], chance: 0.018 } } },
  { name: '명중률', grades: { '하': { range: [1, 2], chance: 0.06 }, '중': { range: [3, 4], chance: 0.05 }, '상': { range: [5, 6], chance: 0.018 } } },
  { name: '회피율', grades: { '하': { range: [1, 2], chance: 0.06 }, '중': { range: [3, 4], chance: 0.05 }, '상': { range: [5, 6], chance: 0.018 } } },
  { name: '찌르기', grades: { '하': { range: [1, 3], chance: 0.04 }, '중': { range: [4, 6], chance: 0.03 }, '상': { range: [7, 10], chance: 0.002 } } },
  { name: '베기', grades: { '하': { range: [1, 3], chance: 0.04 }, '중': { range: [4, 6], chance: 0.03 }, '상': { range: [7, 10], chance: 0.002 } } },
  { name: '마공', grades: { '하': { range: [1, 3], chance: 0.04 }, '중': { range: [4, 6], chance: 0.03 }, '상': { range: [7, 10], chance: 0.002 } } },
  { name: '물방', grades: { '하': { range: [1, 3], chance: 0.04 }, '중': { range: [4, 6], chance: 0.03 }, '상': { range: [7, 10], chance: 0.002 } } },
  { name: '마방', grades: { '하': { range: [1, 3], chance: 0.04 }, '중': { range: [4, 6], chance: 0.03 }, '상': { range: [7, 10], chance: 0.002 } } },
  { name: '명보', grades: { '하': { range: [1, 3], chance: 0.04 }, '중': { range: [4, 6], chance: 0.03 }, '상': { range: [7, 10], chance: 0.002 } } },
  { name: '민보', grades: { '하': { range: [1, 3], chance: 0.04 }, '중': { range: [4, 6], chance: 0.03 }, '상': { range: [7, 10], chance: 0.002 } } },
];

const EXTRA_OPTION_POOL = [
  { group: '공격력', name: '공격력 증가', grades: [{ range: [1, 2], chance: 0.009, unit: '%' }, { range: [3, 5], chance: 0.0042, unit: '%' }, { range: [8, 10], chance: 0.0005, unit: '%' }] },
  { group: '방어력', name: '방어력 증가', grades: [{ range: [1, 2], chance: 0.05, unit: '%' }, { range: [3, 5], chance: 0.03, unit: '%' }, { range: [8, 10], chance: 0.0057, unit: '%' }] },
  { group: '스탯', name: '모든 스탯 증가', grades: [{ range: [5, 10], chance: 0.05, unit: '' }, { range: [11, 20], chance: 0.03, unit: '' }, { range: [21, 30], chance: 0.005, unit: '' }] },
  { group: '중딜', name: '중딜레이 감소', grades: [{ range: [0.5, 0.5], chance: 0.004, unit: '%' }, { range: [1, 1], chance: 0.001, unit: '%' }, { range: [2, 2], chance: 0.0003, unit: '%' }] },
  { group: '방무', name: '방어 무시 공격 확률', grades: [{ range: [1, 1], chance: 0.004, unit: '%' }, { range: [2, 2], chance: 0.001, unit: '%' }, { range: [3, 3], chance: 0.0003, unit: '%' }] },
  { group: 'HP', name: 'HP 증가', grades: [{ range: [5, 9], chance: 0.1, unit: '%' }, { range: [10, 14], chance: 0.08, unit: '%' }, { range: [15, 20], chance: 0.06, unit: '%' }] },
  { group: 'MP', name: 'MP 증가', grades: [{ range: [1, 5], chance: 0.1, unit: '%' }, { range: [6, 10], chance: 0.08, unit: '%' }, { range: [11, 15], chance: 0.06, unit: '%' }] },
  { group: 'SP', name: 'SP 증가', grades: [{ range: [1, 5], chance: 0.1, unit: '%' }, { range: [6, 10], chance: 0.08, unit: '%' }, { range: [11, 15], chance: 0.06, unit: '%' }] },
  { group: '크리', name: '크리티컬 확률 증가', grades: [{ range: [1, 3], chance: 0.05, unit: '%' }, { range: [4, 7], chance: 0.03, unit: '%' }, { range: [8, 10], chance: 0.005, unit: '%' }] },
];

// --- State ---
let currentRank = 0;
let equipType: EquipType = 'weapon';
let activeCurrency: Currency = 'seed';
let currentTab = 'amplify';

let stats: { name: string, value: number, grade: StatGrade, locked: boolean }[] = [];
let extraOptions: { name: string, value: number, unit: string, group: string, grade: StatGrade, open: boolean, selected: boolean }[] = [
  { name: '미개방', value: 0, unit: '', group: '', grade: '하', open: false, selected: false },
  { name: '미개방', value: 0, unit: '', group: '', grade: '하', open: false, selected: false },
  { name: '미개방', value: 0, unit: '', group: '', grade: '하', open: false, selected: false },
];

let seedAmplify = 0, elsoAmplify = 0;
let seedStats = 0, elsoStats = 0;
let seedExtra = 0, elsoExtra = 0;

let isAutoRunning = false;
let stopAutoRequested = false;

let matPowder = 0;
let matSoul = 0;
let matHammer = 0;
let matBookAll = 0;
let matBookSingle = 0;

// Action Counters
let cntAmplify = 0;
let cntStats = 0;
let cntExtra = 0;

let lastLogType: string | null = null;
let lastLogMessage: string | null = null;
let consecutiveCount = 1;

// --- Helper Functions ---

/**
 * 숫자를 한국어 단위(조, 억, 만)로 변환합니다.
 */
function formatKoreanNumber(num: number, showAllUnits = true, includeRemainder = false): string {
  if (num === 0) return '0';
  const units = ['', '만', '억', '조'];
  const result: string[] = [];
  const nOrig = Math.abs(num);
  let n = nOrig;
  for (let i = 0; i < units.length; i++) {
    const chunk = n % 10000;
    if (chunk > 0) {
      if (i === 0 && !includeRemainder && nOrig >= 10000) {
        // Skip
      } else {
        result.unshift(chunk.toLocaleString() + units[i]);
      }
    }
    n = Math.floor(n / 10000);
    if (n === 0) break;
  }
  if (result.length === 0) return (num < 0 ? '-' : '') + nOrig.toLocaleString();
  if (!showAllUnits && result.length > 1) {
    return (num < 0 ? '-' : '') + result[0] + (result[1] ? ' ' + result[1] : '');
  }
  return (num < 0 ? '-' : '') + result.join(' ');
}

function unlockExtraSlot(index: number) {
  if (!extraOptions[index].open) {
    const usedGroups = extraOptions.filter(o => o.open && o.group).map(o => o.group);
    const drawn = drawExtraOption(usedGroups);
    extraOptions[index] = { ...extraOptions[index], ...drawn, open: true };
  }
}

function updateAutoStatPool() {
  const select = document.getElementById('auto-stat-name') as HTMLSelectElement;
  if (!select) return;
  const pool = equipType === 'weapon' ? WEAPON_STAT_POOL : ARMOR_STAT_POOL;
  const currentVal = select.value;
  select.innerHTML = '';
  pool.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.name;
    o.innerText = opt.name;
    select.appendChild(o);
  });
  if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

function updateAutoExtraPool() {
  const select = document.getElementById('auto-extra-name') as HTMLSelectElement;
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '';
  EXTRA_OPTION_POOL.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.group; // Use group as internal value for easier group check
    o.innerText = opt.name;
    select.appendChild(o);
  });
  if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

function setButtonsDisabled(disabled: boolean, keepAutoBtn = false) {
  const ids = ['btn-amplify', 'btn-auto-amplify', 'btn-reset-stats', 'btn-auto-reset-stats', 'btn-reset-extra', 'btn-auto-reset-extra', 'target-rank', 'btn-reset-all', 'auto-stat-name', 'auto-stat-grade', 'auto-extra-name', 'auto-extra-grade'];
  ids.forEach(id => {
    const el = document.getElementById(id) as HTMLButtonElement | HTMLSelectElement;
    if (el) {
      if (id === 'btn-auto-amplify' || id === 'btn-auto-reset-stats' || id === 'btn-auto-reset-extra') {
        el.disabled = keepAutoBtn ? false : disabled;
      } else {
        el.disabled = disabled;
      }
    }
  });
}

function getRandomValue(range: [number, number]): number {
  const [min, max] = range;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function drawStat(): { name: string, value: number, grade: StatGrade } {
  const pool = equipType === 'weapon' ? WEAPON_STAT_POOL : ARMOR_STAT_POOL;
  const flatPool: any[] = [];
  pool.forEach(opt => {
    (Object.keys(opt.grades) as StatGrade[]).forEach(grade => {
      flatPool.push({ name: opt.name, grade, ...opt.grades[grade] });
    });
  });
  const totalWeight = flatPool.reduce((sum, item) => sum + item.chance, 0);
  let r = Math.random() * totalWeight;
  for (const item of flatPool) {
    if (r < item.chance) return { name: item.name, value: getRandomValue(item.range), grade: item.grade };
    r -= item.chance;
  }
  return { name: flatPool[0].name, value: flatPool[0].range[0], grade: '하' };
}

function drawExtraOption(excludeGroups: string[]): any {
  const availablePool = EXTRA_OPTION_POOL.filter(opt => !excludeGroups.includes(opt.group));
  const flatPool: any[] = [];
  availablePool.forEach(opt => {
    opt.grades.forEach((g, idx) => {
      const grade: StatGrade = idx === 0 ? '하' : idx === 1 ? '중' : '상';
      flatPool.push({ name: opt.name, value: g.range[0] === g.range[1] ? g.range[0] : getRandomValue(g.range as [number, number]), unit: g.unit, group: opt.group, grade, chance: g.chance });
    });
  });
  const totalWeight = flatPool.reduce((sum, item) => sum + item.chance, 0);
  let r = Math.random() * totalWeight;
  for (const item of flatPool) {
    if (r < item.chance) return item;
    r -= item.chance;
  }
  return flatPool[0];
}

// --- UI Actions ---

function switchTab(tabId: string) {
  if (isAutoRunning) return;
  currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(view => view.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`)?.classList.add('active');
  document.getElementById(`view-${tabId}`)?.classList.remove('hidden');
  updateUI();
}

async function autoResetStats() {
  if (isAutoRunning) { stopAutoRequested = true; return; }
  if (currentRank === 0) return;
  const targetName = (document.getElementById('auto-stat-name') as HTMLSelectElement).value;
  const targetGrade = (document.getElementById('auto-stat-grade') as HTMLSelectElement).value as StatGrade;
  
  isAutoRunning = true; stopAutoRequested = false;
  setButtonsDisabled(true, true);
  const btn = document.getElementById('btn-auto-reset-stats');
  if (btn) {
    btn.innerText = '중지';
    btn.classList.remove('bg-slate-700', 'hover:bg-slate-600', 'border-white/5');
    btn.classList.add('bg-red-500/20', 'hover:bg-red-500/30', 'text-red-400', 'border-red-500/30');
  }

  const gradeValues: Record<StatGrade, number> = { '하': 1, '중': 2, '상': 3 };
  const targetVal = gradeValues[targetGrade];

  while (true) {
    if (stopAutoRequested) break;
    
    resetStats(true);
    
    const found = stats.some(s => !s.locked && s.name === targetName && gradeValues[s.grade] >= targetVal);
    if (found) {
      addLog(`목표 능력치 획득: [${targetName} (${targetGrade} 이상)]`, 'success');
      break;
    }
    
    await new Promise(r => setTimeout(r, 10));
  }

  isAutoRunning = false; setButtonsDisabled(false);
  if (btn) {
    btn.innerText = '자동 시작';
    btn.classList.remove('bg-red-500/20', 'hover:bg-red-500/30', 'text-red-400', 'border-red-500/30');
    btn.classList.add('bg-slate-700', 'hover:bg-slate-600', 'border-white/5');
  }
  updateUI();
}

async function autoResetExtraOptions() {
  if (isAutoRunning) { stopAutoRequested = true; return; }
  if (extraOptions.filter(o => o.open).length === 0) {
    addLog('개방된 추가 옵션 슬롯이 없습니다.', 'error');
    return;
  }
  
  const type = (document.querySelector('input[name="item-type"]:checked') as HTMLInputElement).value;
  const targetGroup = (document.getElementById('auto-extra-name') as HTMLSelectElement).value;
  const targetGrade = (document.getElementById('auto-extra-grade') as HTMLSelectElement).value as StatGrade;

  if (type === 'single') {
    const targetIdx = extraOptions.findIndex(o => o.selected && o.open);
    if (targetIdx === -1) {
      addLog('재설정할 옵션 슬롯을 선택해주세요.', 'error');
      return;
    }
    // 중복 방지 규칙 체크: 다른 슬롯에 이미 목표 옵션이 있는지 확인
    const isDuplicate = extraOptions.some((o, i) => i !== targetIdx && o.open && o.group === targetGroup);
    if (isDuplicate) {
      const optName = EXTRA_OPTION_POOL.find(p => p.group === targetGroup)?.name || targetGroup;
      addLog(`이미 다른 슬롯에 [${optName}] 옵션이 존재합니다. 중복 등장이 불가능하므로 목표를 변경해주세요.`, 'error');
      return;
    }
  }

  isAutoRunning = true; stopAutoRequested = false;
  setButtonsDisabled(true, true);
  const btn = document.getElementById('btn-auto-reset-extra');
  if (btn) {
    btn.innerText = '중지';
    btn.classList.remove('bg-slate-700', 'hover:bg-slate-600', 'border-white/5');
    btn.classList.add('bg-red-500/20', 'hover:bg-red-500/30', 'text-red-400', 'border-red-500/30');
  }

  const gradeValues: Record<StatGrade, number> = { '하': 1, '중': 2, '상': 3 };
  const targetVal = gradeValues[targetGrade];

  while (true) {
    if (stopAutoRequested) break;
    
    resetExtraOptions(true);
    
    let found = false;
    if (type === 'all') {
      found = extraOptions.some(o => o.open && o.group === targetGroup && gradeValues[o.grade] >= targetVal);
    } else {
      const selectedOpt = extraOptions.find(o => o.selected && o.open);
      if (selectedOpt && selectedOpt.group === targetGroup && gradeValues[selectedOpt.grade] >= targetVal) {
        found = true;
      }
    }

    if (found) {
      const optName = EXTRA_OPTION_POOL.find(p => p.group === targetGroup)?.name || targetGroup;
      addLog(`목표 추가 옵션 획득: [${optName} (${targetGrade} 이상)]`, 'success');
      break;
    }
    
    await new Promise(r => setTimeout(r, 10));
  }

  isAutoRunning = false; setButtonsDisabled(false);
  if (btn) {
    btn.innerText = '자동 시작';
    btn.classList.remove('bg-red-500/20', 'hover:bg-red-500/30', 'text-red-400', 'border-red-500/30');
    btn.classList.add('bg-slate-700', 'hover:bg-slate-600', 'border-white/5');
  }
  updateUI();
}

function setEquipType(type: EquipType) {
  if (isAutoRunning) return;
  equipType = type;
  const w = document.getElementById('btn-weapon');
  const a = document.getElementById('btn-armor');
  
  if (type === 'weapon') {
    w?.classList.add('bg-purple-600', 'text-white', 'shadow-lg');
    w?.classList.remove('hover:bg-white/5', 'text-slate-500');
    a?.classList.add('hover:bg-white/5', 'text-slate-500');
    a?.classList.remove('bg-purple-600', 'text-white', 'shadow-lg');
  } else {
    a?.classList.add('bg-purple-600', 'text-white', 'shadow-lg');
    a?.classList.remove('hover:bg-white/5', 'text-slate-500');
    w?.classList.add('hover:bg-white/5', 'text-slate-500');
    w?.classList.remove('bg-purple-600', 'text-white', 'shadow-lg');
  }
  resetSimulator(true);
  updateAutoStatPool();
  addLog(`장비 부위 변경: [${type === 'weapon' ? '무기·손목' : '방어구'}]`, 'info');
}

function setCurrency(cur: Currency) {
  if (isAutoRunning) return;
  activeCurrency = cur;
  const s = document.getElementById('cur-seed');
  const e = document.getElementById('cur-elso');
  
  if (cur === 'seed') {
    s?.classList.add('bg-emerald-600', 'text-white');
    s?.classList.remove('hover:bg-white/5', 'text-slate-500');
    e?.classList.add('hover:bg-white/5', 'text-slate-500');
    e?.classList.remove('bg-amber-600', 'text-white');
  } else {
    e?.classList.add('bg-amber-600', 'text-white');
    e?.classList.remove('hover:bg-white/5', 'text-slate-500');
    s?.classList.add('hover:bg-white/5', 'text-slate-500');
    s?.classList.remove('bg-emerald-600', 'text-white');
  }
  updateUI();
}

function amplifyStep() {
  if (currentRank >= 10 || isAutoRunning) return;
  const costS = AM_COST_SEED[currentRank];
  const costE = AM_COST_ELSO[currentRank];
  if (activeCurrency === 'seed') seedAmplify += costS; else elsoAmplify += costE;
  matPowder += AM_COST_POWDER[currentRank];
  matSoul += AM_COST_SOUL[currentRank];
  cntAmplify++;
  const success = Math.random() < AMPLIFY_PROBABILITIES[currentRank];
  const box = document.getElementById('current-rank')?.parentElement?.parentElement;
  box?.classList.remove('animate-success', 'animate-fail');
  if (success) {
    currentRank++;
    const newStat = drawStat();
    stats.push({ ...newStat, locked: false });
    if (currentRank === 3) unlockExtraSlot(0);
    if (currentRank === 7) unlockExtraSlot(1);
    if (currentRank === 10) unlockExtraSlot(2);
    addLog(`${currentRank}단계 증폭 성공!`, 'success');
    void box?.offsetWidth; box?.classList.add('animate-success');
  } else {
    addLog(`${currentRank + 1}단계 증폭 실패`, 'fail');
    void box?.offsetWidth; box?.classList.add('animate-fail');
  }
  updateUI();
}

async function autoAmplify() {
  if (isAutoRunning) { stopAutoRequested = true; return; }
  const target = parseInt((document.getElementById('target-rank') as HTMLSelectElement).value);
  if (currentRank >= target) return;
  isAutoRunning = true; stopAutoRequested = false;
  setButtonsDisabled(true, true);
  const btn = document.getElementById('btn-auto-amplify');
  if (btn) {
    btn.innerText = '강화 중지';
    btn.classList.remove('bg-slate-700', 'hover:bg-slate-600', 'border-white/5');
    btn.classList.add('bg-red-500/20', 'hover:bg-red-500/30', 'text-red-400', 'border-red-500/30');
  }
  while (currentRank < target) {
    if (stopAutoRequested) break;
    const costS = AM_COST_SEED[currentRank];
    const costE = AM_COST_ELSO[currentRank];
    if (activeCurrency === 'seed') seedAmplify += costS; else elsoAmplify += costE;
    matPowder += AM_COST_POWDER[currentRank];
    matSoul += AM_COST_SOUL[currentRank];
    cntAmplify++;
    if (Math.random() < AMPLIFY_PROBABILITIES[currentRank]) {
      currentRank++;
      stats.push({ ...drawStat(), locked: false });
      if (currentRank === 3) unlockExtraSlot(0);
      if (currentRank === 7) unlockExtraSlot(1);
      if (currentRank === 10) unlockExtraSlot(2);
      addLog(`${currentRank}단계 증폭 성공!`, 'success');
    } else {
      addLog(`${currentRank + 1}단계 증폭 실패`, 'fail');
    }
    updateUI();
    await new Promise(r => setTimeout(r, 10));
  }
  isAutoRunning = false; setButtonsDisabled(false);
  if (btn) {
    btn.innerText = '자동 시작';
    btn.classList.remove('bg-red-500/20', 'hover:bg-red-500/30', 'text-red-400', 'border-red-500/30');
    btn.classList.add('bg-slate-700', 'hover:bg-slate-600', 'border-white/5');
  }
  updateUI();
}

function resetStats(isAuto = false) {
  if (currentRank === 0 || (isAutoRunning && !isAuto)) return;
  const lockCount = stats.filter(s => s.locked).length;
  if (lockCount === 10) return;
  if (activeCurrency === 'seed') seedStats += STAT_RESET_COST_SEED[lockCount]; else elsoStats += STAT_RESET_COST_ELSO[lockCount];
  matHammer += STAT_RESET_COST_HAMMER[lockCount];
  cntStats++;
  stats = stats.map(s => s.locked ? s : { ...drawStat(), locked: false });
  addLog(`능력치 재설정 완료 (잠금: ${lockCount}개)`, 'info');
  updateUI();
}

function toggleLock(index: number) {
  if (index >= stats.length || isAutoRunning) return;
  if (!stats[index].locked && stats.filter(s => s.locked).length >= 9) {
    addLog('최대 9개까지만 잠글 수 있습니다.', 'error');
    return;
  }
  stats[index].locked = !stats[index].locked;
  updateUI();
}

function selectExtraSlot(index: number) {
  if (!extraOptions[index].open || isAutoRunning) return;
  extraOptions.forEach((opt, i) => opt.selected = (i === index));
  updateUI();
}

function resetExtraOptions(isAuto = false) {
  if (isAutoRunning && !isAuto) return;
  const type = (document.querySelector('input[name="item-type"]:checked') as HTMLInputElement).value;
  if (extraOptions.filter(o => o.open).length === 0) return;
  if (type === 'all') {
    if (activeCurrency === 'seed') seedExtra += EXTRA_RESET_ALL_SEED; else elsoExtra += EXTRA_RESET_ALL_ELSO;
    matBookAll++;
    const usedGroups: string[] = [];
    extraOptions = extraOptions.map(opt => {
      if (!opt.open) return opt;
      const drawn = drawExtraOption(usedGroups);
      usedGroups.push(drawn.group);
      return { ...drawn, open: true, selected: opt.selected };
    });
  } else {
    const targetIdx = extraOptions.findIndex(o => o.selected && o.open);
    if (targetIdx === -1) {
      if (!isAuto) addLog('재설정할 옵션 슬롯을 선택해주세요.', 'error');
      return;
    }
    if (activeCurrency === 'seed') seedExtra += EXTRA_RESET_SINGLE_SEED; else elsoExtra += EXTRA_RESET_SINGLE_ELSO;
    matBookSingle++;
    const usedGroups = extraOptions.filter((o, i) => o.open && i !== targetIdx).map(o => o.group);
    const drawn = drawExtraOption(usedGroups);
    extraOptions[targetIdx] = { ...drawn, open: true, selected: true };
  }
  cntExtra++; 
  if (!isAuto) addLog(`추가 옵션 재설정 완료 (${type === 'all' ? '전체' : '지정'})`, 'info');
  updateUI();
}

function resetSimulator(full = true) {
  if (isAutoRunning) return;
  currentRank = 0; stats = [];
  extraOptions = extraOptions.map(o => ({ ...o, name: '미개방', value: 0, open: false, selected: false, group: '', unit: '', grade: '하' }));
  if (full) {
    seedAmplify = 0; elsoAmplify = 0;
    seedStats = 0; elsoStats = 0;
    seedExtra = 0; elsoExtra = 0;
    matPowder = 0; matSoul = 0; matHammer = 0; matBookAll = 0; matBookSingle = 0;
    cntAmplify = 0; cntStats = 0; cntExtra = 0;
    lastLogMessage = null; lastLogType = null; consecutiveCount = 1;
    const history = document.getElementById('history-log');
    if (history) history.innerHTML = '<div class="text-xs text-slate-600 italic text-center mt-20">내역이 없습니다.</div>';
  }
  updateUI();
}

function updateUI() {
  try {
    const rankEl = document.getElementById('current-rank');
    if (rankEl) rankEl.innerText = currentRank.toString();
    
    const nextChance = currentRank >= 10 ? 0 : (AMPLIFY_PROBABILITIES[currentRank] || 0);
    const rateEl = document.getElementById('success-rate');
    if (rateEl) rateEl.innerText = currentRank >= 10 ? 'MAX' : `${(nextChance * 100).toFixed(1)}%`;
    
    const statCntEl = document.getElementById('stat-count');
    if (statCntEl) statCntEl.innerText = `${stats.length} / 10`;
    
    const extraCntEl = document.getElementById('extra-count');
    if (extraCntEl) extraCntEl.innerText = `${extraOptions.filter(o => o.open).length} / 3`;

    const statContainer = document.getElementById('stat-slots');
    if (statContainer) {
      statContainer.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const s = stats[i];
        const div = document.createElement('div');
        div.className = `stat-row min-h-[34px] py-1 px-2.5 rounded-xl flex items-center justify-between transition-all ${i >= currentRank ? 'opacity-20 grayscale' : 'cursor-pointer hover:bg-white/5'} ${s?.locked ? 'locked-stat' : ''}`;
        if (i < currentRank && s) {
          div.onclick = () => toggleLock(i);
          const colorClass = s.grade === '상' ? 'text-orange-400' : s.grade === '중' ? 'text-purple-400' : 'text-slate-200';
          div.innerHTML = `<div class="flex items-center gap-2.5"><span class="text-[9px] text-slate-500 font-black uppercase w-[32px]">슬롯 ${i+1}</span><span class="text-xs font-bold ${colorClass}">${s.name} +${s.value}</span></div><div class="p-1.5 hover:bg-white/10 rounded-lg transition-all flex items-center justify-center"><i data-lucide="${s.locked ? 'lock' : 'unlock'}" class="w-4 h-4 ${s.locked ? 'text-amber-500' : 'text-slate-600'}"></i></div>`;
        } else {
          div.innerHTML = `<span class="text-[10px] text-slate-700 italic font-medium ml-1">미개방</span>`;
        }
        statContainer.appendChild(div);
      }
    }

    const extraContainer = document.getElementById('extra-slots');
    if (extraContainer) {
      extraContainer.innerHTML = '';
      extraOptions.forEach((opt, i) => {
        const div = document.createElement('div');
        div.className = `extra-row min-h-[38px] py-1 px-3 rounded-xl border flex items-center justify-between ${opt.open ? 'cursor-pointer hover:border-purple-500/50' : 'opacity-30 grayscale'} ${opt.selected ? 'selected border-purple-500 bg-purple-500/10' : 'border-white/5 bg-black/20'}`;
        if (opt.open) div.onclick = () => selectExtraSlot(i);
        const colorClass = opt.grade === '상' ? 'text-orange-400' : opt.grade === '중' ? 'text-purple-400' : 'text-slate-100';
        div.innerHTML = `<div class="flex items-center gap-3"><div class="w-6 h-6 rounded-lg bg-black/60 flex items-center justify-center border border-white/10 shrink-0"><span class="text-[10px] font-black text-slate-400">${[3, 7, 10][i]}</span></div><div class="flex items-center gap-2 overflow-hidden"><span class="text-[11px] font-bold ${opt.open ? colorClass : 'text-slate-600'} shrink-0">${opt.open && !opt.group ? '빈 슬롯' : opt.name}</span>${opt.open && opt.group ? `<span class="text-[11px] font-black ${colorClass} truncate">+${opt.value}${opt.unit}</span>` : `<span class="text-[9px] text-slate-500 font-medium">${opt.open ? '옵션을 재설정하세요' : '미개방'}</span>`}</div></div>${opt.open ? (opt.selected ? '<i data-lucide="check-circle" class="w-4 h-4 text-purple-400 shrink-0"></i>' : '<i data-lucide="circle" class="w-4 h-4 text-slate-800 shrink-0"></i>') : '<i data-lucide="lock" class="w-4 h-4 text-slate-800 shrink-0"></i>'}`;
        extraContainer.appendChild(div);
      });
    }

    let costHtml = '';
    if (currentTab === 'amplify') {
      if (currentRank >= 10) {
        costHtml = `<div class="bg-purple-500/10 p-2.5 rounded-xl border border-purple-500/20 flex flex-col items-center justify-center h-full"><span class="text-xs font-black text-purple-400">최고 단계 달성</span></div>`;
      } else {
        const cost = activeCurrency === 'seed' ? AM_COST_SEED[currentRank] : AM_COST_ELSO[currentRank];
        costHtml = `<div class="grid grid-cols-2 gap-3"><div class="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col"><span class="text-[10px] text-slate-500 uppercase font-bold">소모 재화</span><span class="text-xs font-black ${activeCurrency === 'seed' ? 'text-emerald-400' : 'text-amber-400'}">${formatKoreanNumber(cost, true, activeCurrency === 'elso')} ${activeCurrency.toUpperCase()}</span></div><div class="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col"><span class="text-[10px] text-slate-500 uppercase font-bold">필요 재료</span><span class="text-xs font-bold text-slate-200">가루 ${AM_COST_POWDER[currentRank]}개, 혼 ${AM_COST_SOUL[currentRank]}개</span></div></div>`;
      }
    } else if (currentTab === 'stats') {
      const lockCount = stats.filter(s => s.locked).length;
      const cost = activeCurrency === 'seed' ? STAT_RESET_COST_SEED[lockCount] : STAT_RESET_COST_ELSO[lockCount];
      costHtml = `<div class="grid grid-cols-2 gap-3"><div class="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col"><span class="text-[10px] text-slate-500 uppercase font-bold">소모 재화</span><span class="text-xs font-black ${activeCurrency === 'seed' ? 'text-emerald-400' : 'text-amber-400'}">${formatKoreanNumber(cost, true, activeCurrency === 'elso')} ${activeCurrency.toUpperCase()}</span></div><div class="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col"><span class="text-[10px] text-slate-500 uppercase font-bold">필요 재료</span><span class="text-xs font-bold text-slate-200">에이라 망치 ${STAT_RESET_COST_HAMMER[lockCount]}개</span></div></div>`;
    } else if (currentTab === 'extra') {
      const type = (document.querySelector('input[name="item-type"]:checked') as HTMLInputElement).value;
      const cost = activeCurrency === 'seed' ? (type === 'all' ? EXTRA_RESET_ALL_SEED : EXTRA_RESET_SINGLE_SEED) : (type === 'all' ? EXTRA_RESET_ALL_ELSO : EXTRA_RESET_SINGLE_ELSO);
      costHtml = `<div class="grid grid-cols-2 gap-3"><div class="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col"><span class="text-[10px] text-slate-500 uppercase font-bold">소모 재화</span><span class="text-xs font-black ${activeCurrency === 'seed' ? 'text-emerald-400' : 'text-amber-400'}">${formatKoreanNumber(cost, true, activeCurrency === 'elso')} ${activeCurrency.toUpperCase()}</span></div><div class="bg-black/40 p-2.5 rounded-xl border border-white/5 flex flex-col"><span class="text-[10px] text-slate-500 uppercase font-bold">필요 재료</span><span class="text-xs font-bold text-slate-200">${type === 'all' ? '환류의 서' : '정환의 서'} 1개</span></div></div>`;
    }
    const costArea = document.getElementById('current-action-cost');
    if (costArea) costArea.innerHTML = costHtml;

    // 누적 재화 표시 보완
    const wealthContainer = document.getElementById('total-wealth-container');
    if (wealthContainer) {
      wealthContainer.innerHTML = `
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-2 p-3 bg-black/40 rounded-xl border border-white/5">
            <div class="flex items-center justify-between border-b border-white/5 pb-2">
              <span class="text-xs text-slate-500 font-black uppercase w-16">증폭</span>
              <span class="text-xs font-black text-emerald-400 text-right flex-1">${formatKoreanNumber(seedAmplify)}</span>
              <span class="text-xs font-black text-amber-400 text-right flex-1">${formatKoreanNumber(elsoAmplify, true, true)}</span>
            </div>
            <div class="flex items-center justify-between border-b border-white/5 pb-2">
              <span class="text-xs text-slate-500 font-black uppercase w-16">능력치</span>
              <span class="text-xs font-black text-emerald-400 text-right flex-1">${formatKoreanNumber(seedStats)}</span>
              <span class="text-xs font-black text-amber-400 text-right flex-1">${formatKoreanNumber(elsoStats, true, true)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-500 font-black uppercase w-16">추옵</span>
              <span class="text-xs font-black text-emerald-400 text-right flex-1">${formatKoreanNumber(seedExtra)}</span>
              <span class="text-xs font-black text-amber-400 text-right flex-1">${formatKoreanNumber(elsoExtra, true, true)}</span>
            </div>
          </div>
          <div class="flex flex-col gap-2 p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
            <div class="flex items-center justify-between">
              <span class="text-xs text-purple-400/80 font-black uppercase w-28">총합 소비 SEED</span>
              <span class="text-sm font-black text-emerald-400 text-right">${formatKoreanNumber(seedAmplify + seedStats + seedExtra)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-purple-400/80 font-black uppercase w-28">총합 소비 ELSO</span>
              <span class="text-sm font-black text-amber-400 text-right">${formatKoreanNumber(elsoAmplify + elsoStats + elsoExtra, true, true)}</span>
            </div>
          </div>
        </div>
      `;
    }

    const lockCountDisplay = document.getElementById('lock-count-display');
    if (lockCountDisplay) {
      const lockCount = stats.filter(s => s.locked).length;
      lockCountDisplay.innerText = `${lockCount} / 9`;
    }

    if (!isAutoRunning) {
      const maxed = currentRank >= 10;
      const btnAmp = document.getElementById('btn-amplify') as HTMLButtonElement;
      const btnAuto = document.getElementById('btn-auto-amplify') as HTMLButtonElement;
      const selectTarget = document.getElementById('target-rank') as HTMLSelectElement;
      
      if (btnAmp) btnAmp.disabled = maxed;
      if (btnAuto) btnAuto.disabled = maxed;
      if (selectTarget) selectTarget.disabled = maxed;
    }

    const powderEl = document.getElementById('mat-powder');
    if (powderEl) powderEl.innerText = matPowder.toLocaleString();
    const soulEl = document.getElementById('mat-soul');
    if (soulEl) soulEl.innerText = matSoul.toLocaleString();
    const hammerEl = document.getElementById('mat-hammer');
    if (hammerEl) hammerEl.innerText = matHammer.toLocaleString();
    const allEl = document.getElementById('mat-all');
    if (allEl) allEl.innerText = matBookAll.toLocaleString();
    const singleEl = document.getElementById('mat-single');
    if (singleEl) singleEl.innerText = matBookSingle.toLocaleString();
    const ampEl = document.getElementById('cnt-amplify');
    if (ampEl) ampEl.innerText = cntAmplify.toLocaleString();
    const statEl = document.getElementById('cnt-stats');
    if (statEl) statEl.innerText = cntStats.toLocaleString();
    const extraEl = document.getElementById('cnt-extra');
    if (extraEl) extraEl.innerText = cntExtra.toLocaleString();

    updateExpectation();

    if ((window as any).lucide && !isAutoRunning) (window as any).lucide.createIcons();
  } catch (err) {
    console.error('UpdateUI Error:', err);
  }
}

function updateExpectation() {
  const container = document.getElementById('expectation-view');
  if (!container) return;
  
  const selectTarget = document.getElementById('target-rank') as HTMLSelectElement;
  const targetRank = selectTarget ? parseInt(selectTarget.value) : 10;
  
  if (currentRank >= targetRank) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-4 gap-2">
        <i data-lucide="party-popper" class="w-6 h-6 text-purple-400"></i>
        <span class="text-xs font-black text-purple-200">목표 단계 도달 완료</span>
      </div>
    `;
    if ((window as any).lucide && !isAutoRunning) (window as any).lucide.createIcons();
    return;
  }
  
  // 목표 단계 도달까지 남은 기댓값 계산
  let expectedSeed = 0;
  let expectedElso = 0;
  let expectedPowder = 0;
  let expectedSoul = 0;
  let expectedAttempts = 0;
  
  for (let i = currentRank; i < targetRank; i++) {
    const prob = AMPLIFY_PROBABILITIES[i];
    const attempts = 1 / prob;
    expectedAttempts += attempts;
    expectedSeed += AM_COST_SEED[i] * attempts;
    expectedElso += AM_COST_ELSO[i] * attempts;
    expectedPowder += AM_COST_POWDER[i] * attempts;
    expectedSoul += AM_COST_SOUL[i] * attempts;
  }

  container.innerHTML = `
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-slate-500 font-bold uppercase">${targetRank}단계 도달 예상 비용</span>
      </div>
      <div class="bg-black/30 p-3 rounded-2xl border border-white/5 flex flex-col gap-2">
        <div class="flex items-center justify-between border-b border-white/5 pb-2 mb-1">
          <span class="text-[10px] text-purple-400 font-black">예상 시도 횟수</span>
          <span class="text-xs font-black text-purple-300">${Math.round(expectedAttempts).toLocaleString()}회</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-slate-400">예상 SEED</span>
          <span class="text-xs font-black text-emerald-400">${formatKoreanNumber(Math.floor(expectedSeed))}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-slate-400">예상 ELSO</span>
          <span class="text-xs font-black text-amber-400">${formatKoreanNumber(Math.floor(expectedElso), true, true)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-slate-400">예상 가루</span>
          <span class="text-xs font-black text-slate-200">${Math.floor(expectedPowder).toLocaleString()}개</span>
        </div>
        ${expectedSoul > 0 ? `
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-slate-400">예상 혼</span>
          <span class="text-xs font-black text-slate-200">${Math.floor(expectedSoul).toLocaleString()}개</span>
        </div>` : ''}
      </div>
      <p class="text-[9px] text-slate-600 italic">* 수학적 확률에 기반한 평균 수치입니다.</p>
    </div>
  `;
}

function addLog(message: string, type: 'success' | 'fail' | 'info' | 'error') {
  const logContainer = document.getElementById('history-log');
  if (!logContainer) return;
  const italicEl = logContainer.querySelector('.italic'); if (italicEl) italicEl.remove();

  if (lastLogMessage === message && lastLogType === type) {
    consecutiveCount++;
    const firstChild = logContainer.firstElementChild;
    if (firstChild) {
      let badge = firstChild.querySelector('.log-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'log-badge ml-2 px-1.5 py-0.5 rounded text-[9px] font-black bg-white/10 text-white shrink-0';
        const msgContainer = firstChild.querySelector('.font-medium.flex');
        if (msgContainer) {
          msgContainer.appendChild(badge);
        } else {
          // Fallback if structure changes
          firstChild.appendChild(badge);
        }
      }
      badge.textContent = `x${consecutiveCount}`;
    }
    return;
  }

  consecutiveCount = 1;
  lastLogMessage = message;
  lastLogType = type;

  const div = document.createElement('div');
  const color = type === 'success' ? 'text-emerald-400' : type === 'fail' ? 'text-red-400/80' : type === 'error' ? 'text-amber-500' : 'text-slate-400';
  div.className = `text-xs py-2 border-b border-white/5 last:border-0 ${color} flex gap-2.5`;
  div.innerHTML = `
    <span class="text-[10px] text-slate-700 font-mono shrink-0 mt-0.5">${new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
    <div class="flex-1 break-keep">
      <span class="font-medium leading-relaxed">${message}</span>
    </div>
  `;
  logContainer.prepend(div);
  if (logContainer.children.length > 200) logContainer.lastElementChild?.remove();
  if ((window as any).lucide && !isAutoRunning) (window as any).lucide.createIcons();
}

(window as any).switchTab = switchTab; (window as any).setEquipType = setEquipType; (window as any).setCurrency = setCurrency;
(window as any).amplifyStep = amplifyStep; (window as any).autoAmplify = autoAmplify; (window as any).resetStats = resetStats;
(window as any).toggleLock = toggleLock; (window as any).selectExtraSlot = selectExtraSlot; (window as any).resetExtraOptions = resetExtraOptions;
(window as any).resetSimulator = resetSimulator; (window as any).updateUI = updateUI; (window as any).autoResetStats = autoResetStats;
(window as any).autoResetExtraOptions = autoResetExtraOptions;
window.onload = () => {
  updateAutoStatPool();
  updateAutoExtraPool();
  updateUI();
};
