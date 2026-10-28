import { STEMS, BRANCHES, computeChart, parseBirth } from '../src/bazi.js';
import { lunarToSolar, solarToLunar, lunarYearMonths, lunarMonthName, lunarDayName } from '../src/lunar.js';
import { CITIES, CITY_ZH, cityOf, placeFor } from '../src/places.js';
import {
  computeZiwei, ziweiBirth, PALACES, MAIN_STARS, MINOR_STARS, HUA, SIHUA, BUREAU_EN, starsToRead, decadeAt, yearly,
} from '../src/ziwei.js';

const STORAGE_KEY = 'ziwei-v1';
const BAZI_KEY = 'bazi-v1'; // charts saved in the BaZi app can be opened here
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pad = (n) => String(n).padStart(2, '0');

// ---- State ---------------------------------------------------------------------------------------

function load() {
  const defaults = { form: { name: '', cal: 'western', date: '', time: '', gender: '', tz: 'fixed:8', trueSolar: false, city: 'Singapore', lon: 103.82, ziDay: true }, saved: [], lang: /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.form) return { ...defaults, ...saved, lang: saved.lang === 'zh' ? 'zh' : 'en', form: { ...defaults.form, ...saved.form } };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return defaults;
}
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };
const lang = () => (state.lang === 'zh' ? 'zh' : 'en');
const t = (en, zh) => (lang() === 'zh' ? zh : en);
const cityName = (n) => (lang() === 'zh' ? CITY_ZH[n] || n : n);

let chart = null; // the BaZi-style chart: the exact birth moment
let zw = null; // the Zi Wei chart
let selected = null; // branch of the palace whose details are shown

// ---- Form ----------------------------------------------------------------------------------------

const fmtOffset = (h) => `UTC${h < 0 ? '−' : '+'}${Math.floor(Math.abs(h))}${Math.abs(h) % 1 ? `:${String(Math.round((Math.abs(h) % 1) * 60)).padStart(2, '0')}` : ''}`;

function fillTimeZones() {
  const tzSel = $('tz');
  const keep = tzSel.value;
  tzSel.innerHTML = '';
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
  if (keep) tzSel.value = keep;
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
    gender: document.querySelector('input[name="gender"]:checked')?.value || '',
    tz: $('tz').value,
    trueSolar: $('true-solar').checked,
    city: $('city').value,
    lon: $('lon').value === '' ? null : Number($('lon').value),
    ziDay: $('zi-day').checked,
  };
}

// The exact birth moment (time zone as it was then, true solar time, the 23:00 rule) is worked
// out by src/bazi.js, exactly as in the BaZi app; the Zi Wei chart starts from it.
function chartFrom(f) {
  if (!f.date) return { error: null };
  const birth = parseBirth(f.date, f.time);
  if (!birth || birth.year < 1901 || birth.year > 2099) return { error: t('Enter a date between 1901 and 2099.', '请输入1901至2099年之间的日期。') };
  if (!f.time) return { error: t('Enter the birth time: a Zi Wei chart needs the two-hour period you were born in.', '请输入出生时间：紫微斗数需要出生时辰。') };
  if (!f.gender) return { error: t('Choose Male or Female: it sets which way the 10-year periods run.', '请选择男或女：它决定大限顺行还是逆行。') };
  const place = placeFor(f, birth);
  const c = computeChart({
    ...birth, tzOffset: place.tz, gender: f.gender, ziStartsDay: f.ziDay,
    trueSolar: f.trueSolar && Number.isFinite(place.lon), longitude: place.lon,
  });
  return { place, chart: c, zw: computeZiwei(ziweiBirth(c)) };
}

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

