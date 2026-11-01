import { holdReady } from '../shared/pwa.js';
import {
  PALACES, PALACES_EN, PALACES_ZH, TRIGRAMS, TRIGRAM_SYMBOLS, MOUNTAINS, MOUNTAIN_PINYIN, STARS, mountainOf, mountainLabel,
  mountainPalace, mountainOffset, palaceOf, houseChart, fly, annualStar, monthStar, monthOf, monthStartMs, afflictions, solarYear,
  periodOf, periodRange, timeliness, comboFor, kuaOf, isEastGroup, MANSIONS, mansionAt, houseKua, yearBranch, gridPalaces,
} from '../src/fengshui.js';
import { BRANCHES, ANIMALS, ANIMALS_ZH, ELEMENTS, STEMS, JIE, computeChart, parseBirth, analyseStrength } from '../src/bazi.js';
import { placeFor } from '../src/places.js';
import { headingFromOrientation } from '../src/compass.js';
import { getPlan, putPlan, deletePlan, fileToPlan, rotatePlan } from './plan.js';
import { insideGrid, dragGrid, rotateGrid90, fitOutline, nearestSide, screenAngleOf } from '../src/plangrid.js';

const STORAGE_KEY = 'fengshui-v1';
const BAZI_KEY = 'bazi-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mod = (n, m) => ((n % m) + m) % m;

// ---- State ---------------------------------------------------------------------------------------

function load() {
  const defaults = {
    home: { facing: '', moveIn: '', period: 'auto', replace: 'auto', orient: 'south', showAnnual: true },
    plan: { grid: null, side: 'bottom', missing: [], layer: 'stars' },
    people: [],
    lang: /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.home) return { ...defaults, ...saved, home: { ...defaults.home, ...saved.home }, plan: { ...defaults.plan, ...saved.plan }, people: saved.people || [] };
  } catch { /* ignore */ }
  return defaults;
}
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };
const lang = () => (state.lang === 'zh' ? 'zh' : 'en');
const t = (en, zh) => (lang() === 'zh' ? zh : en);

const todayParts = () => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };
const currentYear = solarYear(...todayParts());
let viewYear = currentYear;
let selectedCell = null;
let selectedYearCell = null;
let guideTouched = false;

// ---- Names and wording ---------------------------------------------------------------------------

const palaceName = (p) => (p === 'c' ? t('Centre', '中宫') : t(PALACES_EN[p], PALACES_ZH[p]));
const palaceShort = (p) => (p === 'c' ? t('C', '中') : t(PALACES[p], PALACES_ZH[p]));
const mountainName = (m) => (lang() === 'zh' ? `${MOUNTAINS[m]}山` : `${MOUNTAINS[m]} ${mountainLabel(m)}`);
const starName = (n) => (lang() === 'zh' ? `${STARS[n].zh}${STARS[n].elZh}星` : `${STARS[n].en} ${STARS[n].el[0].toUpperCase()}${STARS[n].el.slice(1)}`);
const palaceMountains = (p) => [0, 1, 2].map((i) => MOUNTAINS[mod(p * 3 - 1 + i, 24)]).join('');
const range = (p) => `${mod(p * 45 - 22.5, 360)}°–${mod(p * 45 + 22.5, 360)}°`;
const mountainRange = (m) => `${mod(m * 15 - 7.5, 360)}°–${mod(m * 15 + 7.5, 360)}°`;
const fmtDeg = (d) => `${Number(d.toFixed(1))}°`;

const STAR_NOTES = [null,
  { en: 'career, wisdom, romance and new opportunities', zh: '事业、智慧、桃花、新机会' },
  { en: 'illness when out of time; land and property when timely', zh: '失令为病符；得令主田产' },
  { en: 'arguments, gossip and legal trouble', zh: '是非、口舌、官非' },
  { en: 'study, writing and romance', zh: '文昌、读书、桃花' },
  { en: 'misfortune, accidents and illness: the most harmful star', zh: '五黄廉贞：灾祸、疾病，最凶' },
  { en: 'authority, mentors and windfalls', zh: '权力、贵人、偏财' },
  { en: 'robbery, betrayal and injury when out of time', zh: '失令主盗劫、破财、伤灾' },
  { en: 'wealth and property; retreating in Period 9', zh: '财帛、置业；九运退气' },
  { en: 'celebrations, fame and current prosperity', zh: '喜庆、名声；九运当旺' },
];
const TIMELINESS = {
  prosperous: { en: 'prosperous (旺)', zh: '当旺', cls: 'good' },
  growing: { en: 'growing (生)', zh: '生气', cls: 'good' },
  retreating: { en: 'retreating (退)', zh: '退气', cls: 'mixed' },
  dormant: { en: 'out of time (衰)', zh: '失令', cls: 'dim' },
  harmful: { en: 'harmful (煞)', zh: '煞气', cls: 'hard' },
};
// Traditional cures, kept to what the classics and most modern schools agree on.
const CURES = {
  5: { en: 'Keep this area quiet: no renovation or digging. Metal (brass, a six-coin hanger) is the usual cure; avoid red and fire.', zh: '宜静不宜动：勿装修动土。常用金属化解（铜葫芦、六帝钱）；忌红色与火。' },
  2: { en: 'Metal weakens it; avoid red and fire. Not a good place for a sick person to sleep.', zh: '以金泄之；忌红色与火。病人不宜睡此方。' },
  3: { en: 'Red or a soft light calms it; avoid adding water or plants.', zh: '宜用红色或灯光化解；忌放水、植物。' },
  7: { en: 'Still water or blue calms it; avoid adding metal.', zh: '宜静水或蓝色；忌加金属。' },
};
const FEATURES = {
  wangShanWangXiang: { en: 'Prosperous sitting and facing (旺山旺向): the period star of the mountain sits behind and the water star in front. The best kind of chart for health and wealth.', zh: '旺山旺向：山星当运星到坐，向星当运星到向，丁财两旺，为最佳格局。', tone: 'good' },
  shangShanXiaShui: { en: 'Reversed (上山下水): the period stars are back to front. Traditionally hard on both health and money unless the land outside suits it (water behind, a mountain in front).', zh: '上山下水：当运山星到向、向星到坐，损丁破财，除非屋后有水、屋前有山。', tone: 'bad' },
  doubleAtFacing: { en: 'Double stars at the facing (双星到向): both period stars sit at the front. Good for wealth if the front is open with water or movement; weaker for health and relationships.', zh: '双星到向：两颗当运星同到向首。门前开阔见水旺财，人丁稍弱。', tone: 'mixed' },
  doubleAtSitting: { en: 'Double stars at the sitting (双星到坐): both period stars sit at the back. Good for health and people if the back is solid or higher; a water feature or open space behind brings wealth.', zh: '双星到坐：两颗当运星同到坐山。屋后有靠旺丁；屋后见水亦可旺财。', tone: 'mixed' },
  combineTenMountain: { en: 'Combination of ten (合十) between the base and mountain stars in every palace: smooth luck for people and health.', zh: '山星与运星合十：通气，利人丁。', tone: 'good' },
  combineTenWater: { en: 'Combination of ten (合十) between the base and facing stars in every palace: smooth luck for money.', zh: '向星与运星合十：通气，利财。', tone: 'good' },
  parentString: { en: 'Parent string (父母三般卦): every palace holds stars of one family (1-4-7, 2-5-8 or 3-6-9). A rare, strong chart.', zh: '父母三般卦：每宫星数同属一四七、二五八或三六九，格局难得。', tone: 'good' },
  pearlString: { en: 'Pearl string (连珠三般卦): every palace holds three consecutive stars. A rare, strong chart.', zh: '连珠三般卦：每宫三星相连，格局难得。', tone: 'good' },
  fuYinMountain: { en: 'The mountain stars are in Fu Yin (伏吟): the 5 flies forward and every star sits in its own home. Traditionally unsettled for people.', zh: '山星伏吟：五黄顺飞入中，诸星归原位，主人丁不安。', tone: 'bad' },
  fanYinMountain: { en: 'The mountain stars are in Fan Yin (反吟): the 5 flies backward, opposite every home. Traditionally unsettled for people.', zh: '山星反吟：五黄逆飞入中，诸星反位，主人丁不安。', tone: 'bad' },
  fuYinWater: { en: 'The facing stars are in Fu Yin (伏吟): the 5 flies forward. Traditionally unsettled for money.', zh: '向星伏吟：五黄顺飞入中，主财运不稳。', tone: 'bad' },
  fanYinWater: { en: 'The facing stars are in Fan Yin (反吟): the 5 flies backward. Traditionally unsettled for money.', zh: '向星反吟：五黄逆飞入中，主财运不稳。', tone: 'bad' },
};
// Palaces of each element: Wood E/SE, Fire S, Earth NE/SW, Metal W/NW, Water N.
const ELEMENT_PALACES = [[2, 3], [4], [1, 5], [6, 7], [0]];

