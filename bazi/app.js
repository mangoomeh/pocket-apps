import {
  STEMS, STEM_PINYIN, BRANCHES, BRANCH_PINYIN, ANIMALS, ANIMALS_ZH, ELEMENTS, INTERACTION_NAMES, TEN_GODS, LIFE_STAGES, LIFE_STAGES_EN,
  NAYIN, NAYIN_EN, HIDDEN_STEMS, BRANCH_ELEMENT, stemElement, isYang, computeChart, annualPillar, parseBirth,
  analyseStrength, pillarFavour, tenGod, branchPair, cycleIndex, pillarOf, pillarName,
  dayPillar, monthPillarsOf, symbolicStars,
} from '../src/bazi.js';
import { lunarToSolar, solarToLunar, lunarYearMonths, lunarMonthName, lunarDayName } from '../src/lunar.js';
import { compareCharts } from '../src/bazimatch.js';
import { CITIES, CITY_ZH, cityOf, placeFor } from '../src/places.js';
import {
  buildReading, buildSummary, GOD_DETAILS, GOD_DETAILS_ZH, PILLAR_AREAS, PILLAR_AREAS_ZH, FAVOUR_TEXT, FAVOUR_TEXT_ZH,
  DM_PROFILES_ZH, DM_KEYWORDS_ZH, FAMILIES,
} from '../src/baziread.js';

const STORAGE_KEY = 'bazi-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const DM_NOTES = [
  'a tall tree: upright, growing, principled',
  'flowers and vines: flexible, adaptable, persistent',
  'the sun: warm, open, generous',
  'a candle flame: thoughtful, gentle, illuminating',
  'a mountain: steady, reliable, protective',
  'fertile soil: nurturing, accommodating, practical',
  'an axe or raw ore: decisive, direct, tough',
  'jewellery: refined, precise, sensitive',
  'the ocean: bold, resourceful, restless',
  'rain and mist: intuitive, quiet, perceptive',
];
const PILLAR_LABELS = {
  zh: { hour: '时柱', day: '日柱', month: '月柱', year: '年柱' },
  en: { hour: 'Hour', day: 'Day', month: 'Month', year: 'Year' },
};
const lang = () => (state.lang === 'zh' ? 'zh' : 'en');
const t = (en, zh) => (lang() === 'zh' ? zh : en);
const tl = () => (lang() === 'zh' ? 'zh' : 'en');
const cityName = (n) => (lang() === 'zh' ? CITY_ZH[n] || n : n);
// Everyday names for the ten gods, for people new to BaZi; the traditional names appear when tapped.
const GOD_EN_SHORT = ['Peer', 'Rival', 'Enjoyment', 'Expression', 'Windfall', 'Income', 'Pressure', 'Authority', 'Intuition', 'Support'];
const EL_EMOJI = ['🌳', '🔥', '⛰️', '⚙️', '💧'];
const elWord = (e) => `${EL_EMOJI[e]} ${t(ELEMENTS[e].en, ELEMENTS[e].zh)}`;

// ---- State ---------------------------------------------------------------------------------------

function load() {
  const defaults = { form: { name: '', cal: 'western', date: '', time: '', noTime: false, gender: '', tz: 'fixed:8', trueSolar: false, city: 'Singapore', lon: 103.82, ziDay: true }, saved: [], lang: /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.form) return { ...defaults, ...saved, lang: saved.lang === 'zh' ? 'zh' : 'en', form: { ...defaults.form, ...saved.form } };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return defaults;
}
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };
let chart = null;
let selectedLuck = null;

// ---- Form ----------------------------------------------------------------------------------------

function fillSelects() {
  fillTimeZones();
  fillCities();
}

function fillTimeZones() {
  const tzSel = $('tz');
  const fixed = document.createElement('optgroup');
  fixed.label = t('Fixed offset', '固定时差');
  for (let h = -12; h <= 14; h += 0.25) {
    if (h % 1 && ![5.5, 5.75, 9.5, -3.5, 3.5, 4.5, 6.5, 7.5, 8.75, 10.5].includes(h)) continue;
    fixed.append(new Option(`${fmtOffset(h)} ${t('(fixed)', '（固定）')}`, `fixed:${h}`));
  }
  tzSel.append(fixed);
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  if (zones.length) {
    const group = document.createElement('optgroup');
    group.label = t('Region (handles daylight saving)', '地区（自动计算夏令时）');
    for (const z of zones) group.append(new Option(z.replace(/_/g, ' '), z));
    tzSel.append(group);
  }
}

function fillCities() {
  const keep = $('city').value;
  $('city').innerHTML = '';
  for (const [name] of CITIES) $('city').add(new Option(cityName(name), name));
  $('city').add(new Option(t('Other (set time zone)', '其他（自行设定时区）'), ''));
  $('city').value = keep;
}

function writeForm(f) {
  $('name').value = f.name;
  document.querySelector(`input[name="cal"][value="${f.cal || 'western'}"]`).checked = true;
  $('date').value = f.date;
  syncLunarFromDate();
  showCalendar();
  $('time').value = f.time;
  $('no-time').checked = f.noTime;
  $('time').disabled = f.noTime;
  document.querySelectorAll('input[name="gender"]').forEach((el) => { el.checked = el.value === f.gender; });
  $('tz').value = typeof f.tz === 'number' ? `fixed:${f.tz}` : f.tz;
  $('true-solar').checked = f.trueSolar;
  $('city').value = cityOf(f.city) ? f.city : '';
  $('other-fields').hidden = $('city').value !== '';
  $('lon').value = f.lon;
  $('zi-day').checked = f.ziDay;
}

function readForm() {
  return {
    name: $('name').value.trim(),
    cal: document.querySelector('input[name="cal"]:checked').value,
    date: $('date').value,
    time: $('time').value,
    noTime: $('no-time').checked,
    gender: document.querySelector('input[name="gender"]:checked')?.value || '',
    tz: $('tz').value,
    trueSolar: $('true-solar').checked,
    city: $('city').value,
    lon: $('lon').value === '' ? null : Number($('lon').value),
    ziDay: $('zi-day').checked,
  };
}

const fmtOffset = (h) => `UTC${h < 0 ? '−' : '+'}${Math.floor(Math.abs(h))}${Math.abs(h) % 1 ? `:${String(Math.round((Math.abs(h) % 1) * 60)).padStart(2, '0')}` : ''}`;

function chartFrom(f) {
  if (!f.date) return { error: null };
  const birth = parseBirth(f.date, f.noTime ? '' : f.time);
  if (!birth) return { error: t('That date isn’t valid. Enter a date between 1800 and 2200.', '日期无效，请输入1800至2200年之间的日期。') };
  if (!f.noTime && !f.time) return { error: t('Enter the birth time, or tick “I don’t know the birth time”.', '请输入出生时间，或勾选“不知道出生时间”。') };
  if (!f.gender) return { error: t('Choose Male or Female: it sets the direction of the luck pillars.', '请选择男或女：它决定大运的顺逆。') };
  const place = placeFor(f, birth);
  return {
    place,
    chart: computeChart({
      ...birth, tzOffset: place.tz, gender: f.gender, ziStartsDay: f.ziDay,
      trueSolar: f.trueSolar && Number.isFinite(place.lon), longitude: place.lon,
    }),
  };
}

// ---- Rendering -----------------------------------------------------------------------------------