function renderLunarLine() {
  const b = parseBirth($('date').value, '');
  if (!b || b.year < 1901 || b.year > 2099) { $('lunar-line').textContent = ''; return; }
  const l = solarToLunar(b.year, b.month, b.day);
  $('lunar-line').textContent = t(`Lunar date: day ${l.day} of the ${l.leap ? 'leap ' : ''}${l.month}${['st', 'nd', 'rd'][l.month - 1] || 'th'} month, ${l.year}`,
    `农历 ${l.year}年 ${lunarMonthName(l.month, l.leap)}${lunarDayName(l.day)}`);
}

function renderTzLine(place) {
  const line = $('tz-line');
  if (!place || (!place.city && !place.zone)) { line.textContent = ''; return; }
  let text = t(`Clock time there on that date: ${fmtOffset(place.tz)}`, `当天当地时间：${fmtOffset(place.tz)}`);
  if (place.dst) text += t(', daylight saving (already allowed for)', '，夏令时（已计入）');
  else if (place.changed) text += t(` (it's ${fmtOffset(place.today)} today)`, `（现在是 ${fmtOffset(place.today)}）`);
  line.textContent = `${text}${t('.', '。')}`;
}

function setFormOpen(open) {
  $('form-card').hidden = !open;
  $('form-compact').hidden = open;
}

function renderFormLine(f) {
  const b = parseBirth(f.date, '');
  if (!b) return;
  const date = new Date(Date.UTC(b.year, b.month - 1, b.day)).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  $('form-line').textContent = [f.name, date, f.time, cityOf(f.city) ? cityName(f.city) : '', f.gender === 'female' ? t('Female', '女') : t('Male', '男')].filter(Boolean).join(' · ');
}

// ---- Words ---------------------------------------------------------------------------------------

const huaBadge = (h) => (h == null ? '' : `<b class="hua h${h}" title="${HUA[h].zh}">${'禄权科忌'[h]}</b>`);
const palaceLabel = (i) => t(PALACES[i].en, PALACES[i].zh);
const palaceFull = (i) => t(`${PALACES[i].en} palace`, PALACES[i].zh);
const starOf = (k) => MAIN_STARS[k] || MINOR_STARS[k];
const starText = (k) => t(`${starOf(k).zh} ${starOf(k).en}`, starOf(k).zh);
const bureauText = (z) => t(`${BUREAU_EN[z.bureau]} bureau`, `${z.lifeNayin.slice(-1)}${'二三四五六'[z.bureau - 2]}局`);
const gz = (p) => `${STEMS[p.stem]}${BRANCHES[p.branch]}`;

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
  if (Number.isNaN(d.getTime()) || isoDay(d) < $('zw-view-date').min || isoDay(d) > $('zw-view-date').max) return;
  viewDate = isoDay(d) === isoDay(new Date()) ? null : isoDay(d);
  renderGrid();
  renderNow();
}

// The same day of the month, n months on (or the month's last day, if it's shorter).
function shiftMonths(d, n) {
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  out.setDate(Math.min(d.getDate(), new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate()));
  return out;
}

$('zw-view-date').addEventListener('change', () => { if ($('zw-view-date').value) setView(new Date(`${$('zw-view-date').value}T12:00`)); });
$('zw-view-prev').addEventListener('click', () => setView(shiftMonths(viewing(), -12)));
$('zw-view-next').addEventListener('click', () => setView(shiftMonths(viewing(), 12)));
$('zw-view-today').addEventListener('click', () => setView(new Date()));

// Nominal age (虚岁) on the viewed date, the 10-year period it falls in, and that lunar year's overlay.
function zwNow() {
  const d = viewing();
  const ly = solarToLunar(d.getFullYear(), d.getMonth() + 1, d.getDate()).year;
  const age = ly - zw.year + 1;
  return { age, lunarYear: ly, decade: decadeAt(zw, age), yr: yearly(zw, ly) };
}

function starLines(list) {
  return list.map((s) => {
    const st = starOf(s.star);
    const hua = s.hua == null ? '' : ` ${huaBadge(s.hua)} ${t(HUA[s.hua].about, HUA[s.hua].aboutZh)}${t('.', '。')}`;
    return `<li><strong>${starText(s.star)}</strong>${t(': ', '：')}${esc(t(st.about, st.aboutZh || st.about))}${t('.', '。')}${hua}</li>`;
  }).join('');
}