// Each palace's family member (Later Heaven trigrams) and the body parts it is linked with.
const PALACE_PEOPLE = [
  { role: 'middleSon', en: 'middle son', zh: '中男', body: 'ears, kidneys', bodyZh: '耳、肾' },
  { role: 'youngestSon', en: 'youngest son', zh: '少男', body: 'hands, back', bodyZh: '手、背' },
  { role: 'eldestSon', en: 'eldest son', zh: '长男', body: 'feet, liver', bodyZh: '足、肝' },
  { role: 'eldestDaughter', en: 'eldest daughter', zh: '长女', body: 'hips, thighs', bodyZh: '股、胆' },
  { role: 'middleDaughter', en: 'middle daughter', zh: '中女', body: 'eyes, heart', bodyZh: '目、心' },
  { role: 'mother', en: 'mother', zh: '母亲', body: 'stomach', bodyZh: '腹、胃' },
  { role: 'youngestDaughter', en: 'youngest daughter', zh: '少女', body: 'mouth, lungs', bodyZh: '口、肺' },
  { role: 'father', en: 'father', zh: '父亲', body: 'head, lungs', bodyZh: '头、肺' },
];
const ROLE_ORDER = ['father', 'mother', 'eldestSon', 'middleSon', 'youngestSon', 'eldestDaughter', 'middleDaughter', 'youngestDaughter'];
const rolePalace = (role) => PALACE_PEOPLE.findIndex((x) => x.role === role);
const roleName = (role) => { const x = PALACE_PEOPLE[rolePalace(role)]; return x ? t(x.en, x.zh) : ''; };
const roleOptions = (sel) => `<option value="">${t('Role in the family (optional)', '家中角色（可不填）')}</option>${ROLE_ORDER.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${esc(roleName(r).replace(/^./, (c) => c.toUpperCase()))}</option>`).join('')}`;

// Who a palace stands for in the family, and who in the household has that role.
function familyLine(p, watch) {
  if (p === 'c') return '';
  const x = PALACE_PEOPLE[p];
  const names = state.people.filter((q) => q.role === x.role).map((q) => esc(q.name || t('Someone', '某人')));
  const who = names.length ? t(` (${names.join(', ')})`, `（${names.join('、')}）`) : '';
  return t(`<b>Family:</b> the ${TRIGRAMS[p]} sector stands for the ${x.en}${who}; body: ${x.body}.${watch ? ` With ${watch} here, traditionally the ${x.en} is the one to look after.` : ''}`,
    `<b>家人：</b>${TRIGRAMS[p]}宫主${x.zh}${who}，身体主${x.bodyZh}。${watch ? `此方有${watch}，传统上要多照顾${x.zh}。` : ''}`);
}
const badStars = (list) => [...new Set(list.filter((n) => n === 5 || n === 2))].map((n) => t(STARS[n].en, STARS[n].zh)).join(t(' and ', '、'));

// ---- Grid ----------------------------------------------------------------------------------------

const ORDER = { north: [7, 0, 1, 6, 'c', 2, 5, 4, 3], south: [3, 4, 5, 2, 'c', 6, 1, 0, 7] };
function gridHtml(cell) {
  return ORDER[state.home.orient].map((p) => {
    const { cls = '', body, label = true } = cell(p);
    return `<button type="button" class="fs-cell ${cls}" data-cell="${p}">${label ? `<span class="fs-palace">${palaceShort(p)}${p === 'c' ? '' : ` <i>${TRIGRAMS[p]}</i>`}</span>` : ''}${body}</button>`;
  }).join('');
}
const starCls = (n, period) => `ts-${TIMELINESS[timeliness(n, period)].cls}`;

// ---- Home tab ------------------------------------------------------------------------------------

function homeInputs() {
  const deg = parseFloat(state.home.facing);
  const facing = Number.isFinite(deg) ? mod(deg, 360) : null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.home.moveIn || '');
  const moveYear = m ? solarYear(Number(m[1]), Number(m[2]), Number(m[3])) : null;
  const period = state.home.period === 'auto' ? (moveYear ? periodOf(moveYear) : null) : Number(state.home.period);
  return { facing, moveYear, period };
}

function renderHome() {
  const { facing, moveYear, period } = homeInputs();
  $('facing-line').innerHTML = facing == null ? '' : facingText(facing);
  fillPeriods(moveYear);
  const chart = facing != null && period ? houseChart(period, facing, state.home.replace) : null;
  $('home-empty').hidden = !!chart;
  $('home-result').hidden = !chart;
  if (!guideTouched) $('home-guide').open = !chart;
  if (!chart) {
    $('headline').textContent = t('Feng Shui', '风水');
    $('subline').textContent = t('Flying stars for your home, Kua directions for your family', '宅运飞星 · 家人命卦方位');
    return;
  }
  const yr = viewYear;
  const annual = fly(annualStar(yr));
  const aff = afflictions(yr);
  $('headline').textContent = t(`${MOUNTAINS[chart.sitting]} sitting, ${MOUNTAINS[chart.facing]} facing`, `${MOUNTAINS[chart.sitting]}山${MOUNTAINS[chart.facing]}向`);
  $('headline').classList.toggle('cjk', lang() === 'zh');
  const [ps, pe] = periodRange(period, moveYear || currentYear);
  $('subline').textContent = t(`Period ${period} house (${ps}–${pe}) · ${fmtDeg(chart.facingDeg)}`, `${period}运宅（${ps}–${pe}）· ${fmtDeg(chart.facingDeg)}`);
  $('chart-title').textContent = t(`Period ${period} chart`, `${period}运飞星盘`);
  $('show-annual-label').textContent = t(`Show ${yr} annual stars`, `显示${yr}年流年星`);

  const show = state.home.showAnnual;
  $('house-grid').innerHTML = gridHtml((p) => {
    const at = (c) => (p === 'c' ? c.center : c.palaces[p]);
    const m = at(chart.mountain); const w = at(chart.water); const b = at(chart.base); const a = at(annual);
    const tags = [];
    if (p === chart.facingPalace) tags.push(`<span class="fs-tag face">${t('Facing', '向')}</span>`);
    if (p === chart.sittingPalace) tags.push(`<span class="fs-tag sit">${t('Sitting', '坐')}</span>`);
    if (show && p !== 'c' && [aff.threeKillings, mountainPalace(aff.taiSui), mountainPalace(aff.yearBreaker)].includes(p)) tags.push('<span class="fs-tag warn">!</span>');
    const combo = comboFor(m, w);
    return {
      cls: `${p === 'c' ? 'center' : ''} ${selectedCell === String(p) ? 'on' : ''} ${combo ? `combo-${combo.tone}` : ''}`,
      body: `<span class="fs-tags">${tags.join('')}</span>
        <span class="fs-stars"><b class="ms ${starCls(m, period)}">${m}</b><b class="ws ${starCls(w, period)}">${w}</b></span>
        <span class="fs-base">${b}${show ? `<em class="an ${a === 5 || a === 2 ? 'hard' : ''}">${a}</em>` : ''}</span>`,
    };
  });
  $('house-legend').innerHTML = `<span><b class="ms-key">${t('Left', '左')}</b> ${t('mountain star (people, health)', '山星（人丁、健康）')}</span>
    <span><b class="ws-key">${t('Right', '右')}</b> ${t('facing star (money)', '向星（财运）')}</span>
    <span>${t('Bottom: base star', '下：运星')}${show ? t(', annual star in a circle', '，圈内为流年星') : ''}</span>
    <span class="ts-good">■</span>${t('timely', '得令')} <span class="ts-mixed">■</span>${t('retreating', '退气')} <span class="ts-hard">■</span>${t('harmful', '煞')}`;
  renderCellDetail(chart, annual, aff);
  renderHouseSummary(chart);
  renderPlan(chart, annual, aff);
}

function facingText(deg) {
  const m = mountainOf(deg); const s = mod(m + 12, 24); const off = mountainOffset(deg);
  const side = Math.abs(off) <= 4.5 ? t('near the centre', '近中线') : t(`${Math.abs(off).toFixed(1)}° off centre (兼向)`, `偏离中线${Math.abs(off).toFixed(1)}°（兼向）`);
  return t(`Faces <b>${mountainName(m)}</b> (${mountainRange(m)}), ${side}; sits <b>${mountainName(s)}</b>.`,
    `向<b>${MOUNTAINS[m]}</b>（${mountainRange(m)}），${side}；坐<b>${MOUNTAINS[s]}</b>。`);
}

function fillPeriods(moveYear) {
  const sel = $('period');
  const auto = moveYear ? t(`Auto from the move-in date: Period ${periodOf(moveYear)}`, `按入住日期自动：${periodOf(moveYear)}运`) : t('Auto from the move-in date', '按入住日期自动');
  const opts = [['auto', auto]];
  for (let p = 1; p <= 9; p++) { const [a, b] = periodRange(p); opts.push([String(p), t(`Period ${p} (${a}–${b})`, `${p}运（${a}–${b}）`)]); }
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  sel.value = state.home.period;
}

function renderCellDetail(chart, annual, aff, box = $('cell-detail'), sel = selectedCell, extra = '') {
  if (sel == null) { box.innerHTML = t('Tap a sector to read it.', '点按任一宫位查看解释。'); return; }
  const p = sel === 'c' ? 'c' : Number(sel);
  const at = (c) => (p === 'c' ? c.center : c.palaces[p]);
  const m = at(chart.mountain); const w = at(chart.water); const a = at(annual);
  const lines = [];
  lines.push(`<strong>${palaceName(p)}${p === 'c' ? '' : ` · ${palaceMountains(p)} · ${range(p)}`}</strong>`);
  const star = (n, role) => {
    const tl = TIMELINESS[timeliness(n, chart.period)];
    return `${role}${t(': ', '：')}<b class="${starCls(n, chart.period)}">${starName(n)}</b>${t(', ', '，')}${t(tl.en, tl.zh)}${t(' — ', '——')}${t(STAR_NOTES[n].en, STAR_NOTES[n].zh)}${t('.', '。')}`;
  };
  lines.push(star(m, t('Mountain star (people, health, relationships)', '山星（人丁、健康、人缘）')));
  lines.push(star(w, t('Facing star (money, career)', '向星（财运、事业）')));
  const combo = comboFor(m, w);
  if (combo) lines.push(`<span class="fs-tone ${combo.tone}">${m}-${w}</span> ${t(combo.en, combo.zh)}${t('.', '。')}`);
  const advice = [];
  if (m === chart.period || timeliness(m, chart.period) === 'growing') advice.push(t('Good for a bedroom, or a solid wall, tall furniture or a quiet room (the mountain star likes stillness).', '宜作卧室，或放高柜、实墙，宜静（山星喜静）。'));
  if (w === chart.period || timeliness(w, chart.period) === 'growing') advice.push(t('Good for the main door, a living area, or water and movement (the facing star likes activity).', '宜开门、作客厅，或放水、多走动（向星喜动）。'));
  if (p === chart.facingPalace) advice.push(t('This is the front of the house.', '此为屋前向首。'));
  for (const n of new Set([m, w])) if (CURES[n]) advice.push(t(CURES[n].en, CURES[n].zh));
  if (advice.length) lines.push(advice.join(' '));
  if (state.home.showAnnual) {
    let ann = t(`${viewYear}: annual ${starName(a)}`, `${viewYear}年：流年${starName(a)}`);
    const comboA = comboFor(a, w);
    if (comboA && comboA.tone === 'bad') ann += t(`; with the facing star it forms ${a}-${w}: ${comboA.en}`, `；与向星成${a}-${w}：${comboA.zh}`);
    const hits = [];
    if (p !== 'c') {
      if (mountainPalace(aff.taiSui) === p) hits.push(t('Tai Sui', '太岁'));
      if (mountainPalace(aff.yearBreaker) === p) hits.push(t('Year Breaker', '岁破'));
      if (aff.threeKillings === p) hits.push(t('Three Killings', '三煞'));
    }
    if (hits.length) ann += t(`. Also ${hits.join(', ')}: avoid renovation and digging here this year.`, `。另逢${hits.join('、')}：今年此方勿动土装修。`);
    else ann += t('.', '。');
    if (a === 5 && m !== 5 && w !== 5) ann += ` ${t('Annual 5 Yellow: ', '流年五黄：')}${t(CURES[5].en, CURES[5].zh)}`;
    lines.push(ann);
  }
  const fam = familyLine(p, badStars(state.home.showAnnual ? [m, a] : [m]));
  if (fam) lines.push(fam);
  const who = peopleFor(p);
  if (who) lines.push(who);
  if (extra) lines.push(extra);
  box.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
}

// How the people in the household find a sector, by their Eight Mansions directions.
function peopleFor(p) {
  if (p === 'c' || !state.people.length) return '';
  return state.people.map((person) => {
    const k = kuaFor(person);
    if (!k) return '';
    const mz = MANSIONS[mansionAt(k, p)];
    return `${esc(person.name || t('Someone', '某人'))}: <span class="fs-tone ${mz.good ? 'good' : 'bad'}">${t(mz.en, mz.zh)}</span> ${t(mz.what, mz.whatZh)}`;
  }).filter(Boolean).join('<br>');
}

function renderHouseSummary(chart) {
  const out = [];
  const hk = houseKua(chart.sittingPalace);
  out.push(`<h2>${t('Reading', '解读')}</h2>`);
  out.push('<dl>');
  if (chart.features.length) {
    for (const f of chart.features) {
      const x = FEATURES[f];
      out.push(`<dt><span class="fs-tone ${x.tone}">●</span> ${t(x.en.split(':')[0].split(' (')[0], x.zh.split('：')[0])}</dt><dd>${t(x.en, x.zh)}</dd>`);
    }
  }
  if (chart.useReplacement) {
    out.push(`<dt>${t('Replacement stars (替卦)', '替卦')}</dt><dd>${chart.replaced
      ? t(`The facing is ${Math.abs(chart.offset).toFixed(1)}° off the mountain's centre, so replacement stars are used. Some schools don't: switch them off under More settings to compare.`, `朝向偏离山中线${Math.abs(chart.offset).toFixed(1)}°，用替卦起星。部分门派不用替卦，可在进阶设置中关闭比较。`)
      : t('Replacement stars are on, but for this facing they give the same chart.', '已用替卦，但此朝向替卦与下卦相同。')}</dd>`);
  }
  if (chart.nearPalaceLine || chart.nearMountainLine) {
    out.push(`<dt class="fs-tone bad">${t('On a boundary line', '空亡线')}</dt><dd>${chart.nearPalaceLine
      ? t('The facing is within 1.5° of the line between two trigrams (大空亡). Traditionally such a house is unstable and the chart is unreliable; re-measure carefully.', '朝向落在两卦交界1.5°内（大空亡），传统认为宅运不稳、飞星难断，请仔细复测。')
      : t('The facing is within 1.5° of the line between two mountains (小空亡). Re-measure; a degree either way changes the chart.', '朝向落在两山交界1.5°内（小空亡），请复测；差一两度飞星即不同。')}</dd>`);
  }
  out.push(`<dt>${t('House trigram (宅卦)', '宅卦')}</dt><dd>${t(
    `Sitting ${PALACES_EN[chart.sittingPalace]}: a ${TRIGRAMS[chart.sittingPalace]} house, ${isEastGroup(hk) ? 'East' : 'West'} group.`,
    `坐${PALACES_ZH[chart.sittingPalace]}：${TRIGRAMS[chart.sittingPalace]}宅，属${isEastGroup(hk) ? '东' : '西'}四宅。`)}${groupMatch(hk)}</dd>`);
  const best = [];
  for (let p = 0; p < 8; p++) if (chart.water.palaces[p] === chart.period) best.push(p);
  const bestM = [];
  for (let p = 0; p < 8; p++) if (chart.mountain.palaces[p] === chart.period) bestM.push(p);
  out.push(`<dt>${t('Where to focus', '重点')}</dt><dd>${t(
    `Wealth star ${chart.period} is in the ${best.map((p) => PALACES_EN[p]).join(', ') || 'centre'}: keep it open, bright and active. Health star ${chart.period} is in the ${bestM.map((p) => PALACES_EN[p]).join(', ') || 'centre'}: a good place to sleep or to keep solid and quiet.`,
    `${chart.period}运向星（财）在${best.map((p) => PALACES_ZH[p]).join('、') || '中宫'}：宜开阔、明亮、多动。${chart.period}运山星（丁）在${bestM.map((p) => PALACES_ZH[p]).join('、') || '中宫'}：宜作卧室，宜静宜实。`)}</dd>`);
  out.push('</dl>');
  $('house-summary').innerHTML = out.join('');
}

function groupMatch(hk) {
  const lines = state.people.map((person) => {
    const k = kuaFor(person);
    if (!k) return '';
    const same = isEastGroup(k) === isEastGroup(hk);
    return `${esc(person.name || t('Someone', '某人'))} (${t('Kua', '命卦')} ${k}): ${same ? t('same group, a good match', '同组，相配') : t('other group: use your own good directions for the bed and desk', '不同组：床头、书桌宜用个人吉方')}`;
  }).filter(Boolean);
  return lines.length ? `<br>${lines.join('<br>')}` : '';
}

// ---- Floor plan ----------------------------------------------------------------------------------

let planUrl = null;
let planSize = null; // natural width and height of the image
let planMode = 'read';
let planCell = null; // index 0–8 of the tapped square
let planDrag = null;
let planZoom = 1;
let pickingDoor = false;
let justMarkedDoor = false;
const ZOOMS = [1, 1.5, 2, 3];
const planHeight = () => (1000 * planSize[1]) / planSize[0];

async function loadPlanImage() {
  let blob = null;
  try { blob = await getPlan(); } catch { /* no IndexedDB: the plan just isn't kept */ }
  setPlanBlob(blob, false);
}

function setPlanBlob(blob, save = true) {
  if (planUrl) URL.revokeObjectURL(planUrl);
  planUrl = blob ? URL.createObjectURL(blob) : null;
  planSize = null;
  if (save) (blob ? putPlan(blob) : deletePlan()).catch(() => {});
  if (!blob) { renderHome(); return; }
  const img = $('plan-img');
  img.onload = () => {
    planSize = [img.naturalWidth, img.naturalHeight];
    if (!state.plan.grid) {
      const H = planHeight();
      const r = state.plan.rect; // grids saved before turning was possible
      state.plan.grid = r ? { cx: (r[0] + r[2]) * 500, cy: ((r[1] + r[3]) / 2) * H, w: (r[2] - r[0]) * 1000, h: (r[3] - r[1]) * H, angle: 0 } : autoGrid(img);
      delete state.plan.rect;
      persist();
    }
    renderHome();
  };
  img.src = planUrl;
}

// Start the grid on the plan's walls, turned to match them, or with a margin if none are found.
function autoGrid(img) {
  const H = planHeight();
  try {
    const w = 300; const h = Math.max(1, Math.round((300 * img.naturalHeight) / img.naturalWidth));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
    const f = fitOutline(gray, w, h);
    const k = 1000 / w;
    if (f) return { cx: f.cx * k, cy: f.cy * k, w: f.w * k, h: f.h * k, angle: f.angle };
  } catch { /* fall back to a margin */ }
  return { cx: 500, cy: H / 2, w: 800, h: H * 0.8, angle: 0 };
}

function renderPlan(chart, annual, aff) {
  const has = !!planUrl;
  $('plan-empty').hidden = has;
  $('plan-view').hidden = !has;
  if (!has || !planSize || !state.plan.grid) return;
  const pl = state.plan;
  const g = pl.grid;
  const fitting = planMode === 'fit';
  if (pl.door) { // the door mark decides the side, wherever the grid goes
    const side = nearestSide(g, pl.door);
    if (side !== pl.side) { pl.side = side; persist(); }
  }
  $('plan-door').textContent = pickingDoor ? t('Tap the main door on the plan…', '请在图上点大门位置…') : pl.door ? t('📍 Move the main door mark', '📍 重新标大门') : t('📍 Mark the main door on the plan', '📍 在图上标出大门');
  $('plan-door').classList.toggle('primary', !pl.door || pickingDoor);
  $('plan-door').classList.toggle('secondary', !!pl.door && !pickingDoor);
  document.querySelector(`input[name="plan-side"][value="${pl.side}"]`).checked = true;
  document.querySelector(`input[name="plan-mode"][value="${planMode}"]`).checked = true;
  $('plan-fit-controls').hidden = !fitting;
  $('plan-angle').value = g.angle;
  $('plan-angle-out').textContent = `${Number(g.angle.toFixed(1))}°`;
  $('plan-zoom-out').textContent = `${Math.round(planZoom * 100)}%`;
  $('plan-stage').style.width = `${planZoom * 100}%`;
  const layers = [['stars', t('Flying stars', '飞星')], ...state.people.flatMap((p, i) => (kuaFor(p) ? [[`p${i}`, `${p.name || t('Someone', '某人')} · ${t('Eight Mansions', '八宅')}`]] : []))];
  if (!layers.some(([v]) => v === pl.layer)) pl.layer = 'stars';
  $('plan-layer').innerHTML = layers.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  $('plan-layer').value = pl.layer;
  $('plan-layer-field').hidden = layers.length < 2;

  const W = 1000;
  const H = planHeight();
  const x0 = g.cx - g.w / 2; const y0 = g.cy - g.h / 2; const x1 = g.cx + g.w / 2; const y1 = g.cy + g.h / 2;
  const cw = g.w / 3; const ch = g.h / 3;
  const unit = Math.max(14, Math.min(cw, ch));
  const palaces = gridPalaces(chart.facingPalace, pl.side);
  const person = pl.layer.startsWith('p') ? state.people[Number(pl.layer.slice(1))] : null;
  const kua = person ? kuaFor(person) : null;
  const svg = $('plan-svg');
  const px = svg.getBoundingClientRect().width;
  const scale = px > 0 ? W / px : 3; // plan units per screen pixel
  const out = [`<defs><pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12" class="hatch"/></pattern></defs>`];
  out.push(`<g transform="rotate(${g.angle} ${g.cx} ${g.cy})">`);
  for (let i = 0; i < 9; i++) {
    const p = palaces[i];
    const cx = x0 + (i % 3) * cw; const cy = y0 + Math.floor(i / 3) * ch;
    const at = (c) => (p === 'c' ? c.center : c.palaces[p]);
    const missing = pl.missing.includes(i);
    let tone = '';
    let main = '';
    let sub = '';
    if (kua) {
      if (p === 'c') { main = String(kua); sub = t('Kua', '命卦'); } else {
        const mz = MANSIONS[mansionAt(kua, p)];
        tone = mz.good ? 'good' : 'bad';
        main = t(mz.en, mz.zh);
        sub = t(mz.what, mz.whatZh);
      }
    } else {
      const m = at(chart.mountain); const w = at(chart.water);
      tone = comboFor(m, w)?.tone || '';
      main = `<tspan class="${starCls(m, chart.period)}">${m}</tspan> <tspan class="${starCls(w, chart.period)}">${w}</tspan>`;
      sub = state.home.showAnnual ? `${at(chart.base)} · ${t('year', '年')} ${at(annual)}` : String(at(chart.base));
    }
    const big = kua && p !== 'c' ? unit * 0.2 : unit * 0.34;
    const label = `${palaceShort(p)}${p === 'c' ? '' : ` ${TRIGRAMS[p]}`}${p === chart.facingPalace ? ` · ${t('Facing', '向')}` : ''}${missing ? ` · ${t('missing', '缺角')}` : ''}`;
    out.push(`<g class="pcell ${fitting ? '' : tone} ${missing ? 'missing' : ''} ${planCell === i && !fitting ? 'on' : ''}" data-sq="${i}">
      <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" class="pfill"/>
      ${missing ? `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="url(#hatch)"/>` : ''}
      ${fitting ? `<text x="${cx + cw / 2}" y="${cy + ch / 2}" class="plabel faint" style="font-size:${Math.max(unit * 0.13, 11 * scale)}px">${palaceShort(p)}</text>` : `
      <text x="${cx + cw / 2}" y="${cy + ch * 0.2}" class="plabel" style="font-size:${unit * 0.13}px">${label}</text>
      <text x="${cx + cw / 2}" y="${cy + ch * 0.52}" class="pmain" style="font-size:${big}px">${main}</text>
      <text x="${cx + cw / 2}" y="${cy + ch * 0.78}" class="psub" style="font-size:${unit * 0.12}px">${esc(sub)}</text>`}
    </g>`);
  }
  for (let k = 1; k < 3; k++) {
    out.push(`<line x1="${x0 + k * cw}" y1="${y0}" x2="${x0 + k * cw}" y2="${y1}" class="pline"/><line x1="${x0}" y1="${y0 + k * ch}" x2="${x1}" y2="${y0 + k * ch}" class="pline"/>`);
  }
  out.push(`<rect x="${x0}" y="${y0}" width="${g.w}" height="${g.h}" class="pframe" style="stroke-width:${2 * scale}px"/>`);
  // The door side, drawn as a thick edge.
  const door = { top: [x0, y0, x1, y0], bottom: [x0, y1, x1, y1], left: [x0, y0, x0, y1], right: [x1, y0, x1, y1] }[pl.side];
  out.push(`<line x1="${door[0]}" y1="${door[1]}" x2="${door[2]}" y2="${door[3]}" class="pdoor" style="stroke-width:${5 * scale}px"/>`);
  if (fitting) {
    // Handles a finger can hit: about 26 px across on screen, whatever the zoom.
    const r = 13 * scale;
    for (const [hx, hy, h] of [[g.cx, y0, 't'], [x1, g.cy, 'r'], [g.cx, y1, 'b'], [x0, g.cy, 'l']]) {
      const horiz = h === 't' || h === 'b';
      out.push(`<rect x="${hx - (horiz ? 2.2 : 0.8) * r}" y="${hy - (horiz ? 0.8 : 2.2) * r}" width="${(horiz ? 4.4 : 1.6) * r}" height="${(horiz ? 1.6 : 4.4) * r}" rx="${0.8 * r}" class="phandle" data-h="${h}" style="stroke-width:${2 * scale}px"/>`);
    }
    for (const [hx, hy, h] of [[x0, y0, 'tl'], [x1, y0, 'tr'], [x0, y1, 'bl'], [x1, y1, 'br']]) out.push(`<circle cx="${hx}" cy="${hy}" r="${r}" class="phandle" data-h="${h}" style="stroke-width:${2 * scale}px"/>`);
  }
  out.push('</g>');
  // A compass drawn from the measured facing: the door side points along the facing bearing.
  const rose = (bx, by, R) => {
    const pt = (bearing, len) => {
      const a = (screenAngleOf(g, pl.side, chart.facingDeg, bearing) * Math.PI) / 180;
      return [bx + Math.cos(a) * len, by + Math.sin(a) * len];
    };
    const parts = [`<circle cx="${bx}" cy="${by}" r="${R * 1.05}" class="prose-bg"/>`];
    for (let b = 0; b < 360; b += 45) {
      const [x, y] = pt(b, b % 90 ? R * 0.55 : R * 0.7);
      parts.push(`<line x1="${bx}" y1="${by}" x2="${x}" y2="${y}" class="${b === 0 ? 'prose-n' : 'prose-l'}" style="stroke-width:${(b === 0 ? 3 : 1.2) * scale}px"/>`);
    }
    for (const [b, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const [x, y] = pt(b, R * 0.88);
      parts.push(`<text x="${x}" y="${y}" class="prose-t ${b === 0 ? 'n' : ''}" style="font-size:${11 * scale}px">${t(lab, { N: '北', E: '东', S: '南', W: '西' }[lab])}</text>`);
    }
    return parts.join('');
  };
  const R = 34 * scale;
  out.push(rose(Math.min(W - R * 1.2, Math.max(R * 1.2, W - R * 1.3)), R * 1.3, R));
  if (pl.door) {
    const [dx, dy] = pl.door;
    out.push(`<circle cx="${dx}" cy="${dy}" r="${9 * scale}" class="pdoor-pin" style="stroke-width:${2.5 * scale}px"/>
      <text x="${dx}" y="${dy - 20 * scale}" class="pdoor-label" style="font-size:${11 * scale}px;text-anchor:${dx > W * 0.65 ? 'end' : dx < W * 0.35 ? 'start' : 'middle'}">${t(`Door · facing ${fmtDeg(chart.facingDeg)} ${PALACES[palaceOf(chart.facingDeg)]}`, `大门 · 向${fmtDeg(chart.facingDeg)} ${PALACES_ZH[palaceOf(chart.facingDeg)]}`)}</text>`);
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = out.join('');
  renderWallCheck(chart);
  svg.classList.toggle('fitting', fitting);
  $('plan-help').textContent = pickingDoor ? t('Tap the spot on the plan where the main door is.', '在图上点大门的位置。') : fitting
    ? t('Drag the corners and edges onto the flat\'s outer walls (include the household shelter and service yard, not the common corridor). Drag inside the grid to move it, and outside it to scroll when zoomed in. Use Turn if the plan is at an angle.', '拖动四角和四边对准单位外墙（含防空壕和后阳台，不含公共走廊）。在格内拖动可整体移动，放大后在格外拖动可滚动。图纸是斜的就用“转动”。')
    : planMode === 'missing'
      ? t('Tap the squares that are mostly outside the flat to mark them as missing corners.', '点按大部分在单位外的格子，标为缺角。')
      : t('Tap a square to read that part of your home. To move, resize or turn the grid, tap Fit grid above.', '点按格子查看屋内该区的解读。要移动、缩放或转动格子，请点上方的“对齐格子”。');
  if (planCell == null || fitting) { $('plan-detail').innerHTML = fitting ? '' : t('Tap a square to read it.', '点按格子查看解释。'); $('plan-detail').hidden = fitting; return; }
  $('plan-detail').hidden = false;
  const p = palaces[planCell];
  const extra = pl.missing.includes(planCell) && p !== 'c'
    ? t(`<b>Missing corner:</b> traditionally the ${PALACE_PEOPLE[p].en} and the matters of ${PALACES_EN[p]} are weaker. A mirror on that wall, or good light there, is the usual remedy.`, `<b>缺角：</b>传统认为${PALACE_PEOPLE[p].zh}及${PALACES_ZH[p]}方之事较弱。常在该墙挂镜或加强照明以补。`)
    : '';
  renderCellDetail(chart, annual, aff, $('plan-detail'), String(p), extra);
}

// Which way each outer wall of the plan should face, from the measured door facing, so it can be checked
// at a window with the compass even when the plan has no north arrow.
const SIDE_TURN = { top: 0, right: 90, bottom: 180, left: 270 };
function renderWallCheck(chart) {
  const side = state.plan.side;
  const sideName = { top: t('top', '上'), right: t('right', '右'), bottom: t('bottom', '下'), left: t('left', '左') };
  const rows = ['top', 'right', 'bottom', 'left'].map((s2) => {
    const b = mod(chart.facingDeg + SIDE_TURN[s2] - SIDE_TURN[side], 360);
    const dir = t(PALACES_EN[palaceOf(b)], PALACES_ZH[palaceOf(b)]);
    return `<li><b>${sideName[s2]}</b>${t(' side', '边')}${s2 === side ? t(' (main door)', '（大门）') : ''}: ${t('faces', '朝')} ${fmtDeg(b)} ${dir}</li>`;
  }).join('');
  $('plan-check').innerHTML = `<p>${t('<b>No north arrow on your plan?</b> No problem: the compass on the plan comes from your measurement. To double-check it, stand at a window on another side of the flat, look straight out, and read the Compass tab. It should be close to:', '<b>户型图没有北方箭头？</b>没关系：图上的指南针是按你量的朝向画的。要复核，可站在另一边的窗前向外看，用“罗盘”页读数，应接近：')}</p>
    <ul>${rows}</ul>
    <p>${t('Within about 10° is fine (phones and walls are rarely exact). If it\'s far off, the main door mark or the measured facing is wrong.', '相差10°以内都正常（手机和墙都不会完全精准）。相差很大就是大门位置标错或朝向量错了。')}</p>`;
}

function svgPoint(e) {
  const svg = $('plan-svg');
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [p.x, p.y];
}

function planPointerDown(e) {
  if (pickingDoor) {
    state.plan.door = svgPoint(e);
    pickingDoor = false;
    justMarkedDoor = true;
    persist();
    renderHome();
    e.preventDefault();
    return;
  }
  if (planMode !== 'fit') return;
  const at = svgPoint(e);
  const h = e.target.closest('[data-h]')?.dataset.h;
  const box = $('plan-box');
  if (h || insideGrid(state.plan.grid, at)) planDrag = { h: h || 'move', start: at, grid: { ...state.plan.grid } };
  else planDrag = { h: 'pan', x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop };
  $('plan-svg').setPointerCapture(e.pointerId);
  e.preventDefault();
}

function planPointerMove(e) {
  if (!planDrag) return;
  if (planDrag.h === 'pan') {
    const box = $('plan-box');
    box.scrollLeft = planDrag.left - (e.clientX - planDrag.x);
    box.scrollTop = planDrag.top - (e.clientY - planDrag.y);
    return;
  }
  state.plan.grid = dragGrid(planDrag.grid, planDrag.h, planDrag.start, svgPoint(e));
  renderHome();
}

function planPointerUp() {
  if (!planDrag) return;
  planDrag = null;
  persist();
}

function planClick(e) {
  if (justMarkedDoor) { justMarkedDoor = false; return; } // the tap that placed the door mark
  if (planMode === 'fit') return;
  const g = e.target.closest('[data-sq]');
  if (!g) return;
  const i = Number(g.dataset.sq);
  if (planMode === 'missing') {
    const m = state.plan.missing;
    state.plan.missing = m.includes(i) ? m.filter((x) => x !== i) : [...m, i].filter((x) => x !== 4);
    persist();
  }
  planCell = i;
  renderHome();
}

function setGrid(patch) {
  state.plan.grid = { ...state.plan.grid, ...patch };
  persist();
  renderHome();
}

function setZoom(z) {
  const box = $('plan-box');
  const fx = (box.scrollLeft + box.clientWidth / 2) / box.scrollWidth;
  const fy = (box.scrollTop + box.clientHeight / 2) / box.scrollHeight;
  planZoom = z;
  renderHome();
  box.scrollLeft = fx * box.scrollWidth - box.clientWidth / 2;
  box.scrollTop = fy * box.scrollHeight - box.clientHeight / 2;
  renderHome(); // handles are sized from the new on-screen width
}

async function pickPlan(file) {
  if (!file) return;
  $('plan-status').textContent = t('Loading…', '载入中…');
  try {
    const blob = await fileToPlan(file);
    state.plan = { ...state.plan, grid: null, missing: [], door: null };
    planMode = 'fit';
    planCell = null;
    planZoom = 1;
    persist();
    setPlanBlob(blob);
    $('plan-status').textContent = '';
  } catch {
    $('plan-status').textContent = t('Couldn’t open that file. Try a screenshot or photo of the plan instead.', '无法打开此文件，请改用平面图的截图或照片。');
  }
}

// ---- People tab ----------------------------------------------------------------------------------

function kuaFor(person) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.date || '');
  if (!m || !person.gender) return null;
  return kuaOf(solarYear(Number(m[1]), Number(m[2]), Number(m[3])), person.gender);
}