const elClass = (e) => `el-${ELEMENTS[e].id}`;
const branchElement = (b) => BRANCH_ELEMENT[b];
const godShort = (g) => (lang() === 'en' ? GOD_EN_SHORT[g] : TEN_GODS[g].zh);
const pad = (n) => String(n).padStart(2, '0');
const fmtLocal = (ms, tz) => {
  const d = new Date(ms + tz * 3600000);
  if (lang() === 'zh') return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const ageText = (years) => {
  const y = Math.floor(years + 1e-9);
  const m = Math.round((years - y) * 12);
  if (lang() === 'zh') return m ? `${y}岁${m}个月` : `${y}岁`;
  return m ? `${y} y ${m} m` : `${y} y`;
};

// ---- Lunar calendar input -----------------------------------------------------------------------

function fillLunarMonths(year, keep) {
  const months = year >= 1901 && year <= 2099 ? lunarYearMonths(year) : [];
  $('l-month').innerHTML = months.map((m) => `<option value="${m.leap ? 'L' : ''}${m.month}" data-days="${m.days}">${lunarMonthName(m.month, m.leap)}</option>`).join('');
  if (keep && [...$('l-month').options].some((o) => o.value === keep)) $('l-month').value = keep;
  fillLunarDays();
}

function fillLunarDays() {
  const opt = $('l-month').selectedOptions[0];
  const days = opt ? Number(opt.dataset.days) : 30;
  const keep = $('l-day').value;
  $('l-day').innerHTML = Array.from({ length: days }, (_, i) => `<option value="${i + 1}">${lunarDayName(i + 1)}</option>`).join('');
  if (keep && Number(keep) <= days) $('l-day').value = keep;
}

function syncLunarFromDate() {
  const b = parseBirth($('date').value, '');
  if (!b || b.year < 1901 || b.year > 2099) return;
  const l = solarToLunar(b.year, b.month, b.day);
  $('l-year').value = l.year;
  fillLunarMonths(l.year, `${l.leap ? 'L' : ''}${l.month}`);
  $('l-day').value = String(l.day);
}

function syncDateFromLunar() {
  const y = Number($('l-year').value);
  const mv = $('l-month').value;
  if (!y || !mv) return;
  const d = lunarToSolar(y, Number(mv.replace('L', '')), Number($('l-day').value), mv.startsWith('L'));
  if (d) $('date').value = `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

function showCalendar() {
  const lunar = document.querySelector('input[name="cal"]:checked').value === 'lunar';
  $('lunar-fields').hidden = !lunar;
  $('date-field').querySelector('span').textContent = lunar ? t('Western date', '公历日期') : t('Date of birth', '出生日期');
  $('date').disabled = lunar;
}

const lunarText = (l) => (lang() === 'en'
  ? `Lunar date: day ${l.day} of the ${l.leap ? 'leap ' : ''}${l.month}${['st', 'nd', 'rd'][l.month - 1] || 'th'} month, ${l.year}`
  : `农历 ${l.year}年 ${lunarMonthName(l.month, l.leap)}${lunarDayName(l.day)}`);

function renderLunarLine() {
  const b = parseBirth($('date').value, '');
  const lunar = document.querySelector('input[name="cal"]:checked').value === 'lunar';
  if (!b || b.year < 1901 || b.year > 2099) {
    $('lunar-line').textContent = lunar ? t('Lunar dates work for 1901–2099.', '农历适用于1901–2099年。') : '';
    return;
  }
  const l = solarToLunar(b.year, b.month, b.day);
  $('lunar-line').textContent = lunarText(l);
}

// ---- Form folding: once a chart exists, the form becomes one line with an Edit button -----------

function setFormOpen(open) {
  $('form-card').hidden = !open;
  $('form-compact').hidden = open;
}

function renderFormLine(f) {
  const b = parseBirth(f.date, '');
  if (!b) return;
  const date = new Date(Date.UTC(b.year, b.month - 1, b.day)).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const parts = [f.name, date, f.noTime ? t('time unknown', '时辰未知') : f.time, cityOf(f.city) ? cityName(f.city) : '', f.gender === 'female' ? t('Female', '女') : t('Male', '男')];
  $('form-line').textContent = parts.filter(Boolean).join(' · ');
}

function render() {
  const f = readForm();
  state.form = f;
  persist();
  if ($('match-a').options.length) renderMatchOptions();
  const { chart: c, error, place } = chartFrom(f);
  renderTzLine(place);
  renderLunarLine();
  renderFormLine(f);
  $('show-chart').disabled = !c;
  chart = c || null;
  $('error').hidden = !error;
  $('error').textContent = error || '';
  $('result').hidden = !chart;
  if (!chart) setFormOpen(true);
  if (!chart) {
    $('headline').textContent = t('Enter a birth date', '请输入出生日期');
    $('headline').classList.remove('cjk');
    $('subline').textContent = t('Year, month, day and hour pillars', '年柱、月柱、日柱、时柱');
    $('reading').innerHTML = `<div class="card"><p class="hint">${t('Enter a birth date on the Chart tab.', '请先在“命盘”页输入出生日期。')}</p></div>`;
    $('summary').innerHTML = $('reading').innerHTML;
    renderLuck();
    renderNow();
    return;
  }
  const names = chart.pillars.map((p) => (p.missing ? '··' : p.name));
  const dmz = chart.dayMaster;
  const dme = stemElement(dmz);
  $('headline').textContent = t(`${EL_EMOJI[dme]} ${isYang(dmz) ? 'Yang' : 'Yin'} ${ELEMENTS[dme].en}: ${DM_NOTES[dmz].split(':')[0]}`,
    `${EL_EMOJI[dme]} ${isYang(dmz) ? '阳' : '阴'}${ELEMENTS[dme].zh}：${DM_PROFILES_ZH[dmz].image}`);
  $('headline').classList.remove('cjk');
  $('subline').textContent = `${f.name ? `${f.name} · ` : ''}${t(`Year of the ${chart.animal}`, `属${ANIMALS_ZH[chart.pillars[3].branch]}`)} · ${names.join(' ')}`;
  renderLegends();
  renderPillars();
  $('explain').textContent = t('Tap any label or value to see what it means.', '点任何标签或数值查看解释。');
  renderDayMaster();
  renderElements();
  renderInteractions();
  renderStars();
  renderHours();
  renderDetails(f);
  renderReading();
  renderSummary(f);
  selectedLuck = null;
  renderLuck();
  renderNow();
}

const ROWS = [
  ['god', '十神', 'Relation to you', 'How each stem relates to you, the day master (日主). It depends on whether the stem is your own element, the one you produce (Output), the one you control (Wealth), the one that controls you (Officer) or the one that produces you (Resource). Same or opposite yin/yang picks which of each pair.'],
  ['stem', '天干', 'Top (stem)', 'The heavenly stem: the visible, outward side of the pillar. Its colour shows its element.'],
  ['branch', '地支', 'Bottom (branch)', 'The earthly branch: the root of the pillar, with its animal. Its colour shows its main element.'],
  ['hidden', '藏干', 'Hidden inside', 'Hidden stems: the stems stored inside each branch, main one first, each with its ten god. The ten god shown for a branch comes from its main hidden stem.'],
  ['nayin', '纳音', 'Poetic element', 'A poetic element given to each of the 60 stem–branch pairs, such as 海中金 “Gold in the Sea”. It is a secondary reading, mostly used for the year pillar.'],
  ['stage', '长生', 'Your strength', 'The twelve life stages (十二长生): how strong your day master is in each branch, on a cycle from Birth through Peak to Tomb and round again. A stage like 死 (Death) only means the day master is weak in that branch. It is not a prediction.'],
];
const GOD_NOTES = [
  'same element and yin/yang as you: peers, siblings, independence.',
  'same element, opposite yin/yang: competitors, boldness, spending.',
  'the element you produce, same yin/yang: creativity, enjoyment, easy-going expression.',
  'the element you produce, opposite yin/yang: talent, outspokenness, breaking rules.',
  'the element you control, same yin/yang: windfalls, business, opportunities.',
  'the element you control, opposite yin/yang: steady income, hard-earned money, thrift.',
  'the element that controls you, same yin/yang: pressure, ambition, courage.',
  'the element that controls you, opposite yin/yang: authority, discipline, reputation.',
  'the element that produces you, same yin/yang: unconventional learning, intuition.',
  'the element that produces you, opposite yin/yang: support, care, study.',
];
const ROWS_ZH = {
  god: '每个天干与日主（你）的关系。看它是与你同类（比劫）、你所生（食伤）、你所克（财）、克你（官杀）还是生你（印），再按阴阳同异分为两种。',
  stem: '天干：一柱外显的一面，颜色代表五行。',
  branch: '地支：一柱的根，带有生肖，颜色代表本气的五行。',
  hidden: '藏干：地支里藏的天干，本气在前，各自标出十神。地支的十神按本气计算。',
  nayin: '纳音：六十甲子每两柱配一个带意象的五行，例如“海中金”。属于辅助参考，多用于年柱。',
  stage: '十二长生：日主在各地支的强弱，从长生经帝旺到墓、绝，再循环。“死”只表示日主在这个地支力量弱，不是预言。',
};
const GOD_NOTES_ZH = [
  '与你五行相同、阴阳相同：同辈、兄弟、独立。', '与你五行相同、阴阳不同：竞争、胆量、花费。',
  '你所生、阴阳相同：创意、享受、随性表达。', '你所生、阴阳不同：才华、直言、打破规矩。',
  '你所克、阴阳相同：意外之财、生意、机会。', '你所克、阴阳不同：稳定收入、辛苦钱、节俭。',
  '克你、阴阳相同：压力、野心、勇气。', '克你、阴阳不同：权威、纪律、名声。',
  '生你、阴阳相同：非传统的学习、直觉。', '生你、阴阳不同：支持、照顾、学业。',
];
const STAGE_STRENGTH_ZH = ['强', '不稳', '渐长', '强', '最强', '渐弱', '弱', '弱', '收藏', '最弱', '重新开始', '蓄力'];
const STAGE_STRENGTH = ['strong', 'unsettled', 'growing', 'strong', 'strongest', 'weakening', 'weak', 'weak',
  'stored away', 'weakest', 'beginning again', 'gathering strength'];

function explain(code) {
  const [kind, a, b] = code.split(':');
  const n = Number(a);
  const dm = chart.dayMaster;
  const dmName = `${STEMS[dm]} (${isYang(dm) ? 'Yang' : 'Yin'} ${ELEMENTS[stemElement(dm)].en})`;
  if (lang() === 'zh') {
    const dmZh = `${STEMS[dm]}（${isYang(dm) ? '阳' : '阴'}${ELEMENTS[stemElement(dm)].zh}）`;
    switch (kind) {
      case 'row': { const r = ROWS.find((x) => x[0] === a); return `<strong>${r[1]}</strong>：${ROWS_ZH[a]}`; }
      case 'dm': return `<strong>日主</strong>：日干${dmZh}代表你，所有十神都对照它来算。`;
      case 'god': {
        const d = GOD_DETAILS_ZH[n];
        const where = b ? `这里位于你的${PILLAR_AREAS_ZH[b].label}，代表${PILLAR_AREAS_ZH[b].area}。` : '';
        return `<strong>${TEN_GODS[n].zh}</strong>：${GOD_NOTES_ZH[n]}<br>好的一面：${d.plus}。留意：${d.minus}。人生方面：${d.area}。${where}`;
      }
      case 'stem': return `<strong>${STEMS[n]}</strong>：${isYang(n) ? '阳' : '阴'}${ELEMENTS[stemElement(n)].zh}。`;
      case 'branch': return `<strong>${BRANCHES[n]}</strong>：属${ANIMALS_ZH[n]}，${ELEMENTS[branchElement(n)].zh}。藏干：${HIDDEN_STEMS[n].map((h) => STEMS[h]).join(' ')}。`;
      case 'nayin': return `<strong>${NAYIN[n]}</strong>：这一柱的纳音五行。`;
      case 'stage': return `<strong>${LIFE_STAGES[n]}</strong>：十二长生的第${n + 1}个阶段。你的日主在这个地支${STAGE_STRENGTH_ZH[n]}。`;
      case 'hour': return '<strong>时柱未知</strong>：输入出生时间才能排出时柱。';
      default: return '';
    }
  }
  switch (kind) {
    case 'row': { const r = ROWS.find((x) => x[0] === a); return `<strong>${r[1]} ${r[2]}</strong>: ${r[3]}`; }
    case 'dm': return `<strong>日主 Day master</strong>: the day stem ${dmName} stands for you. Every ten god is worked out relative to it.`;
    case 'god': {
      const d = GOD_DETAILS[n];
      const where = b ? ` Here it sits in your ${PILLAR_AREAS[b].label.toLowerCase()}, which covers ${PILLAR_AREAS[b].area}.` : '';
      return `<strong>${TEN_GODS[n].zh} ${TEN_GODS[n].en}</strong> (“${GOD_EN_SHORT[n]}” here): ${GOD_NOTES[n]}<br>At its best: ${d.plus}. Watch for ${d.minus}. In life: ${d.area}.${where}`;
    }
    case 'stem': return `<strong>${STEMS[n]} ${STEM_PINYIN[n]}</strong>: ${isYang(n) ? 'Yang' : 'Yin'} ${ELEMENTS[stemElement(n)].en}.`;
    case 'branch': return `<strong>${BRANCHES[n]} ${BRANCH_PINYIN[n]}</strong>: the ${ANIMALS[n]}, ${ELEMENTS[branchElement(n)].en}. Hidden stems: ${HIDDEN_STEMS[n].map((h) => STEMS[h]).join(' ')}.`;
    case 'nayin': return `<strong>${NAYIN[n]}</strong>: “${NAYIN_EN[n]}”, the 纳音 element of this pillar.`;
    case 'stage': return `<strong>${LIFE_STAGES[n]} ${LIFE_STAGES_EN[n]}</strong>: stage ${n + 1} of 12. Your day master is ${STAGE_STRENGTH[n]} in this branch.`;
    case 'hour': return '<strong>Hour unknown</strong>: enter a birth time to get the hour pillar.';
    default: return '';
  }
}

function renderTzLine(place) {
  const line = $('tz-line');
  if (!place || (!place.city && !place.zone)) { line.textContent = ''; return; }
  let text = t(`Clock time there on that date: ${fmtOffset(place.tz)}`, `当天当地时间：${fmtOffset(place.tz)}`);
  if (place.dst) text += t(', daylight saving (already allowed for)', '，夏令时（已计入）');
  else if (place.changed) text += t(` (it's ${fmtOffset(place.today)} today)`, `（现在是 ${fmtOffset(place.today)}）`);
  line.textContent = `${text}${t('.', '。')}`;
}

function renderPillars() {
  $('chart-note').textContent = chart.input.timeKnown ? '' : t('· hour unknown', '· 时辰未知');
  const btn = (code, html, cls = '') => `<button type="button" class="pv ${cls}" data-x="${code}">${html}</button>`;
  const cells = { god: [], stem: [], branch: [], hidden: [], nayin: [], stage: [] };
  const L = lang();
  const heads = chart.pillars.map((p) => `<div class="pc ph${p.key === 'day' ? ' is-day' : ''}">${PILLAR_LABELS[L][p.key]}</div>`);
  const py = (t) => (L === 'en' ? `<small class="py">${t}</small>` : '');
  for (const p of chart.pillars) {
    const day = p.key === 'day' ? ' is-day' : '';
    if (p.missing) {
      for (const k of Object.keys(cells)) cells[k].push(`<div class="pc missing">${btn('hour:', k === 'stem' || k === 'branch' ? '?' : '–', k === 'stem' || k === 'branch' ? 'glyph' : '')}</div>`);
      continue;
    }
    const ni = Math.floor(p.index / 2);
    cells.god.push(`<div class="pc${day}">${p.key === 'day' ? btn('dm:', `<strong>${L === 'en' ? 'You' : '日主'}</strong>`) : btn(`god:${p.stemGod}:${p.key}`, godShort(p.stemGod))}</div>`);
    cells.stem.push(`<div class="pc${day}">${btn(`stem:${p.stem}`, STEMS[p.stem] + py(STEM_PINYIN[p.stem]), `glyph ${elClass(stemElement(p.stem))}`)}</div>`);
    cells.branch.push(`<div class="pc${day}">${btn(`branch:${p.branch}`, BRANCHES[p.branch] + py(BRANCH_PINYIN[p.branch]), `glyph ${elClass(branchElement(p.branch))}`)}</div>`);
    cells.hidden.push(`<div class="pc hid${day}">${p.hidden.map((h) => btn(`god:${h.god}:${p.key}`, `<span class="${elClass(stemElement(h.stem))}">${STEMS[h.stem]}</span><small>${godShort(h.god)}</small>`)).join('')}</div>`);
    cells.nayin.push(`<div class="pc sub${day}">${btn(`nayin:${ni}`, L === 'en' ? NAYIN_EN[ni] : NAYIN[ni])}</div>`);
    // In English, a plain strength word; the stage's traditional name shows when tapped.
    const strength = STAGE_STRENGTH[p.stage];
    cells.stage.push(`<div class="pc sub${day}">${btn(`stage:${p.stage}`, L === 'en' ? strength[0].toUpperCase() + strength.slice(1) : LIFE_STAGES[p.stage])}</div>`);
  }
  $('pillars').innerHTML = `<div class="pc"></div>${heads.join('')}`
    + ROWS.map(([k, zh, en]) => `<div class="pc rl">${btn(`row:${k}`, L === 'zh' ? zh : `${en}<small>${zh}</small>`)}</div>${cells[k].join('')}`).join('');
}

function renderDayMaster() {
  const dm = chart.dayMaster;
  const e = stemElement(dm);
  const produces = ELEMENTS[(e + 1) % 5].en; const controls = ELEMENTS[(e + 2) % 5].en;
  const controlledBy = ELEMENTS[(e + 3) % 5].en; const producedBy = ELEMENTS[(e + 4) % 5].en;
  if (lang() === 'zh') {
    const z = (k) => ELEMENTS[(e + k) % 5].zh;
    $('dm').innerHTML = `<span class="dm-glyph ${elClass(e)}">${STEMS[dm]}</span>
      <span><strong>${isYang(dm) ? '阳' : '阴'}${ELEMENTS[e].zh}</strong>：像${DM_PROFILES_ZH[dm].image}，${DM_KEYWORDS_ZH[dm].replace(/ · /g, '、')}。<br>
      <small>${EL_EMOJI[(e + 1) % 5]}${z(1)}是你创造的（食伤）· ${EL_EMOJI[(e + 2) % 5]}${z(2)}是你赚取的（财）· ${EL_EMOJI[(e + 3) % 5]}${z(3)}推动你（官杀）· ${EL_EMOJI[(e + 4) % 5]}${z(4)}支持你（印）</small></span>`;
    return;
  }
  $('dm').innerHTML = `<span class="dm-glyph ${elClass(e)}">${STEMS[dm]}</span>
    <span><strong>${isYang(dm) ? 'Yang' : 'Yin'} ${ELEMENTS[e].en}</strong> (${STEM_PINYIN[dm]}): ${DM_NOTES[dm]}.<br>
    <small>${EL_EMOJI[(e + 1) % 5]} ${produces} is what you create · ${EL_EMOJI[(e + 2) % 5]} ${controls} what you earn · ${EL_EMOJI[(e + 3) % 5]} ${controlledBy} what pushes you · ${EL_EMOJI[(e + 4) % 5]} ${producedBy} what supports you</small></span>`;
}

function renderElements() {
  const max = Math.max(...chart.weighted, 1);
  $('elements').innerHTML = ELEMENTS.map((el, i) => `<li>
      <span class="el-name ${elClass(i)}">${EL_EMOJI[i]} ${lang() === 'zh' ? el.zh : el.en}</span>
      <span class="bar"><span class="${elClass(i)}" style="width:${(chart.weighted[i] / max) * 100}%"></span></span>
      <span class="el-num"><strong>${chart.counts[i]}</strong> <small>${chart.weighted[i].toFixed(1)}</small></span>
    </li>`).join('');
}

const INTERACTION_PLAIN = {
  'stem-combo': ['These two pull together: an easy bond between those parts of life.', '两者相合：这两方面容易配合。'],
  'stem-clash': ['These two push against each other: tension that drives change.', '两者相冲：有张力，容易带来变化。'],
  combo: ['A close partnership between these pillars.', '这两柱关系紧密，容易互相帮忙。'],
  clash: ['Opposites: expect movement and change in these areas.', '相冲：这两方面常有变动。'],
  harm: ['A small, quiet friction between these areas.', '相害：小而暗的摩擦。'],
  punish: ['Friction that tends to repeat: worth handling patiently.', '相刑：容易反复的摩擦，宜耐心处理。'],
  'self-punish': ['A habit of being hard on yourself in this area.', '自刑：在这方面容易对自己太苛刻。'],
  trio: ['Three pillars team up and strengthen this element a lot.', '三合：三柱联手，大大加强这个五行。'],
  meeting: ['Three pillars gather and make this element very strong.', '三会：三柱汇聚，使这个五行非常强。'],
};

function renderInteractions() {
  const short = lang() === 'zh' ? ['时', '日', '月', '年'] : ['Hour', 'Day', 'Month', 'Year'];
  const items = chart.interactions.map((x) => {
    const where = [...new Set(x.who)].map((i) => short[i]).join(' + ');
    const [en, zh] = INTERACTION_NAMES[x.name];
    const label = lang() === 'zh' ? `${x.chars}${zh}` : `${x.chars} ${en}`;
    const el = x.element != null ? ` → ${lang() === 'zh' ? ELEMENTS[x.element].zh : ELEMENTS[x.element].en}` : '';
    return `<li><strong>${esc(label)}</strong>${el} <small>(${where})</small><br>${esc(t(INTERACTION_PLAIN[x.name][0], INTERACTION_PLAIN[x.name][1]))}</li>`;
  });
  $('interactions').innerHTML = items.length ? items.join('') : `<li>${t('No combinations or clashes between these pillars.', '四柱之间没有合冲。')}</li>`;
}

function renderStars() {
  const stars = symbolicStars(chart);
  const names = lang() === 'zh' ? { hour: '时柱', day: '日柱', month: '月柱', year: '年柱' } : { hour: 'Hour', day: 'Day', month: 'Month', year: 'Year' };
  const label = (s) => (lang() === 'zh' ? s.zh : `${s.en} (${s.zh})`);
  $('stars').innerHTML = stars.length
    ? stars.map((s) => `<li><strong>${label(s)}</strong> <small>(${s.where.map((w) => names[w]).join(t(', ', '、'))})</small><br>${esc(lang() === 'zh' ? s.noteZh : s.note)}</li>`).join('')
    : `<li>${t('None of the common stars appear in this chart.', '命盘中没有常见的神煞。')}</li>`;
}

// With no birth time, the twelve hour pillars this day could have.
function renderHours() {
  $('hours-card').hidden = chart.input.timeKnown;
  if (chart.input.timeKnown) return;
  const ds = chart.dayMaster;
  $('hours').innerHTML = BRANCHES.map((b, hb) => {
    const p = pillarOf(cycleIndex((ds * 2 + hb) % 10, hb));
    const from = (hb * 2 + 23) % 24;
    return `<button type="button" class="hour" data-h="${(hb * 2) % 24}">
      <span class="lp-top">${pad(from)}–${pad((from + 2) % 24)}</span>
      <span class="${elClass(stemElement(p.stem))}">${STEMS[p.stem]}</span><span class="${elClass(branchElement(p.branch))}">${b}</span>
      <span class="lp-god">${godShort(tenGod(ds, p.stem))}</span></button>`;
  }).join('');
}

const chartPlaceName = (f) => (cityOf(f.city) ? `, ${cityName(cityOf(f.city)[0])}` : '');

function renderDetails(f) {
  const rows = [];
  const { jie, input } = chart;
  if (input.year >= 1901 && input.year <= 2099) {
    const l = solarToLunar(input.year, input.month, input.day);
    rows.push([t('Lunar date', '农历'), lunarText(l).replace(/^(Lunar date: |农历 )/, '')]);
  }
  const jieName = (j) => (lang() === 'zh' ? j.zh : `${j.en} (${j.zh})`);
  rows.push([t('Solar year', '节气年'), t(`${chart.solarYear} (${chart.pillars[3].name}, ${chart.animal})`, `${chart.solarYear}（${chart.pillars[3].name}，属${ANIMALS_ZH[chart.pillars[3].branch]}）`)]);
  rows.push([t('Time zone', '时区'), `${fmtOffset(input.tzOffset)}${chartPlaceName(f)}`]);
  rows.push([t('Month began', '本月始于'), `${jieName(jie.prev)}, ${fmtLocal(jie.prev.ms, input.tzOffset)}`]);
  rows.push([t('Next term', '下一个节'), `${jieName(jie.next)}, ${fmtLocal(jie.next.ms, input.tzOffset)}`]);
  if (chart.solarTime && chart.solarTime.longitudeMinutes != null) {
    const s = chart.solarTime;
    const shift = Math.round(s.longitudeMinutes + s.equationMinutes);
    rows.push([t('True solar time', '真太阳时'), `${pad(s.hour)}:${pad(s.minute)} (${shift >= 0 ? '+' : '−'}${Math.abs(shift)} ${t('min', '分钟')})`]);
  } else if (f.trueSolar) {
    rows.push([t('True solar time', '真太阳时'), t('Enter a longitude to use it', '请输入经度')]);
  }
  rows.push([t('Void (空亡)', '空亡'), chart.voids.map((b) => BRANCHES[b]).join('')]);
  rows.push([t('Luck pillars', '大运'), t(`${chart.luck.forward ? 'Forward' : 'Backward'}, from age ${ageText(chart.luck.startYears + chart.luck.startMonthsRem / 12)}`,
    `${chart.luck.forward ? '顺排' : '逆排'}，${ageText(chart.luck.startYears + chart.luck.startMonthsRem / 12)}起运`)]);
  $('details').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
}

function renderReading() {
  $('reading').innerHTML = buildReading(chart, new Date(), tl()).map((sec) => `<div class="card reading">
      <h2>${esc(sec.title)}</h2>
      ${sec.intro ? `<p class="hint">${esc(sec.intro)}</p>` : ''}
      <dl>${sec.items.map((i) => `<dt>${esc(i.head)}</dt><dd>${esc(i.body)}</dd>`).join('')}</dl>
    </div>`).join('');
}

const favourText = (k) => (lang() === 'zh' ? FAVOUR_TEXT_ZH[k] : FAVOUR_TEXT[k]);

function renderSummary(f) {
  const sum = buildSummary(chart, new Date(), tl());
  const order = ['year', 'month', 'day', 'hour'];
  const byKey = Object.fromEntries(chart.pillars.map((p) => [p.key, p]));
  const labels = PILLAR_LABELS[lang()];
  const pillarsHtml = order.map((k) => {
    const p = byKey[k];
    const about = { year: t('roots', '根基'), month: t('work', '事业'), day: t('you', '自己'), hour: t('later life', '晚年') }[k];
    if (p.missing) return `<div class="sum-p missing"><small>${labels[k]}</small><small>${about}</small><b>?</b><b>?</b></div>`;
    return `<div class="sum-p${k === 'day' ? ' is-day' : ''}"><small>${labels[k]}</small><small class="sum-about">${about}</small><b class="${elClass(stemElement(p.stem))}">${STEMS[p.stem]}</b><b class="${elClass(branchElement(p.branch))}">${BRANCHES[p.branch]}</b>
      <small class="sum-el">${EL_EMOJI[stemElement(p.stem)]}${EL_EMOJI[branchElement(p.branch)]}</small></div>`;
  }).join('');
  const row = (label, text, extra = '') => `<div class="sum-row"><dt>${esc(label)}</dt><dd>${extra}${esc(text)}</dd></div>`;
  $('summary').innerHTML = `<div class="card sum-hero">
      <p class="sum-name">${esc(f.name || t('Your chart', '你的命盘'))}</p>
      <div class="sum-pillars">${pillarsHtml}</div>
      <p class="hint sum-legend">${t('The highlighted Day pillar\'s top character is you. Colours and emojis show each character\'s element.', '高亮的日柱上面那个字就是你。颜色和图标代表五行。')}</p>
    </div>
    <div class="card"><dl class="sum">${sum.lines.map((l) => row(l.label, l.text)).join('')}</dl></div>
    <div class="card"><h2>${t('Timing', '时运')}</h2><p class="hint">${t('Demanding means more effort, not bad luck; favourable means things flow more easily.', '“吃力”表示要多花力气，不是坏运；“有利”表示比较顺。')}</p><dl class="sum">${sum.timing.map((x) => row(`${x.label} · ${x.pillar}`, x.text,
      `<span class="badge fav-badge ${x.favour}">${favourText(x.favour)}</span> `)).join('')}</dl></div>
    ${sum.stars.length ? `<div class="card"><dl class="sum">${row(t('Lucky stars', '神煞'), symbolicStars(chart).map((x) => `${t(x.en, x.zh)}: ${t(x.note, x.noteZh)}`).join(' '))}</dl></div>` : ''}
    <p class="hint sum-more">${t('Want more?', '想看更多？')} <button class="linkish" data-go="full">${t('Full reading', '完整解读')}</button> · <button class="linkish" data-go="chart">${t('Full chart', '完整命盘')}</button> · <button class="linkish" data-go="luck">${t('Luck', '运势')}</button> · <a class="linkish" href="${esc(ziweiUrl(f))}">${t('Zi Wei Dou Shu ↗', '紫微斗数 ↗')}</a> · <button class="linkish" data-go="more">${t('Match', '合婚')}</button></p>`;
}

function currentLuckIndex() {
  const now = Date.now();
  if (now < chart.luck.startMs) return -1;
  const yearsIn = (now - chart.luck.startMs) / (365.2422 * 86400000);
  return Math.min(Math.floor(yearsIn / 10), chart.luck.pillars.length - 1);
}

const FAV_MARK = { good: '✓', mixed: '~', hard: '!' };
const favMark = (k) => `<span class="fav-mark ${k}" aria-label="${favourText(k)}">${FAV_MARK[k]}</span>`;

function cell(p, top, bottom, extra = '') {
  return `<span class="lp-top">${top}</span>
    <span class="lp-god">${godShort(p.stemGod)}</span>
    <span class="glyph ${elClass(stemElement(p.stem))}">${STEMS[p.stem]}</span>
    <span class="glyph ${elClass(branchElement(p.branch))}">${BRANCHES[p.branch]}</span>
    <span class="lp-god">${godShort(p.branchGod)}</span>
    <span class="lp-bottom">${bottom}</span>${extra}`;
}

function renderLuck() {
  if (!chart) {
    $('luck-note').textContent = t('Enter a birth date on the Chart tab.', '请先在“命盘”页输入出生日期。');
    $('luck').innerHTML = '';
    $('years-card').hidden = true;
    return;
  }
  const { luck } = chart;
  const now = currentLuckIndex();
  if (selectedLuck == null) selectedLuck = Math.max(now, 0);
  const birthYear = chart.input.year;
  const startAge = esc(ageText(luck.startYears + luck.startMonthsRem / 12));
  const startYear = new Date(luck.startMs).getUTCFullYear();
  $('luck-note').innerHTML = t(`Life moves in 10-year chapters, each with its own pillar. Your first starts at age ${startAge} (${startYear}). Tap one to see its years.`
    + ` <small>(${luck.forward ? 'Forward' : 'Backward'} from the month pillar, from ${luck.gapDays.toFixed(1)} days to the ${luck.forward ? 'next' : 'previous'} solar term.`
    + `${chart.input.timeKnown ? '' : ' Without a birth time the start age is approximate.'})</small>`,
  `人生每十年换一步大运。${startAge}起第一步（${startYear}年）。点一步查看各年。<small>（`
    + `从月柱${luck.forward ? '顺' : '逆'}排。${startAge}起运（${startYear}年），按出生到${luck.forward ? '下一个' : '上一个'}节气的${luck.gapDays.toFixed(1)}天计算。`
    + `${chart.input.timeKnown ? '' : '没有出生时间，起运岁数是约数。'}）</small>`);
  const strength = analyseStrength(chart);
  $('luck').innerHTML = luck.pillars.map((p, i) => `<button type="button" class="lp fav-${pillarFavour(strength, p.stem, p.branch)}${i === now ? ' now' : ''}" data-i="${i}" aria-pressed="${i === selectedLuck}">
      ${cell(p, `${Math.floor(p.age)}`, `${p.fromYear}`, favMark(pillarFavour(strength, p.stem, p.branch)))}</button>`).join('');
  $('luck').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { selectedLuck = Number(b.dataset.i); renderLuck(); }));

  const lp = luck.pillars[selectedLuck];
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = lp.fromYear; y < lp.fromYear + 10; y++) years.push(annualPillar(y, chart.dayMaster));
  $('years-card').hidden = false;
  $('years-title').innerHTML = t(`Years in ${lp.name} <small>流年 · age ${Math.floor(lp.age)}–${Math.floor(lp.age) + 9}</small>`, `${lp.name}大运的流年 <small>${Math.floor(lp.age)}–${Math.floor(lp.age) + 9}岁</small>`);
  $('years').innerHTML = years.map((p) => `<div class="lp fav-${pillarFavour(strength, p.stem, p.branch)}${p.year === thisYear ? ' now' : ''}">
      ${cell(p, `${p.year}`, t(`age ${p.year - birthYear}`, `${p.year - birthYear}岁`), favMark(pillarFavour(strength, p.stem, p.branch)))}</div>`).join('');
  for (const row of [$('luck'), $('years')]) {
    const target = row.querySelector('[aria-pressed="true"], .now');
    if (target) row.scrollLeft = Math.max(0, target.offsetLeft - row.offsetLeft - row.clientWidth / 2 + target.offsetWidth / 2);
  }
}