// One palace explained: what it covers, its stars (or the opposite palace's if it's empty).
function palaceHtml(p, heading = 'h2') {
  const info = PALACES[p.name];
  const { stars, borrowed } = starsToRead(zw, p);
  const opposite = zw.palaces[(p.branch + 6) % 12];
  return `<${heading}>${palaceFull(p.name)} <small>${info.zh} · ${gz(p)} · ${t(`ages ${p.decade.from}–${p.decade.to}`, `${p.decade.from}–${p.decade.to}岁大限`)}</small></${heading}>
    <p>${esc(t(`Covers ${info.about}.`, `主${info.aboutZh}。`))}${p.body ? ` ${t('It is also your body palace (身宫), which grows more important in the second half of life.', '这里也是身宫，后半生的影响更明显。')}` : ''}</p>
    ${borrowed ? `<p class="hint">${t(`No main star here, so it is read with the stars of the opposite ${PALACES[opposite.name].en} palace.`, `本宫无主星（空宫），借对宫${PALACES[opposite.name].zh}的主星来看。`)}</p>` : ''}
    ${stars.length ? `<ul class="notes">${starLines(stars)}</ul>` : ''}
    ${p.minor.length ? `<p class="hint">${t('Minor stars', '辅星')}</p><ul class="notes">${starLines(p.minor)}</ul>` : ''}`;
}

// ---- Rendering -----------------------------------------------------------------------------------

function render() {
  const f = readForm();
  state.form = f;
  persist();
  const r = chartFrom(f);
  renderTzLine(r.place);
  renderLunarLine();
  renderFormLine(f);
  chart = r.chart || null;
  zw = r.zw || null;
  $('show-chart').disabled = !zw;
  $('error').hidden = !r.error;
  $('error').textContent = r.error || '';
  $('result').hidden = !zw;
  if (!zw) {
    setFormOpen(true);
    $('headline').textContent = t('Enter a birth date', '请输入出生日期');
    $('headline').classList.remove('cjk');
    $('subline').textContent = t('The 12 palaces and the stars in them', '十二宫与星曜');
    for (const id of ['zw-life', 'zw-now', 'zw-next']) $(id).innerHTML = `<p class="hint">${t('Enter your birth details on the Chart tab.', '请先在“命盘”页输入出生资料。')}</p>`;
    $('zw-palaces').innerHTML = '';
    $('zw-periods').innerHTML = '';
    $('zw-hours').innerHTML = `<li class="hint">${t('Enter your birth details first.', '请先输入出生资料。')}</li>`;
    return;
  }
  if (selected == null || !zw.palaces[selected]) selected = zw.life;
  const life = zw.palaces[zw.life];
  const { stars, borrowed } = starsToRead(zw, life);
  const zhNames = stars.map((s) => MAIN_STARS[s.star].zh).join(' ');
  $('headline').textContent = t(`⭐ The ${stars.map((s) => MAIN_STARS[s.star].en).join(' & ')}`, zhNames) || t('Empty life palace', '命宫空宫');
  $('headline').classList.toggle('cjk', lang() === 'zh');
  $('subline').textContent = `${f.name ? `${f.name} · ` : ''}${t(`Your main star${stars.length > 1 ? 's' : ''}: ${zhNames}${borrowed ? ' (borrowed)' : ''}`, `命宫主星${borrowed ? '（借对宫）' : ''}`)}`;
  renderGlance();
  renderGrid();
  $('zw-detail').innerHTML = palaceHtml(zw.palaces[selected]);
  renderReading();
  renderNow();
  renderHours();
}