// Favourable elements from a BaZi app form, using the same birthplace handling as that app.
function baziFavour(form) {
  if (!form || !form.date) return null;
  const birth = parseBirth(form.date, form.noTime ? '' : form.time);
  if (!birth || !form.gender) return null;
  try {
    const place = placeFor(form, birth);
    const chart = computeChart({
      ...birth, tzOffset: place.tz, gender: form.gender, ziStartsDay: form.ziDay !== false,
      trueSolar: form.trueSolar && Number.isFinite(place.lon), longitude: place.lon,
    });
    return { chart, strength: analyseStrength(chart) };
  } catch { return null; }
}

function renderPeople() {
  const role = $('p-role').value;
  $('p-role').innerHTML = roleOptions(role);
  if (!state.people.length) {
    $('people').innerHTML = `<div class="card"><p class="hint">${t('Add each person in the home to see their Kua number and good directions.', '添加家中每个人，查看命卦与吉凶方位。')}</p></div>`;
  } else {
    $('people').innerHTML = state.people.map((person, i) => personCard(person, i)).join('');
  }
  renderBaziImport();
}

function personCard(person, i) {
  const k = kuaFor(person);
  const m = /^(\d{4})/.exec(person.date || '');
  const y = k ? solarYear(...person.date.split('-').map(Number)) : null;
  const animal = y ? t(ANIMALS[yearBranch(y)], ANIMALS_ZH[yearBranch(y)]) : '';
  const head = `<div class="row-head"><h2>${esc(person.name || t('Someone', '某人'))} <small>${m ? m[1] : ''}${animal ? ` · ${animal}` : ''}</small></h2>
    <button class="secondary small" type="button" data-del="${i}" aria-label="${t('Remove', '删除')}">✕</button></div>
    <label class="field fs-role"><select data-role="${i}" aria-label="${t('Role in the family', '家中角色')}">${roleOptions(person.role || '')}</select></label>
    ${person.role ? `<p class="hint">${t(`As the ${roleName(person.role)}, their trigram sector is ${palaceName(rolePalace(person.role))} (${TRIGRAMS[rolePalace(person.role)]}).`, `作为${roleName(person.role)}，对应${palaceName(rolePalace(person.role))}（${TRIGRAMS[rolePalace(person.role)]}宫）。`)}</p>` : ''}`;
  if (!k) return `<div class="card">${head}</div>`;
  const group = isEastGroup(k) ? t('East group', '东四命') : t('West group', '西四命');
  const grid = `<div class="fs-grid fs-grid-small">${gridHtml((p) => {
    if (p === 'c') return { cls: 'center', body: `<span class="fs-kua">${k}</span><span class="fs-small">${t('Kua', '命卦')}</span>`, label: false };
    const mz = MANSIONS[mansionAt(k, p)];
    return { cls: `mz ${mz.good ? 'good' : 'bad'}`, body: `<span class="fs-mz">${t(mz.en, mz.zh)}</span><span class="fs-small">${t(mz.what, mz.whatZh)}</span>` };
  })}</div>`;
  const best = MANSIONS.slice(0, 4).map((mz, j) => `${t(mz.en, mz.zh)} ${palaceName(mansionPalacesOf(k)[j])}`).join(' · ');
  const tips = `<p class="hint">${t(`${group}, ${TRIGRAMS[mansionPalacesOf(k)[3]]} trigram. Best: ${best}.`, `${group}，${TRIGRAMS[mansionPalacesOf(k)[3]]}卦。吉方：${best}。`)}</p>
    <p class="hint">${t(`Sit facing ${palaceName(mansionPalacesOf(k)[0])} (Sheng Qi) at a desk; sleep with the headboard pointing to ${palaceName(mansionPalacesOf(k)[1])} (Tian Yi) or another good direction.`,
    `书桌宜面向${palaceName(mansionPalacesOf(k)[0])}（生气）；床头宜朝${palaceName(mansionPalacesOf(k)[1])}（天医）或其他吉方。`)}</p>`;
  return `<div class="card">${head}${grid}${tips}${person.bazi ? elementLine(person.bazi) : ''}</div>`;
}
const mansionPalacesOf = (k) => MANSIONS.map((_, j) => [0, 1, 2, 3, 4, 5, 6, 7].find((p) => mansionAt(k, p) === j));