// ---- Viewing another date -----------------------------------------------------------------------
// The luck views show today unless another date is picked; null means today.

let viewDate = null; // 'YYYY-MM-DD'
const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// Noon, so the day never slips across a time-zone or day boundary.
const viewing = () => (viewDate ? new Date(`${viewDate}T12:00`) : new Date());
const fmtView = (d) => d.toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en', { day: 'numeric', month: 'long', year: 'numeric' });

function setView(d) {
  // Stay inside the dates the calendar maths covers.
  if (Number.isNaN(d.getTime()) || isoDay(d) < $('view-date').min || isoDay(d) > $('view-date').max) return;
  viewDate = isoDay(d) === isoDay(new Date()) ? null : isoDay(d);
  renderNow();
}

// The same day of the month, n months on (or the month's last day, if it's shorter).
function shiftMonths(d, n) {
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  out.setDate(Math.min(d.getDate(), new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate()));
  return out;
}

$('view-date').addEventListener('change', () => { if ($('view-date').value) setView(new Date(`${$('view-date').value}T12:00`)); });
$('view-prev').addEventListener('click', () => setView(shiftMonths(viewing(), -1)));
$('view-next').addEventListener('click', () => setView(shiftMonths(viewing(), 1)));
$('view-today').addEventListener('click', () => setView(new Date()));