// The chart at a glance, in plain words: main star, the chapter you're in, this year, and where the
// birth year's good-fortune and watch tags fall.
function renderGlance() {
  const life = zw.palaces[zw.life];
  const { stars, borrowed } = starsToRead(zw, life);
  const { age, decade, yr } = zwNow();
  const holder = (k) => zw.palaces.find((p) => [...p.main, ...p.minor].some((s) => s.star === k));
  const [luKey, , , jiKey] = SIHUA[zw.yearStem];
  const lu = holder(luKey); const ji = holder(jiKey);
  const area = (p) => t(`your <b>${PALACES[p.name].en}</b> box (${esc(PALACES[p.name].about)})`, `你的<b>${PALACES[p.name].zh}</b>（${esc(PALACES[p.name].aboutZh)}）`);
  const items = [
    ['⭐', t(`Your main star${stars.length > 1 ? 's' : ''}`, '命宫主星'), stars.length
      ? stars.map((s) => t(`<b>${MAIN_STARS[s.star].en}</b> (${MAIN_STARS[s.star].zh}): ${esc(MAIN_STARS[s.star].about)}`, `<b>${MAIN_STARS[s.star].zh}</b>：${esc(MAIN_STARS[s.star].aboutZh)}`)).join(t('; ', '；')) + (borrowed ? t(' (borrowed from the opposite box)', '（借对宫）') : '')
      : t('No main star', '无主星')],
    ['📅', t('Your chapter now', '现在的大限'), decade
      ? t(`At ${age}, ${area(decade)} leads, ages ${decade.decade.from}–${decade.decade.to}.`, `虚岁${age}岁，由${area(decade)}主导（${decade.decade.from}–${decade.decade.to}岁）。`)
      : t(`Your first 10-year chapter starts at age ${zw.bureau}.`, `${zw.bureau}岁起第一个大限。`)],
    ['🗓️', t('This year', '今年'), t(`Highlights ${area(yr.palace)}.`, `突出${area(yr.palace)}。`)],
  ];
  if (lu) items.push(['🍀', t('Good fortune (禄)', '好运（化禄）'), t(`Sits in ${area(lu)}, with ${MINOR_STARS[luKey] ? MINOR_STARS[luKey].en : MAIN_STARS[luKey].en} (${starOf(luKey).zh}).`, `落在${area(lu)}，${starOf(luKey).zh}化禄。`)]);
  if (ji) items.push(['⚠️', t('The area to watch (忌)', '要留意（化忌）'), t(`${area(ji)[0].toUpperCase()}${area(ji).slice(1)}, with ${MINOR_STARS[jiKey] ? MINOR_STARS[jiKey].en : MAIN_STARS[jiKey].en} (${starOf(jiKey).zh}).`, `${area(ji)}，${starOf(jiKey).zh}化忌。`)]);
  $('zw-glance').innerHTML = `<h2>${t('At a glance', '一眼看懂')}</h2>
    <ul class="glance">${items.map(([icon, head, body]) => `<li><span aria-hidden="true">${icon}</span><div><small>${head}</small><p>${body}</p></div></li>`).join('')}</ul>
    <p class="hint">${t('Tap any box in the chart below to read about it.', '点下面命盘的任何格子查看解释。')} <button type="button" class="linkish" data-go="reading">${t('All 12 areas', '十二宫解读')}</button> · <button type="button" class="linkish" data-go="now">${t('Year by year', '逐年运势')}</button></p>`;
}

// The traditional layout: 巳午未申 along the top, 寅丑子亥 along the bottom.
const GRID = [5, 6, 7, 8, 4, null, null, 9, 3, null, null, 10, 2, 1, 0, 11];