function elementLine(form) {
  const r = baziFavour(form);
  if (!r) return '';
  const fav = r.strength.favourable;
  const els = fav.map((e) => `<span class="el-${ELEMENTS[e].id}">${t(ELEMENTS[e].en, ELEMENTS[e].zh)}</span>`).join(t(', ', '、'));
  const dirs = [...new Set(fav.flatMap((e) => ELEMENT_PALACES[e]))].sort((a, b) => a - b).map(palaceName).join(t(', ', '、'));
  return `<p class="explain">${t(`BaZi day master ${STEMS[r.chart.dayMaster]}; favourable elements ${els}. Their directions: ${dirs}. Colours and objects of these elements suit this person's rooms.`,
    `八字日主${STEMS[r.chart.dayMaster]}，喜用${els}，对应方位：${dirs}。房间可多用这些五行的颜色和物件。`)}</p>`;
}

function baziSaved() {
  try {
    const b = JSON.parse(localStorage.getItem(BAZI_KEY));
    const list = [...(b?.saved || []).map((s) => s.form)];
    if (b?.form?.date && !list.some((f) => f.date === b.form.date && f.name === b.form.name)) list.unshift(b.form);
    return list.filter((f) => f && f.date && f.gender);
  } catch { return []; }
}

function renderBaziImport() {
  const list = baziSaved().filter((f) => !state.people.some((p) => p.date === f.date && p.name === (f.name || '')));
  $('bazi-import').hidden = !list.length;
  $('bazi-list').innerHTML = list.map((f, i) => `<button class="secondary" type="button" data-import="${i}">+ ${esc(f.name || t('Unnamed', '未命名'))} <small>${esc(f.date)} · ${f.gender === 'male' ? t('M', '男') : t('F', '女')}</small></button>`).join('');
  $('bazi-list').onclick = (e) => {
    const b = e.target.closest('[data-import]');
    if (!b) return;
    const f = list[Number(b.dataset.import)];
    state.people.push({ name: f.name || '', date: f.date, gender: f.gender, bazi: f });
    persist();
    renderAll();
  };
}

function addPerson() {
  const name = $('p-name').value.trim();
  const date = $('p-date').value;
  const gender = document.querySelector('input[name="p-gender"]:checked')?.value;
  const err = !date ? t('Enter a date of birth.', '请输入出生日期。') : !gender ? t('Choose Male or Female: the Kua is counted differently.', '请选择男或女：命卦算法不同。') : '';
  $('p-error').hidden = !err;
  $('p-error').textContent = err;
  if (err) return;
  state.people.push({ name, date, gender, role: $('p-role').value });
  $('p-role').value = '';
  persist();
  $('p-name').value = '';
  $('p-date').value = '';
  document.querySelectorAll('input[name="p-gender"]').forEach((r) => { r.checked = false; });
  renderAll();
}

// ---- Year tab ------------------------------------------------------------------------------------

function renderYear() {
  const yr = viewYear;
  const b = yearBranch(yr);
  const stem = mod(yr - 4, 10);
  const center = annualStar(yr);
  const chart = fly(center);
  const aff = afflictions(yr);
  const now = Date.now();
  const thisMonth = yr === currentYear ? monthOf(yr, now) : null;
  $('year-title').textContent = t(`${yr} · ${STEMS[stem]}${BRANCHES[b]} ${ANIMALS[b]}`, `${yr} · ${STEMS[stem]}${BRANCHES[b]}${ANIMALS_ZH[b]}年`);
  $('year-line').textContent = t(`${starName(center)} in the centre. The year runs from 立春 (about 4 Feb ${yr}) to 立春 ${yr + 1}.`, `${starName(center)}入中。流年自${yr}年立春至${yr + 1}年立春。`);
  const mStar = thisMonth ? fly(thisMonth.star) : null;
  $('year-grid').innerHTML = gridHtml((p) => {
    const a = p === 'c' ? chart.center : chart.palaces[p];
    const mo = mStar ? (p === 'c' ? mStar.center : mStar.palaces[p]) : null;
    const tags = [];
    if (p !== 'c') {
      if (mountainPalace(aff.taiSui) === p) tags.push(`<span class="fs-tag warn">${t('Tai Sui', '太岁')}</span>`);
      if (mountainPalace(aff.yearBreaker) === p) tags.push(`<span class="fs-tag warn">${t('Breaker', '岁破')}</span>`);
      if (aff.threeKillings === p) tags.push(`<span class="fs-tag warn">${t('3 Killings', '三煞')}</span>`);
    }
    return {
      cls: `${p === 'c' ? 'center' : ''} ${selectedYearCell === String(p) ? 'on' : ''} ${a === 5 || a === 2 ? 'combo-bad' : ''}`,
      body: `<span class="fs-tags">${tags.join('')}</span><span class="fs-stars one"><b class="${a === 5 || a === 2 ? 'ts-hard' : a === 9 || a === 1 || a === 8 ? 'ts-good' : ''}">${a}</b></span>
        <span class="fs-base">${mo != null ? `<em class="an ${mo === 5 || mo === 2 ? 'hard' : ''}">${mo}</em>` : ''}</span>`,
    };
  });
  $('year-legend').innerHTML = thisMonth ? `<span>${t('Big: annual star · circle: this month\'s star', '大字：流年星 · 圈内：本月星')}</span>` : '';
  renderYearDetail(chart, mStar, aff);

  const sectors = (p) => `${palaceName(p)} (${range(p)})`;
  const mountainsLine = (m) => `${palaceName(mountainPalace(m))}, ${MOUNTAINS[m]} ${mountainRange(m)}`;
  $('year-afflictions').innerHTML = `<h2>${t('Sectors to respect', '流年煞方')}</h2><dl>
    <dt>${t('Tai Sui (太岁)', '太岁')}</dt><dd>${mountainsLine(aff.taiSui)}. ${t('The year\'s ruler. Don\'t renovate or dig here, and don\'t sit facing it (sit with your back to it instead).', '值年太岁：勿动土装修，宜坐太岁、勿向太岁。')}</dd>
    <dt>${t('Year Breaker (岁破)', '岁破')}</dt><dd>${mountainsLine(aff.yearBreaker)}. ${t('Opposite Tai Sui. Don\'t renovate here.', '太岁对冲之方，勿动土。')}</dd>
    <dt>${t('Three Killings (三煞)', '三煞')}</dt><dd>${sectors(aff.threeKillings)}. ${t('Don\'t start renovation here; sit with your back to it, never facing it.', '勿在此方开工动土；宜坐三煞，不可向三煞。')}</dd>
    <dt>${t('5 Yellow (五黄)', '五黄')}</dt><dd>${aff.fiveYellow == null ? t('In the centre this year.', '今年入中宫。') : sectors(aff.fiveYellow)}. ${aff.fiveYellow == null ? '' : affWho(aff.fiveYellow)}${t(CURES[5].en, CURES[5].zh)}</dd>
    <dt>${t('2 Black (二黑病符)', '二黑病符')}</dt><dd>${aff.twoBlack == null ? t('In the centre this year.', '今年入中宫。') : sectors(aff.twoBlack)}. ${aff.twoBlack == null ? '' : affWho(aff.twoBlack)}${t(CURES[2].en, CURES[2].zh)}</dd>
    <dt>${t('Good stars', '吉星')}</dt><dd>${[9, 1, 8, 4, 6].filter((n) => n !== center).map((n) => `${starName(n)}: ${palaceName(chart.palaces.indexOf(n))}`).join('<br>')}</dd>
  </dl>`;

  $('months').innerHTML = Array.from({ length: 12 }, (_, i) => {
    const s = monthStar(yr, i);
    const start = new Date(monthStartMs(yr, i) + 8 * 3600000);
    const label = `${start.getUTCDate()} ${start.toLocaleString(lang() === 'zh' ? 'zh' : 'en', { month: 'short', timeZone: 'UTC' })}`;
    const now5 = fly(s).palaces.indexOf(5);
    return `<div class="fs-month ${thisMonth && thisMonth.month === i ? 'now' : ''}">
      <small>${t(JIE[i].en, JIE[i].zh)} · ${label}</small>
      <b>${s}</b><small>${t('5 in', '五黄')} ${now5 < 0 ? t('centre', '中宫') : palaceShort(now5)}</small></div>`;
  }).join('');
}

// The family member a troubled sector traditionally affects, with their name if someone has that role.
function affWho(p) {
  const x = PALACE_PEOPLE[p];
  const names = state.people.filter((q) => q.role === x.role).map((q) => esc(q.name || t('Someone', '某人')));
  return t(`It sits in the ${x.en}'s sector${names.length ? ` (${names.join(', ')})` : ''}. `, `落在${x.zh}之位${names.length ? `（${names.join('、')}）` : ''}。`);
}