// ---- Now: this year, month and day (or those of the picked date) -------------------------------

function renderNow() {
  for (const id of ['now-card', 'months-card', 'days-card']) $(id).hidden = !chart;
  if (!chart) return;
  const st = analyseStrength(chart);
  const dm = chart.dayMaster;
  const d = viewing();
  const isToday = !viewDate;
  $('view-date').value = isoDay(d);
  $('view-today').disabled = isToday;
  const nowChart = computeChart({
    year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(),
    tzOffset: -d.getTimezoneOffset() / 60,
  });
  const withGods = (p) => ({ ...p, stemGod: tenGod(dm, p.stem), branchGod: tenGod(dm, HIDDEN_STEMS[p.branch][0]) });
  const [, today, month, year] = nowChart.pillars;
  const nows = isToday
    ? [[t('This year', '今年'), year], [t('This month', '本月'), month], [t('Today', '今天'), today]]
    : [[t(`${nowChart.solarYear}`, `${nowChart.solarYear}年`), year], [t('That month', '当月'), month], [d.toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en', { day: 'numeric', month: 'short' }), today]];
  $('now').innerHTML = nows.map(([label, p]) => `<div class="lp fav-${pillarFavour(st, p.stem, p.branch)}">${cell(withGods(p), label, p.name, favMark(pillarFavour(st, p.stem, p.branch)))}</div>`).join('');

  const notes = [];
  const natal = chart.pillars.filter((p) => !p.missing);
  const areaName = lang() === 'zh'
    ? { year: '年柱（家庭）', month: '月柱（工作、父母）', day: '日柱（自己、伴侣）', hour: '时柱（子女、计划）' }
    : { year: 'year (family)', month: 'month (work, parents)', day: 'day (you, partner)', hour: 'hour (children, plans)' };
  for (const [label, p] of nows) {
    for (const n of natal) {
      const r = branchPair(p.branch, n.branch);
      if (r.clash) notes.push(t(`${label}'s ${BRANCHES[p.branch]} clashes with your ${areaName[n.key]} ${BRANCHES[n.branch]}: expect movement or change there.`, `${label}的${BRANCHES[p.branch]}冲你的${areaName[n.key]}${BRANCHES[n.branch]}：这方面会有变动。`));
      else if (r.combo != null) notes.push(t(`${label}'s ${BRANCHES[p.branch]} combines with your ${areaName[n.key]} ${BRANCHES[n.branch]}: things come together there.`, `${label}的${BRANCHES[p.branch]}合你的${areaName[n.key]}${BRANCHES[n.branch]}：这方面容易促成。`));
    }
  }
  $('now-notes').innerHTML = notes.length ? notes.map((x) => `<li>${esc(x)}</li>`).join('') : `<li>${isToday ? t('No clashes or combinations with your chart right now.', '目前与你的命盘没有冲合。') : t(`No clashes or combinations with your chart on ${fmtView(d)}.`, `${fmtView(d)}与你的命盘没有冲合。`)}</li>`;

  const months = monthPillarsOf(nowChart.solarYear);
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en', { day: 'numeric', month: 'short' });
  $('months-title').innerHTML = t(`Months of ${nowChart.solarYear} <small>流月 · each starts on its solar term</small>`, `${nowChart.solarYear}年的流月 <small>每月从节气开始</small>`);
  $('months').innerHTML = months.map((p, i) => {
    const current = d.getTime() >= p.startMs && (i === 11 || d.getTime() < months[i + 1].startMs);
    return `<div class="lp fav-${pillarFavour(st, p.stem, p.branch)}${current ? ' now' : ''}">${cell(withGods(p), p.jie.zh, fmtDay(p.startMs), favMark(pillarFavour(st, p.stem, p.branch)))}</div>`;
  }).join('');

  const y = d.getFullYear(); const m = d.getMonth() + 1;
  const daysIn = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay();
  const dayBranch = chart.pillars.find((p) => p.key === 'day').branch;
  $('days-title').innerHTML = `${d.toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en', { month: 'long', year: 'numeric' })} <small>${t('流日', '流日')}</small>`;
  const heads = (lang() === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((w) => `<span class="cal-h">${w}</span>`).join('');
  const blanks = '<span></span>'.repeat(lead);
  const cells = Array.from({ length: daysIn }, (_, i) => {
    const p = dayPillar(y, m, i + 1);
    const clash = branchPair(p.branch, dayBranch).clash;
    const fav = pillarFavour(st, p.stem, p.branch);
    return `<button type="button" class="cal-d fav-${fav}${i + 1 === d.getDate() ? ' now' : ''}" data-day="${i + 1}" aria-pressed="${i + 1 === d.getDate()}">${favMark(fav)}<b>${i + 1}</b><small>${pillarName(p)}</small>${clash ? '<small class="clash">冲</small>' : ''}</button>`;
  }).join('');
  $('days').innerHTML = heads + blanks + cells;
  // Tapping a day views it.
  $('days').querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => setView(new Date(y, m - 1, Number(b.dataset.day), 12))));
  for (const row of [$('months')]) {
    const target = row.querySelector('.now');
    if (target) row.scrollLeft = Math.max(0, target.offsetLeft - row.offsetLeft - row.clientWidth / 2 + target.offsetWidth / 2);
  }
}

// ---- Sharing -------------------------------------------------------------------------------------

const SHARE_KEYS = { n: 'name', c: 'cal', d: 'date', t: 'time', g: 'gender', p: 'city', z: 'tz', l: 'lon' };

function shareUrl(f) {
  const q = new URLSearchParams();
  for (const [k, field] of Object.entries(SHARE_KEYS)) if (f[field] != null && f[field] !== '') q.set(k, f[field]);
  if (f.noTime) q.set('u', '1');
  if (f.trueSolar) q.set('s', '1');
  if (!f.ziDay) q.set('m', '1');
  return `${location.origin}${location.pathname}#${q}`;
}

// The Zi Wei Dou Shu app reads the same link format, so this opens the same birth there.
const ziweiUrl = (f) => shareUrl(f).replace(/\/bazi\/(index\.html)?#/, '/ziwei/#');

function formFromHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (!q.get('d')) return null;
  const f = { ...state.form, noTime: q.get('u') === '1', trueSolar: q.get('s') === '1', ziDay: q.get('m') !== '1' };
  for (const [k, field] of Object.entries(SHARE_KEYS)) if (q.has(k)) f[field] = q.get(k);
  f.lon = f.lon == null || f.lon === '' ? null : Number(f.lon);
  if (!cityOf(f.city)) f.city = '';
  return f;
}

function chartText() {
  const f = state.form;
  const byKey = Object.fromEntries(chart.pillars.map((p) => [p.key, p]));
  const st = analyseStrength(chart);
  return [
    t(`BaZi chart${f.name ? `: ${f.name}` : ''}`, `八字命盘${f.name ? `：${f.name}` : ''}`),
    t(`Born ${f.date}${f.noTime ? '' : ` ${f.time}`}${cityOf(f.city) ? `, ${f.city}` : ''}`, `出生：${f.date}${f.noTime ? '' : ` ${f.time}`}${cityOf(f.city) ? `，${cityName(f.city)}` : ''}`),
    `年 ${byKey.year.name}  月 ${byKey.month.name}  日 ${byKey.day.name}  时 ${byKey.hour.missing ? '?' : byKey.hour.name}`,
    t(`Day master ${STEMS[chart.dayMaster]} ${isYang(chart.dayMaster) ? 'Yang' : 'Yin'} ${ELEMENTS[stemElement(chart.dayMaster)].en}, ${st.verdict}`,
      `日主${STEMS[chart.dayMaster]}${isYang(chart.dayMaster) ? '阳' : '阴'}${ELEMENTS[stemElement(chart.dayMaster)].zh}，${{ strong: '身强', weak: '身弱', balanced: '中和' }[st.verdict]}`),
    t(`Favourable: ${st.favourable.map((e) => ELEMENTS[e].en).join(', ')}`, `喜用：${st.favourable.map((e) => ELEMENTS[e].zh).join('、')}`),
    shareUrl(f),
  ].join('\n');
}

async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); $('share-note').textContent = done; } catch { $('share-note').textContent = text; }
}