function renderGrid() {
  const { age, decade, yr } = zwNow();
  const cell = (p) => {
    const cls = ['zw-cell', p.branch === zw.life ? 'life' : '', p.branch === selected ? 'sel' : '', decade && p.branch === decade.branch ? 'now' : '', p.branch === yr.branch ? 'year' : ''].join(' ');
    const main = p.main.map((s) => `<span class="zw-main">${MAIN_STARS[s.star].zh}${huaBadge(s.hua)}${lang() === 'en' ? `<small class="zw-en">${MAIN_STARS[s.star].en}</small>` : ''}</span>`).join('');
    const minor = p.minor.map((s) => `<span class="zw-minor ${MINOR_STARS[s.star].good ? 'good' : 'bad'}">${MINOR_STARS[s.star].zh}${huaBadge(s.hua)}</span>`).join('');
    return `<button type="button" class="${cls}" data-zw="${p.branch}" aria-pressed="${p.branch === selected}">
      <span class="zw-name">${palaceLabel(p.name)}${p.body ? `<i class="zw-body">${t('Body', '身')}</i>` : ''}</span>
      <span class="zw-stars">${main || `<span class="zw-empty">${t('empty', '空宫')}</span>`}</span>
      <span class="zw-minors">${minor}</span>
      <span class="zw-foot"><span>${gz(p)}</span><span>${p.decade.from}–${p.decade.to}</span></span>
    </button>`;
  };
  const l = ziweiBirth(chart).lunar;
  const centre = `<div class="zw-centre">
      <strong>${esc(state.form.name || t('Your chart', '你的命盘'))}</strong>
      <span>${t('Lunar', '农历')} ${STEMS[zw.yearStem]}${BRANCHES[zw.yearBranch]}${t(' year', '年')} ${lunarMonthName(l.month, l.leap)}${lunarDayName(l.day)} ${BRANCHES[zw.hour]}${t(' hour', '时')}</span>
      <span>${bureauText(zw)} · ${t(zw.forward ? 'periods run clockwise' : 'periods run anticlockwise', zw.forward ? '大限顺行' : '大限逆行')}</span>
      <span class="zw-hua-line">${SIHUA[zw.yearStem].map((k, h) => `${starOf(k).zh}${huaBadge(h)}`).join(' ')}</span>
      <span>${t(`Age ${age} (nominal)`, `虚岁${age}岁`)}</span>
    </div>`;
  $('zw-grid').innerHTML = GRID.map((b, i) => (b == null ? (i === 5 ? centre : '') : cell(zw.palaces[b]))).join('');
}