function renderYearDetail(chart, mStar, aff) {
  const box = $('year-detail');
  if (selectedYearCell == null) { box.innerHTML = t('Tap a sector to read it.', '点按任一宫位查看解释。'); return; }
  const p = selectedYearCell === 'c' ? 'c' : Number(selectedYearCell);
  const a = p === 'c' ? chart.center : chart.palaces[p];
  const lines = [`<strong>${palaceName(p)}${p === 'c' ? '' : ` · ${palaceMountains(p)} · ${range(p)}`}</strong>`,
    `${starName(a)}: ${t(STAR_NOTES[a].en, STAR_NOTES[a].zh)}.`];
  if (CURES[a]) lines.push(t(CURES[a].en, CURES[a].zh));
  if (mStar) {
    const mo = p === 'c' ? mStar.center : mStar.palaces[p];
    const c = comboFor(a, mo);
    lines.push(t(`This month: ${starName(mo)}`, `本月：${starName(mo)}`) + (c ? t(` — ${c.en}`, `——${c.zh}`) : '') + t('.', '。'));
  }
  const fam = familyLine(p, badStars([a]));
  if (fam) lines.push(fam);
  const who = peopleFor(p);
  if (who) lines.push(who);
  box.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
}

// ---- Compass -------------------------------------------------------------------------------------