async function shareChart() {
  if (!chart) return;
  const url = shareUrl(state.form);
  if (navigator.share) {
    try { await navigator.share({ title: t('BaZi chart', '八字命盘'), url }); return; } catch { /* cancelled: fall back to copying */ }
  }
  copyText(url, t('Link copied. Anyone who opens it sees this chart.', '链接已复制，打开的人都能看到这个命盘。'));
}

// ---- Saved charts --------------------------------------------------------------------------------

function renderSaved() {
  $('saved-empty').hidden = state.saved.length > 0;
  $('saved').innerHTML = state.saved.map((s, i) => {
    const c = chartFrom(s.form).chart;
    const pillars = c ? c.pillars.map((p) => (p.missing ? '··' : p.name)).join(' ') : '';
    return `<li><span><strong>${esc(s.form.name || t('Unnamed', '未命名'))}</strong><small>${esc(s.form.date)}${s.form.noTime ? '' : ` ${esc(s.form.time)}`} · ${pillars}</small></span>
      <button class="secondary small" data-open="${i}" type="button">${t('Open', '打开')}</button>
      <button class="secondary small" data-del="${i}" type="button" aria-label="${t('Delete', '删除')}">✕</button></li>`;
  }).join('');
  $('saved').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
    writeForm({ ...state.form, ...state.saved[Number(b.dataset.open)].form });
    render();
    switchTab('chart');
  }));
  $('saved').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const s = state.saved[Number(b.dataset.del)];
    if (!confirm(t(`Delete ${s.form.name || 'this chart'}?`, `删除${s.form.name || '这个命盘'}？`))) return;
    state.saved.splice(Number(b.dataset.del), 1);
    persist();
    renderSaved();
    renderMatchOptions();
  }));
}