function renderReading() {
  const life = zw.palaces[zw.life];
  const { stars, borrowed } = starsToRead(zw, life);
  const body = zw.palaces[zw.body];
  const names = stars.map((s) => t(`${MAIN_STARS[s.star].zh} (the ${MAIN_STARS[s.star].en})`, MAIN_STARS[s.star].zh)).join(t(' and ', '、'));
  $('zw-life').innerHTML = `<h2>${t('You in a line', '命宫一句话')} <small>${t('life palace', '命宫')} ${gz(life)}</small></h2>
    <p>${t(`Your life palace ${borrowed ? 'is empty and borrows' : 'holds'} ${names}: `, `命宫${borrowed ? '无主星，借对宫' : '坐'}${names}：`)}${esc(stars.map((s) => t(MAIN_STARS[s.star].about, MAIN_STARS[s.star].aboutZh)).join(t('; ', '；')))}${t('.', '。')}</p>
    <details class="tech"><summary class="hint">${t('How this chart was worked out', '排盘资料')}</summary><p class="hint">${t(`Body palace: your ${PALACES[body.name].en} palace. Element pattern: ${bureauText(zw)} (from the life palace's 纳音, ${zw.lifeNayin}); your first 10-year period starts at ${zw.bureau}. Born in a ${STEMS[zw.yearStem]} year, so ${SIHUA[zw.yearStem].map((k, h) => `${starOf(k).zh} ${HUA[h].en.toLowerCase()}`).join(', ')}.`,
    `身宫在${PALACES[body.name].zh}。五行局：${bureauText(zw)}（命宫纳音${zw.lifeNayin}），${zw.bureau}岁起大限。生年${STEMS[zw.yearStem]}干四化：${SIHUA[zw.yearStem].map((k, h) => `${starOf(k).zh}${HUA[h].zh}`).join('、')}。`)}</p></details>`;
  // All twelve palaces, in the traditional order from the life palace.
  const order = Array.from({ length: 12 }, (_, i) => zw.palaces.find((p) => p.name === i));
  $('zw-palaces').innerHTML = order.map((p) => `<div class="card reading">${palaceHtml(p)}</div>`).join('');
}

function huaList(yr) {
  return yr.hua.map((h) => `<li>${huaBadge(h.hua)} ${starText(h.star)} ${t(`in your ${PALACES[h.palace.name].en} palace: ${HUA[h.hua].about}`, `在${PALACES[h.palace.name].zh}：${HUA[h.hua].aboutZh}`)}${t('.', '。')}</li>`).join('');
}

function renderNow() {
  const { age, lunarYear, decade, yr } = zwNow();
  const isToday = !viewDate;
  $('zw-view-date').value = isoDay(viewing());
  $('zw-view-today').disabled = isToday;
  const heading = `<h2>${isToday ? t('Now', '当下') : esc(fmtView(viewing()))} <small>大限 · 流年</small></h2>`;
  if (age < 1) {
    $('zw-now').innerHTML = `${heading}<p>${t('That date is before the birth date. Pick a later one.', '这个日期在出生之前，请选更晚的日期。')}</p>`;
  } else $('zw-now').innerHTML = `${heading}
    <p>${decade ? t(`At ${age} (nominal age) you are in the 10-year period of your <strong>${PALACES[decade.name].en}</strong> palace (ages ${decade.decade.from}–${decade.decade.to}): ${esc(PALACES[decade.name].about)} take centre stage.`,
    `虚岁${age}岁，正走<strong>${PALACES[decade.name].zh}</strong>大限（${decade.decade.from}–${decade.decade.to}岁）：${esc(PALACES[decade.name].aboutZh)}是这十年的重点。`)
    : t(`Your first 10-year period starts at age ${zw.bureau}.`, `${zw.bureau}岁起第一个大限。`)}</p>
    <p>${t(`${isToday ? 'This year' : `The lunar year ${lunarYear}`} (${STEMS[yr.stem]}${BRANCHES[yr.branch]}) falls on your <strong>${PALACES[yr.palace.name].en}</strong> palace, and its four tags (good fortune, power, recognition, watch) land here:`,
    `${isToday ? '今年' : `${lunarYear}年`}${STEMS[yr.stem]}${BRANCHES[yr.branch]}，流年命宫落在你的<strong>${PALACES[yr.palace.name].zh}</strong>，流年四化如下：`)}</p>
    <ul class="notes">${huaList(yr)}</ul>`;
  const periods = [...zw.palaces].sort((a, b) => a.decade.from - b.decade.from);
  $('zw-periods').innerHTML = periods.map((p) => {
    const { stars } = starsToRead(zw, p);
    const isNow = decade && p.branch === decade.branch;
    return `<li class="${isNow ? 'now' : ''}"><span class="zw-age">${p.decade.from}–${p.decade.to}</span>
      <span><strong>${palaceLabel(p.name)}</strong> ${gz(p)} · ${stars.map((s) => MAIN_STARS[s.star].zh).join(' ')}${isNow ? ` <span class="pill">${t('now', '当前')}</span>` : ''}<br>
      <small>${esc(t(PALACES[p.name].about, PALACES[p.name].aboutZh))}</small></span></li>`;
  }).join('');
  const next = yearly(zw, lunarYear + 1);
  $('zw-next').innerHTML = `<h2>${viewDate ? t('The year after', '次年') : t('Next year', '明年')} <small>${STEMS[next.stem]}${BRANCHES[next.branch]}</small></h2>
    <p>${t(`Falls on your <strong>${PALACES[next.palace.name].en}</strong> palace.`, `流年命宫落在你的<strong>${PALACES[next.palace.name].zh}</strong>。`)}</p>
    <ul class="notes">${huaList(next)}</ul>`;
}

// Unsure of the hour: the life palace for each of the twelve, on the same day.
function renderHours() {
  const base = ziweiBirth(chart);
  $('zw-hours').innerHTML = BRANCHES.map((b, h) => {
    const z = computeZiwei({ ...base, hour: h });
    const life = z.palaces[z.life];
    const { stars, borrowed } = starsToRead(z, life);
    const from = pad((h * 2 + 23) % 24);
    const to = pad(h * 2 + 1);
    return `<li class="${h === zw.hour ? 'now' : ''}"><button type="button" class="zw-hour" data-h="${h}">
      <span class="zw-age">${b}${t('', '时')} <small>${from}–${to}</small></span>
      <span><strong>${stars.map((s) => MAIN_STARS[s.star].zh).join(' ')}</strong>${borrowed ? t(' (borrowed)', '（借）') : ''}${h === zw.hour ? ` <span class="pill">${t('yours', '当前')}</span>` : ''}<br>
      <small>${esc(stars.map((s) => t(MAIN_STARS[s.star].about, MAIN_STARS[s.star].aboutZh)).join(t('; ', '；')))}</small></span>
    </button></li>`;
  }).join('');
}

// ---- Sharing and saving --------------------------------------------------------------------------

// The same link format as the BaZi app, so a BaZi link can open here and back.
const SHARE_KEYS = { n: 'name', c: 'cal', d: 'date', t: 'time', g: 'gender', p: 'city', z: 'tz', l: 'lon' };

function shareUrl(f) {
  const q = new URLSearchParams();
  for (const [k, field] of Object.entries(SHARE_KEYS)) if (f[field] != null && f[field] !== '') q.set(k, f[field]);
  if (f.trueSolar) q.set('s', '1');
  if (!f.ziDay) q.set('m', '1');
  return `${location.origin}${location.pathname}#${q}`;
}

function formFromHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (!q.get('d')) return null;
  const f = { ...state.form, trueSolar: q.get('s') === '1', ziDay: q.get('m') !== '1' };
  for (const [k, field] of Object.entries(SHARE_KEYS)) if (q.has(k)) f[field] = q.get(k);
  f.lon = f.lon == null || f.lon === '' ? null : Number(f.lon);
  if (!cityOf(f.city)) f.city = '';
  return f;
}

async function shareChart() {
  if (!zw) return;
  const url = shareUrl(state.form);
  if (navigator.share) {
    try { await navigator.share({ title: t('Zi Wei chart', '紫微命盘'), url }); return; } catch { /* cancelled: fall back to copying */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    $('share-note').textContent = t('Link copied. Anyone who opens it sees this chart.', '链接已复制，打开的人都能看到这个命盘。');
  } catch {
    $('share-note').textContent = url;
  }
}

function saveChart() {
  if (!zw) return;
  const form = readForm();
  const same = state.saved.findIndex((s) => s.form.name === form.name && s.form.date === form.date && s.form.time === form.time);
  if (same >= 0) state.saved[same] = { form };
  else state.saved.unshift({ form });
  persist();
  renderSaved();
  $('save').textContent = t('Saved ✓', '已保存 ✓');
  setTimeout(() => { $('save').textContent = t('Save chart', '保存命盘'); }, 1500);
}

function savedRow(form, i, kind) {
  const r = chartFrom(form);
  const life = r.zw ? starsToRead(r.zw, r.zw.palaces[r.zw.life]).stars.map((s) => MAIN_STARS[s.star].zh).join(' ') : '';
  return `<li><span><strong>${esc(form.name || t('Unnamed', '未命名'))}</strong><small>${esc(form.date)} ${esc(form.time)}${life ? ` · ${t('life', '命宫')} ${life}` : ''}</small></span>
    <button class="secondary small" data-open="${kind}:${i}" type="button">${t('Open', '打开')}</button>
    ${kind === 'own' ? `<button class="secondary small" data-del="${i}" type="button" aria-label="${t('Delete', '删除')}">✕</button>` : ''}</li>`;
}

// Charts saved in the BaZi app, if any have a birth time.
function baziSaved() {
  try {
    return (JSON.parse(localStorage.getItem(BAZI_KEY))?.saved || []).map((s) => s.form).filter((f) => f && f.date && f.time && !f.noTime);
  } catch {
    return [];
  }
}

function renderSaved() {
  $('saved-empty').hidden = state.saved.length > 0;
  $('saved').innerHTML = state.saved.map((s, i) => savedRow(s.form, i, 'own')).join('');
  const bazi = baziSaved();
  $('bazi-card').hidden = !bazi.length;
  $('bazi-saved').innerHTML = bazi.map((f, i) => savedRow(f, i, 'bazi')).join('');
}

function openSaved(value) {
  const [kind, i] = value.split(':');
  const form = kind === 'own' ? state.saved[Number(i)]?.form : baziSaved()[Number(i)];
  if (!form) return;
  writeForm({ ...state.form, ...form, cal: form.cal || 'western' });
  selected = null;
  render();
  setFormOpen(false);
  switchTab('chart');
}

// ---- Shell ---------------------------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo(0, 0);
}

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
  document.title = zh ? '紫微斗数' : 'Zi Wei Dou Shu';
  fillCities();
  fillTimeZones();
  showCalendar();
}