let heading = null;
let gotAbsolute = false;
let smoothX = 0;
let smoothY = 0;
let drawPending = false;

function buildDial() {
  const parts = [];
  parts.push('<circle r="156" class="ring0"/><circle r="128" class="ring1"/><circle r="92" class="ring2"/><circle r="60" class="ring3"/>');
  for (let d = 0; d < 360; d += 5) {
    const a = (d - 90) * Math.PI / 180;
    const r = d % 45 === 0 ? 144 : d % 15 === 0 ? 149 : 152;
    parts.push(`<line x1="${(156 * Math.cos(a)).toFixed(1)}" y1="${(156 * Math.sin(a)).toFixed(1)}" x2="${(r * Math.cos(a)).toFixed(1)}" y2="${(r * Math.sin(a)).toFixed(1)}" class="tick"/>`);
  }
  for (let m = 0; m < 24; m++) {
    const edge = (m * 15 - 7.5 - 90) * Math.PI / 180;
    parts.push(`<line x1="${(92 * Math.cos(edge)).toFixed(1)}" y1="${(92 * Math.sin(edge)).toFixed(1)}" x2="${(128 * Math.cos(edge)).toFixed(1)}" y2="${(128 * Math.sin(edge)).toFixed(1)}" class="${m % 3 === 1 ? 'edge big' : 'edge'}"/>`);
    parts.push(`<text transform="rotate(${m * 15}) translate(0 -104)" class="mtn ${mountainPalace(m) % 2 ? '' : 'card'}">${MOUNTAINS[m]}</text>`);
  }
  for (let p = 0; p < 8; p++) {
    const edge = (p * 45 - 22.5 - 90) * Math.PI / 180;
    parts.push(`<line x1="${(60 * Math.cos(edge)).toFixed(1)}" y1="${(60 * Math.sin(edge)).toFixed(1)}" x2="${(92 * Math.cos(edge)).toFixed(1)}" y2="${(92 * Math.sin(edge)).toFixed(1)}" class="edge big"/>`);
    parts.push(`<text transform="rotate(${p * 45}) translate(0 -70)" class="tri">${TRIGRAM_SYMBOLS[p]}</text>`);
    parts.push(`<text transform="rotate(${p * 45}) translate(0 -140)" class="dir">${PALACES[p]}</text>`);
  }
  $('dial').innerHTML = `<g id="dial-rot">${parts.join('')}</g><circle r="6" class="pin"/>`;
}