function renderMatchOptions() {
  for (const [id, def] of [['match-a', 'current'], ['match-b', '0']]) {
    const sel = $(id);
    const keep = sel.value || def;
    sel.innerHTML = '';
    sel.add(new Option(`${t('Current chart', '当前命盘')}${state.form.name ? ` (${state.form.name})` : ''}`, 'current'));
    state.saved.forEach((sv, i) => sel.add(new Option(`${sv.form.name || t('Unnamed', '未命名')} · ${sv.form.date}`, String(i))));
    sel.value = [...sel.options].some((o) => o.value === keep) ? keep : 'current';
  }
  renderMatch();
}

function matchPerson(value) {
  const form = value === 'current' ? state.form : state.saved[Number(value)]?.form;
  if (!form) return null;
  const c = chartFrom(form).chart;
  return c ? { chart: c, name: form.name || (value === 'current' ? t('Current chart', '当前命盘') : t('Unnamed', '未命名')) } : null;
}

function renderMatch() {
  const out = $('match-result');
  const a = matchPerson($('match-a').value);
  const b = matchPerson($('match-b').value);
  if (!a || !b || $('match-a').value === $('match-b').value) {
    out.hidden = false;
    out.innerHTML = `<p class="hint">${state.saved.length ? t('Pick two different charts.', '请选择两个不同的命盘。') : t('Save a chart first: enter someone’s details on the Chart tab and tap “Save chart”.', '请先保存命盘：在“命盘”页输入资料，然后点“保存命盘”。')}</p>`;
    return;
  }
  const r = compareCharts(a.chart, b.chart, a.name, b.name, tl());
  const sign = (n) => (n > 0 ? 'plus' : n < 0 ? 'minus' : 'zero');
  out.hidden = false;
  out.innerHTML = `<h2>${esc(r.verdict)} <small>(${r.total > 0 ? '+' : ''}${r.total} ${t('points', '分')})</small></h2>
    <p class="hint">${esc(a.name)}: ${a.chart.pillars.map((p) => (p.missing ? '··' : p.name)).join(' ')}<br>${esc(b.name)}: ${b.chart.pillars.map((p) => (p.missing ? '··' : p.name)).join(' ')}</p>
    <dl>${r.factors.map((f) => `<dt><span class="pts ${sign(f.score)}">${f.score > 0 ? '+' : ''}${f.score}</span> ${esc(f.head)}</dt><dd>${esc(f.body)}</dd>`).join('')}</dl>`;
}