// ---- Wiring --------------------------------------------------------------------------------------

fillCities();
fillTimeZones();
const shared = formFromHash();
writeForm(shared || state.form);
if (shared) history.replaceState(null, '', location.pathname);
document.querySelector(`input[name="lang"][value="${lang()}"]`).checked = true;
applyLanguage();

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('#form-card input, #form-card select').forEach((el) => el.addEventListener('input', () => {
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
$('show-chart').addEventListener('click', () => { if (zw) setFormOpen(false); });
$('edit-form').addEventListener('click', () => { setFormOpen(true); window.scrollTo(0, 0); });
$('zw-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-zw]');
  if (!b || !zw) return;
  selected = Number(b.dataset.zw);
  renderGrid();
  $('zw-detail').innerHTML = palaceHtml(zw.palaces[selected]);
  $('zw-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('zw-hours').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]');
  if (!b) return;
  // The middle of that two-hour period (子 runs 23:00–01:00, so 00:40 keeps it on the same day),
  // moved back by the true-solar-time correction if that's on, so it lands in that period.
  const h = Number(b.dataset.h);
  const st = chart?.solarTime;
  const corr = st && $('true-solar').checked ? Math.round((st.longitudeMinutes || 0) + (st.equationMinutes || 0)) : 0;
  const mins = ((h === 0 ? 40 : h * 120) - corr + 1440) % 1440;
  $('time').value = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  selected = null;
  render();
  setFormOpen(false);
  switchTab('chart');
});
$('save').addEventListener('click', saveChart);
$('share').addEventListener('click', shareChart);
document.querySelector('[data-panel="more"]').addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  const del = e.target.closest('[data-del]');
  if (open) openSaved(open.dataset.open);
  if (del) {
    const s = state.saved[Number(del.dataset.del)];
    if (!confirm(t(`Delete ${s.form.name || 'this chart'}?`, `删除${s.form.name || '这个命盘'}？`))) return;
    state.saved.splice(Number(del.dataset.del), 1);
    persist();
    renderSaved();
  }
});
document.querySelectorAll('input[name="lang"]').forEach((el) => el.addEventListener('input', () => {
  state.lang = el.value;
  persist();
  applyLanguage();
  render();
  renderSaved();
}));

$('zw-glance').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) switchTab(b.dataset.go); });
// The beginner's guide starts open until it has been closed once.
$('intro').open = !state.introSeen;
$('intro').addEventListener('toggle', () => { if (!$('intro').open && !state.introSeen) { state.introSeen = true; persist(); } });
render();
renderSaved();
if (zw && shared) setFormOpen(false);