function showHeading(deg) {
  heading = deg;
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    $('dial-rot').setAttribute('transform', `rotate(${-heading})`);
    const m = mountainOf(heading); const p = mountainPalace(m);
    $('heading-big').textContent = `${fmtDeg(heading)} ${t(PALACES[p], PALACES_ZH[p])}`;
    $('heading-line').innerHTML = `${t('Facing', '向')} <b>${MOUNTAINS[m]}</b> ${MOUNTAIN_PINYIN[m]} ${mountainLabel(m)} · ${t('sitting', '坐')} <b>${MOUNTAINS[mod(m + 12, 24)]}</b>`;
  });
}

let rawHeading = null; // the sensor's smoothed reading before the user's adjustment

function onReading(deg, edge = 'top') {
  // The screen's top edge turns with the screen when the phone is on its side.
  const d = edge === 'top' ? deg + (screen.orientation?.angle || 0) : deg;
  // Average on the unit circle so the reading doesn't jump between 359° and 0°.
  const a = d * Math.PI / 180;
  smoothX = smoothX * 0.6 + Math.cos(a) * 0.4;
  smoothY = smoothY * 0.6 + Math.sin(a) * 0.4;
  rawHeading = mod(Math.atan2(smoothY, smoothX) * 180 / Math.PI, 360);
  showHeading(mod(rawHeading + (state.compassOffset || 0), 360));
}