function saveChart() {
  if (!chart) return;
  const form = readForm();
  const same = state.saved.findIndex((s) => s.form.name === form.name && s.form.date === form.date && s.form.time === form.time);
  if (same >= 0) state.saved[same] = { form };
  else state.saved.unshift({ form });
  persist();
  renderSaved();
  renderMatchOptions();
  $('save').textContent = t('Saved ✓', '已保存 ✓');
  setTimeout(() => { $('save').textContent = t('Save chart', '保存命盘'); }, 1500);
}

// The five elements, as a legend and as the cycle in the beginner's guide.
function renderLegends() {
  $('el-legend').innerHTML = ELEMENTS.map((_, e) => `<span class="${elClass(e)}">${elWord(e)}</span>`).join(' ');
  $('el-cycle').innerHTML = `${ELEMENTS.map((_, e) => `<span class="${elClass(e)}">${elWord(e)}</span>`).join(' → ')} → <span class="${elClass(0)}">${EL_EMOJI[0]}</span>`;
}

// ---- Start-up ------------------------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo(0, 0);
}

fillSelects();
const shared = formFromHash();
writeForm(shared || state.form);
if (shared) history.replaceState(null, '', location.pathname);
document.querySelector(`input[name="lang"][value="${lang()}"]`).checked = true;
applyLanguage();
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('[data-panel="chart"] input, [data-panel="chart"] select').forEach((el) => el.addEventListener('input', () => {
  if (el.id === 'no-time') $('time').disabled = el.checked;
  if (el.name === 'cal') { if (el.value === 'lunar') syncLunarFromDate(); showCalendar(); }
  if (el.id === 'l-year') { fillLunarMonths(Number(el.value), $('l-month').value); syncDateFromLunar(); }
  if (el.id === 'l-month') { fillLunarDays(); syncDateFromLunar(); }
  if (el.id === 'l-day') syncDateFromLunar();
  if (el.id === 'date') syncLunarFromDate();
  if (el.id === 'city') {
    $('other-fields').hidden = el.value !== '';
    const city = cityOf(el.value);
    if (city) $('lon').value = city[1];
  }
  render();
}));
$('save').addEventListener('click', saveChart);
$('show-chart').addEventListener('click', () => {
  if (!chart) return;
  setFormOpen(false);
  switchTab('summary');
});
$('edit-form').addEventListener('click', () => { setFormOpen(true); window.scrollTo(0, 0); });
$('summary').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  if (b.dataset.go === 'full') { $('full-reading').open = true; $('full-reading').scrollIntoView({ behavior: 'smooth' }); } else switchTab(b.dataset.go);
});
$('share').addEventListener('click', shareChart);
$('copy').addEventListener('click', () => chart && copyText(chartText(), t('Copied.', '已复制。')));
$('hours').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]');
  if (!b) return;
  $('no-time').checked = false;
  $('time').disabled = false;
  $('time').value = `${pad(Number(b.dataset.h))}:00`;
  render();
  window.scrollTo(0, 0);
});
// Static text: elements carry their Chinese in data-zh; the English is the original markup.
function applyLanguage() {
  const zh = lang() === 'zh';
  document.documentElement.lang = zh ? 'zh-Hans' : 'en';
  document.querySelectorAll('[data-zh]').forEach((el) => {
    if (el.dataset.en == null) el.dataset.en = el.innerHTML;
    el.innerHTML = zh ? el.dataset.zh : el.dataset.en;
  });
  document.querySelectorAll('[data-zh-placeholder]').forEach((el) => {
    if (el.dataset.enPlaceholder == null) el.dataset.enPlaceholder = el.placeholder;
    el.placeholder = zh ? el.dataset.zhPlaceholder : el.dataset.enPlaceholder;
  });
  document.querySelectorAll('[data-zh-label]').forEach((el) => {
    if (el.dataset.enLabel == null) el.dataset.enLabel = el.getAttribute('aria-label');
    el.setAttribute('aria-label', zh ? el.dataset.zhLabel : el.dataset.enLabel);
  });
  document.title = zh ? '八字排盘' : 'BaZi Calculator';
  fillCities();
  const tz = $('tz').value;
  $('tz').innerHTML = '';
  fillTimeZones();
  $('tz').value = tz;
  showCalendar();
  renderLegends();
}

document.querySelectorAll('input[name="lang"]').forEach((el) => el.addEventListener('input', () => {
  state.lang = el.value;
  persist();
  applyLanguage();
  render();
  renderSaved();
  renderMatchOptions();
}));
$('pillars').addEventListener('click', (e) => {
  const b = e.target.closest('[data-x]');
  if (!b || !chart) return;
  $('pillars').querySelectorAll('.pv.on').forEach((x) => x.classList.remove('on'));
  b.classList.add('on');
  $('explain').innerHTML = explain(b.dataset.x);
});
// The beginner's guide starts open until it has been closed once.
$('intro').open = !state.introSeen;
$('intro').addEventListener('toggle', () => { if (!$('intro').open && !state.introSeen) { state.introSeen = true; persist(); } });
render();
renderSaved();
renderMatchOptions();
if (chart) { setFormOpen(false); switchTab('summary'); }
$('match-a').addEventListener('input', renderMatch);
$('match-b').addEventListener('input', renderMatch);