function renderOffset() {
  const off = state.compassOffset || 0;
  $('offset-line').textContent = off
    ? t(`Readings are adjusted by ${off > 0 ? '+' : ''}${off.toFixed(1)}° to match your phone's compass app.`, `读数已调整 ${off > 0 ? '+' : ''}${off.toFixed(1)}°，与手机自带罗盘一致。`)
    : t('No adjustment.', '未调整。');
  $('offset-reset').hidden = !off;
}

async function startCompass() {
  const status = $('compass-status');
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { status.textContent = t('Compass access was declined. Enter the degrees by hand below.', '未获罗盘权限，请在下方手动输入度数。'); return; }
    }
  } catch { /* fall through to listening */ }
  if (typeof DeviceOrientationEvent === 'undefined') { status.textContent = t('This device has no compass. Enter the degrees by hand below.', '此设备没有罗盘，请在下方手动输入度数。'); return; }
  // Android gives absolute angles, which need tilt allowed for; iPhones give a ready-made heading.
  const fromAngles = (e) => { const h = headingFromOrientation(e.alpha, e.beta || 0, e.gamma || 0); onReading(h.heading, h.edge); };
  window.addEventListener('deviceorientationabsolute', (e) => {
    if (e.alpha == null) return;
    gotAbsolute = true;
    fromAngles(e);
  });
  window.addEventListener('deviceorientation', (e) => {
    if (e.webkitCompassHeading != null) onReading(e.webkitCompassHeading, 'ios');
    else if (!gotAbsolute && e.absolute && e.alpha != null) fromAngles(e);
  });
  status.textContent = t('Hold the phone flat with the top pointing out, or upright with the back camera looking out. If the reading looks wrong, move the phone in a figure 8 to calibrate.', '手机平放、顶部朝外，或竖起、后镜头朝外。如读数不准，请将手机画“8”字校准。');
  setTimeout(() => { if (heading == null || heading === Number($('manual-deg').value)) status.textContent = t('No compass reading yet. On a computer, or if your browser blocks the sensor, enter the degrees by hand.', '暂无罗盘读数。在电脑上或浏览器禁用传感器时，请手动输入度数。'); }, 3000);
  $('compass-start').hidden = true;
}

// ---- Language, tabs, start-up --------------------------------------------------------------------

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
  document.title = zh ? '风水' : 'Feng Shui';
}

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo(0, 0);
}

function renderAll() {
  renderHome();
  renderPeople();
  renderYear();
}

function writeForm() {
  $('facing').value = state.home.facing;
  $('move-in').value = state.home.moveIn;
  $('replace').value = state.home.replace;
  $('show-annual').checked = state.home.showAnnual;
  document.querySelector(`input[name="orient"][value="${state.home.orient}"]`).checked = true;
}

document.querySelector(`input[name="lang"][value="${lang()}"]`).checked = true;
applyLanguage();
writeForm();
buildDial();
const startDeg = parseFloat(state.home.facing);
$('manual-deg').value = Number.isFinite(startDeg) ? startDeg : 180;
showHeading(Number($('manual-deg').value));

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.go)));
document.querySelectorAll('input[name="lang"]').forEach((el) => el.addEventListener('input', () => {
  state.lang = el.value;
  persist();
  applyLanguage();
  renderAll();
}));
for (const [id, key] of [['facing', 'facing'], ['move-in', 'moveIn'], ['period', 'period'], ['replace', 'replace']]) {
  $(id).addEventListener('input', () => { state.home[key] = $(id).value; persist(); renderHome(); });
}
$('show-annual').addEventListener('input', () => { state.home.showAnnual = $('show-annual').checked; persist(); renderHome(); });
document.querySelectorAll('input[name="orient"]').forEach((el) => el.addEventListener('input', () => {
  state.home.orient = el.value;
  persist();
  renderAll();
}));
$('house-grid').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cell]');
  if (!c) return;
  selectedCell = c.dataset.cell;
  renderHome();
});
$('year-grid').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cell]');
  if (!c) return;
  selectedYearCell = c.dataset.cell;
  renderYear();
});
$('year-prev').addEventListener('click', () => { viewYear--; renderYear(); renderHome(); });
$('year-next').addEventListener('click', () => { viewYear++; renderYear(); renderHome(); });
$('people').addEventListener('input', (e) => {
  const sel = e.target.closest('[data-role]');
  if (!sel) return;
  state.people[Number(sel.dataset.role)].role = sel.value;
  persist();
  renderAll();
});
$('people').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  state.people.splice(Number(b.dataset.del), 1);
  persist();
  renderAll();
});
$('p-add').addEventListener('click', addPerson);
$('home-guide').querySelector('summary').addEventListener('click', () => { guideTouched = true; });
$('compass-start').addEventListener('click', startCompass);
$('offset-set').addEventListener('click', () => {
  const theirs = parseFloat($('offset-input').value);
  if (!Number.isFinite(theirs) || rawHeading == null) {
    $('offset-line').textContent = rawHeading == null ? t('Start the compass first.', '请先开启罗盘。') : t('Enter the reading from your phone\'s compass app.', '请输入手机自带罗盘的读数。');
    return;
  }
  state.compassOffset = mod(theirs - rawHeading + 180, 360) - 180;
  persist();
  showHeading(mod(rawHeading + state.compassOffset, 360));
  renderOffset();
});
$('offset-reset').addEventListener('click', () => {
  state.compassOffset = 0;
  persist();
  if (rawHeading != null) showHeading(rawHeading);
  renderOffset();
});
renderOffset();
$('manual-deg').addEventListener('input', () => { smoothX = 0; smoothY = 0; showHeading(Number($('manual-deg').value)); });
$('use-facing').addEventListener('click', () => {
  if (heading == null) return;
  state.home.facing = String(Number(heading.toFixed(1)));
  persist();
  writeForm();
  renderHome();
  switchTab('home');
});

$('plan-file').addEventListener('change', (e) => { pickPlan(e.target.files[0]); e.target.value = ''; });
$('plan-replace').addEventListener('change', (e) => { pickPlan(e.target.files[0]); e.target.value = ''; });
$('plan-remove').addEventListener('click', () => {
  if (!confirm(t('Remove the floor plan?', '删除平面图？'))) return;
  planCell = null;
  setPlanBlob(null);
});
$('plan-rotate').addEventListener('click', async () => {
  const blob = await getPlan().catch(() => null);
  if (!blob || !planSize) return;
  const H0 = planHeight();
  if (state.plan.door) state.plan.door = [1000 - state.plan.door[1] * (1000 / H0), state.plan.door[0] * (1000 / H0)];
  state.plan.grid = rotateGrid90(state.plan.grid, H0); // keep the grid on the same walls
  state.plan.side = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' }[state.plan.side];
  state.plan.missing = state.plan.missing.map((i) => (i % 3) * 3 + (2 - Math.floor(i / 3)));
  persist();
  setPlanBlob(await rotatePlan(blob));
});
$('plan-angle').addEventListener('input', () => setGrid({ angle: Number($('plan-angle').value) }));
$('plan-turn-left').addEventListener('click', () => setGrid({ angle: Math.max(-45, state.plan.grid.angle - 0.5) }));
$('plan-turn-right').addEventListener('click', () => setGrid({ angle: Math.min(45, state.plan.grid.angle + 0.5) }));
$('plan-zoom-in').addEventListener('click', () => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(planZoom) + 1)]));
$('plan-zoom-out-btn').addEventListener('click', () => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(planZoom) - 1)]));
$('plan-reset').addEventListener('click', () => { state.plan.grid = autoGrid($('plan-img')); persist(); renderHome(); });
document.querySelectorAll('input[name="plan-side"]').forEach((el) => el.addEventListener('input', () => { state.plan.side = el.value; state.plan.door = null; persist(); renderHome(); }));
$('plan-door').addEventListener('click', () => { pickingDoor = !pickingDoor; renderHome(); });
document.querySelectorAll('input[name="plan-mode"]').forEach((el) => el.addEventListener('input', () => { planMode = el.value; renderHome(); }));
$('plan-layer').addEventListener('input', () => { state.plan.layer = $('plan-layer').value; persist(); renderHome(); });
$('plan-svg').addEventListener('pointerdown', planPointerDown);
$('plan-svg').addEventListener('pointermove', planPointerMove);
$('plan-svg').addEventListener('pointerup', planPointerUp);
$('plan-svg').addEventListener('pointercancel', planPointerUp);
$('plan-svg').addEventListener('click', planClick);

renderAll();
loadPlanImage().finally(holdReady());
