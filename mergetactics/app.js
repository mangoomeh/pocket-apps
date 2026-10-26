import {
  UPDATED, TROOPS, TRAITS, RULERS, MODIFIERS, troop, traitSummary, placement,
  PRACTICE, GOALS, newPractice, buy, mergeable, merge, place, sell, nextRound,
} from '../src/mergetactics.js';

const STORAGE_KEY = 'mergetactics-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.picks)) return { filter: 'all', team: 6, ...s };
  } catch { /* ignore */ }
  return { picks: [], filter: 'all', team: 6 };
}
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };

const ROLE = { tank: '🛡️ Tank', melee: '⚔️ Melee', ranged: '🏹 Ranged' };
const badge = (key) => `<span class="mt-trait" style="--t:${TRAITS[key].color}">${TRAITS[key].emoji} ${TRAITS[key].name}</span>`;
const stars = (n) => '★'.repeat(n);

$('updated').textContent = `Updated for ${UPDATED.label}`;

// ---- Learn -------------------------------------------------------------------------------------------

const LESSONS = [
  { icon: '🎯', title: 'The goal', pic: '👤 👤 👤 👤', body: [
    'Four players. Each round you fight one of the others.',
    'Lose a round and you lose health: more if more of their troops are still standing.',
    'The last player with health left wins. Finishing 1st or 2nd both count as a win.',
    'A game takes about 5–8 minutes.'] },
  { icon: '🔁', title: 'Every round has two phases', pic: '🛒 Deploy → ⚔️ Battle', body: [
    '<b>Deploy:</b> buy, sell, move and merge your troops.',
    '<b>Battle:</b> your troops fight on their own. You can still buy and sell, but only between the shop and your bench.'] },
  { icon: '💧', title: 'Golden Elixir and the shop', pic: '💧💧💧💧 + 🃏🃏🃏', body: [
    'You get <b>4 Golden Elixir</b> every round to buy troops (October cut it back from 5).',
    'The shop shows <b>3 troops</b> and only changes when you buy one.',
    'There are only <b>4 copies of each troop</b> in a game, shared by all four players. If someone else is buying yours, switch.',
    'You start each game with a random 2-Elixir troop.'] },
  { icon: '⭐', title: 'Merging is your main power', pic: '🗡️★ + 🗡️★ = 🗡️★★', body: [
    'Two of the <b>same troop with the same stars</b> merge into one troop a star higher, up to <b>4★</b>.',
    'A 2★ troop is much stronger than two 1★ troops, and it only takes one space.',
    'Try it on the practice board below.'] },
  { icon: '🧩', title: 'Team size and bench', pic: '🟩🟩 → 🟩🟩🟩 → … 6', body: [
    'The board starts with room for <b>2 troops</b> and grows by one each round, up to <b>6</b>.',
    'Your bench holds <b>5</b> more. Benched troops don\'t fight and don\'t count for traits.'] },
  { icon: '🔗', title: 'Traits', pic: Object.values(TRAITS).map((t) => t.emoji).join(' '), body: [
    'Every troop has a trait. Put <b>different troops of the same trait</b> on the board to switch on a bonus; more of them make it stronger.',
    `This month\'s traits: ${Object.values(TRAITS).map((t) => t.name).join(', ')}. See them all on the Planner tab.`] },
  { icon: '👑', title: 'Rulers and quests', pic: '🤴 ➜ 📜 1 · 2 · 3', body: [
    'Before a game you pick a Ruler. Each has its own ability and a 3-step quest.',
    'Quest 1 gives an Orb with 3 Elixir and equipment. Quest 2: 6 Elixir and equipment. Quest 3: <b>+1 team size</b> and a 3★ 4- or 5-Elixir troop.',
    'Everyone starts with Royale King.'] },
  { icon: '🦸', title: 'Supers (this month: Bosses)', pic: '👹 P.E.K.K.A · Mega Knight · Mini P.E.K.K.A · Monk', body: [
    'Supers are powered-up 5-Elixir troops with two abilities. In October they\'re in the shared shop like any troop.',
    'October\'s Supers are the Bosses. Below 50% HP a Boss turns into <b>Stage 2</b>, gets a new power and scares nearby enemies for 3s.'] },
  { icon: '🎒', title: 'Equipment', pic: '🛡️ 🗡️ 🪝 🪓', body: [
    'Equipment comes from your Ruler\'s quest Orbs. Each troop can hold one.',
    '<b>New this season:</b> it isn\'t equipped for you any more. Drag it onto a troop during Deploy, or it sits on the bench all round.',
    'Some equipment gives a trait, like the Boss Mask or Rider Emblem: a way to reach the next trait tier.'] },
  { icon: '🎲', title: 'Modifiers and leagues', pic: '🥉 → 🥈 → 🥇 → 💎', body: [
    'Each league plays with two modifiers that change the rules a little. Bronze has training ones that teach merging, traits, equipment and tiles.',
    'Win to earn Starsteel and climb the Starsteel Road. Diamond League needs 4,000 Starsteel.',
    `Season 11 ends on ${UPDATED.seasonEnds}. Reaching Diamond earns a Silver Badge; the top 10,000 get a Gold Badge.`] },
];

function renderLessons() {
  $('lessons').innerHTML = LESSONS.map((l, i) => `<details class="card mt-lesson" ${i === 0 ? 'open' : ''}>
    <summary><span class="mt-num">${i + 1}</span><span>${l.icon} ${l.title}</span></summary>
    <p class="mt-pic" aria-hidden="true">${esc(l.pic)}</p>
    <ul>${l.body.map((b) => `<li>${b}</li>`).join('')}</ul>
  </details>`).join('');
}

// ---- Merge practice ----------------------------------------------------------------------------------

let practice = newPractice();
let practiceMsg = { ok: 'Your turn. Buy a troop from the shop.' };

const unitChip = (u, where) => {
  const t = troop(u.id);
  return `<button type="button" class="mt-unit" data-act="${where}" data-uid="${u.uid}" style="--t:${TRAITS[t.trait].color}">
    <b>${esc(t.name)}</b><small class="mt-stars">${stars(u.star)}</small><small>${TRAITS[t.trait].emoji}</small></button>`;
};

function renderPractice() {
  const s = practice;
  const goal = GOALS.find((g) => !g.done(s));
  const pair = mergeable(s);
  const traits = traitSummary(s.board.map((u) => u.id));
  const slots = (list, size, where) => [...list.map((u) => unitChip(u, where)), ...Array(Math.max(0, size - list.length)).fill('<span class="mt-slot"></span>')].join('');
  $('practice').innerHTML = `<h2>🎮 Merge practice</h2>
    <p class="hint">A simplified deploy phase to get the feel. Tap a shop card to buy, tap a troop to move it between bench and board.</p>
    <p class="mt-goal">${goal ? `🎯 <b>Goal:</b> ${esc(goal.text)}` : '🏆 All goals done. Keep playing, or start over.'}</p>
    <div class="mt-hud"><span>Round <b>${s.round}</b></span><span>💧 <b>${s.elixir}</b> Elixir</span><span>Team <b>${s.board.length}/${s.team}</b></span></div>
    <p class="mt-label">Board <small>(fights, counts for traits)</small></p>
    <div class="mt-row board">${slots(s.board, s.team, 'move')}</div>
    <p class="mt-traits">${traits.length ? traits.map((t) => `<span class="${t.tier ? 'on' : ''}">${TRAITS[t.key].emoji} ${TRAITS[t.key].name} ${t.count}${t.tier ? ' ✓' : ` (${t.toNext} more)`}</span>`).join('') : '<span>No traits yet</span>'}</p>
    <p class="mt-label">Bench <small>(waits, doesn't fight)</small></p>
    <div class="mt-row">${slots(s.bench, PRACTICE.bench, 'move')}</div>
    <p class="mt-label">Shop <small>(changes only when you buy)</small></p>
    <div class="mt-row shop">${s.shop.map((id, i) => `<button type="button" class="mt-card" data-act="buy" data-slot="${i}" style="--t:${TRAITS[troop(id).trait].color}">
      <b>${esc(troop(id).name)}</b><small>${TRAITS[troop(id).trait].emoji} ${TRAITS[troop(id).trait].name}</small><span>💧${troop(id).cost}</span></button>`).join('')}</div>
    <p class="mt-msg ${practiceMsg.error ? 'bad' : ''}" role="status">${esc(practiceMsg.error || practiceMsg.ok)}</p>
    <div class="mt-actions">
      <button type="button" class="primary" data-act="merge" ${pair ? `data-uid="${pair[0].uid}"` : 'disabled'}>⭐ Merge${pair ? ` ${esc(troop(pair[0].id).name)}` : ''}</button>
      <button type="button" class="secondary" data-act="next">Next round ›</button>
      <button type="button" class="secondary" data-act="sellmode" aria-pressed="${sellMode}">${sellMode ? 'Tap a troop to sell' : '💰 Sell'}</button>
      <button type="button" class="secondary small" data-act="reset">Start over</button>
    </div>`;
}

let sellMode = false;
$('practice').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const uid = Number(b.dataset.uid);
  if (act === 'buy') practiceMsg = buy(practice, Number(b.dataset.slot));
  if (act === 'move') { practiceMsg = sellMode ? sell(practice, uid) : place(practice, uid); sellMode = false; }
  if (act === 'merge') practiceMsg = merge(practice, uid);
  if (act === 'next') practiceMsg = nextRound(practice);
  if (act === 'sellmode') { sellMode = !sellMode; practiceMsg = { ok: sellMode ? 'Tap the troop you want to sell.' : 'Selling cancelled.' }; }
  if (act === 'reset') { practice = newPractice(); sellMode = false; practiceMsg = { ok: 'New game. Buy a troop from the shop.' }; }
  renderPractice();
});

// ---- Troops ------------------------------------------------------------------------------------------

function renderTroops() {
  const keys = ['all', ...Object.keys(TRAITS)];
  $('troop-filter').innerHTML = keys.map((k) => `<label class="chip-toggle"><input type="radio" name="tf" value="${k}" ${state.filter === k ? 'checked' : ''}>${k === 'all' ? 'All' : `${TRAITS[k].emoji} ${TRAITS[k].name}`}</label>`).join('');
  const list = TROOPS.filter((t) => state.filter === 'all' || t.trait === state.filter).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  const trait = state.filter !== 'all' ? TRAITS[state.filter] : null;
  $('troop-list').innerHTML = `${trait ? `<div class="card"><h2>${trait.emoji} ${trait.name}</h2><p>${esc(trait.what)}</p>${tierTable(state.filter)}</div>` : ''}
    <p class="hint">${list.length} troops in the ${esc(UPDATED.label)} pool.</p>
    ${list.map((t) => `<div class="card mt-troop">
      <div class="mt-troophead"><b>${esc(t.name)}</b><span class="mt-cost">💧${t.cost}</span></div>
      <p class="mt-tags">${badge(t.trait)} <span class="mt-role">${ROLE[t.role]}</span>${t.super ? ' <span class="mt-super">🦸 Super</span>' : ''}</p>
      ${t.note ? `<p class="mt-note">${esc(t.note)}</p>` : ''}
    </div>`).join('')}`;
}
const tierTable = (key, count = -1) => `<ol class="mt-tiers">${TRAITS[key].tiers.map(([n, bonus]) => `<li class="${count >= n ? 'on' : ''}"><b>${n}</b> <span>${esc(bonus)}</span></li>`).join('')}</ol>`;

$('troop-filter').addEventListener('change', (e) => { state.filter = e.target.value; persist(); renderTroops(); });

// ---- Planner -----------------------------------------------------------------------------------------

const COMPS = [
  { name: 'Noble wall + a Boss', why: 'Noble makes every troop hit harder and take less damage; a Boss up front soaks hits and turns into Stage 2.', ids: ['knight', 'royalgiant', 'musketeer', 'princess', 'goldenknight', 'pekka'] },
  { name: 'Bosses', why: 'The Boss trait counts from 1 troop, and doubles with each Boss. Expensive, so merge your cheap troops first.', ids: ['megaknight', 'pekka', 'minipekka', 'monk', 'musketeer', 'knight'] },
  { name: 'Clan comeback', why: 'When someone drops low, the whole team heals and hits faster. Giant and Valkyrie hold the front.', ids: ['giant', 'valkyrie', 'barbarian', 'archer', 'archerqueen', 'megaknight'] },
  { name: 'Forest speed', why: 'Faster attacks, and your weakest troop keeps going invisible. Baby Dragon speeds up the troops around it.', ids: ['bandit', 'bossbandit', 'babydragon', 'firecracker', 'magicarcher', 'monk'] },
];

function renderPlanner() {
  const picks = state.picks.filter((id) => troop(id));
  const summary = traitSummary(picks);
  const rows = placement(picks);
  const full = picks.length >= state.team;
  $('planner').innerHTML = `<div class="card">
      <h2>Your team <small>${picks.length}/${state.team}</small></h2>
      <label class="field"><span>Team size</span>
        <select id="team-size">${[2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${n === state.team ? 'selected' : ''}>${n}${n === 7 ? ' (Elixir Loong or quest 3)' : ''}</option>`).join('')}</select></label>
      ${picks.length ? `<div class="mt-field">
        ${['front', 'middle', 'back'].map((r) => `<div class="mt-line"><small>${{ front: 'Front: tanks', middle: 'Middle: melee', back: 'Back: ranged' }[r]}</small>
          <div>${rows[r].map((t) => `<button type="button" class="mt-unit" data-remove="${t.id}" style="--t:${TRAITS[t.trait].color}"><b>${esc(t.name)}</b><small>${TRAITS[t.trait].emoji} ✕</small></button>`).join('') || '<span class="hint">—</span>'}</div></div>`).join('')}
      </div>` : '<p class="hint">Pick troops below, or start from a team idea.</p>'}
      <h3>Traits</h3>
      ${summary.length ? summary.map((t) => `<div class="mt-sum ${t.tier ? 'on' : ''}">
        <p>${badge(t.key)} <b>${t.count}</b> ${t.tier ? `· <span>${esc(t.bonus)}</span>` : ''}</p>
        <p class="hint">${t.tier ? (t.toNext ? `${t.toNext} more for the next tier.` : 'Top tier!') : `${t.toNext} more to switch it on.`}</p>
      </div>`).join('') : '<p class="hint">No traits yet.</p>'}
      ${picks.length ? '<button type="button" class="secondary small" id="clear">Clear team</button>' : ''}
    </div>
    <div class="card"><h2>Team ideas</h2>
      ${COMPS.map((c, i) => `<div class="mt-comp"><p><b>${esc(c.name)}</b></p><p class="hint">${esc(c.why)}</p>
        <p class="mt-tags">${c.ids.map((id) => `<span class="mt-mini" style="--t:${TRAITS[troop(id).trait].color}">${esc(troop(id).name)}</span>`).join(' ')}</p>
        <button type="button" class="secondary small" data-comp="${i}">Use this team</button></div>`).join('')}
      <p class="hint">Ideas, not rules: build around the troops the shop gives you, and merge first.</p>
    </div>
    <div class="card"><h2>Add troops</h2>
      ${full ? '<p class="hint">Your team is full. Tap a troop above to remove it.</p>' : ''}
      ${Object.entries(TRAITS).map(([key, t]) => `<p class="mt-label">${t.emoji} ${t.name}</p>
        <div class="chips">${TROOPS.filter((x) => x.trait === key).map((x) => `<button type="button" class="mt-pick ${picks.includes(x.id) ? 'on' : ''}" data-pick="${x.id}" ${full && !picks.includes(x.id) ? 'disabled' : ''}>${esc(x.name)} <small>💧${x.cost}</small></button>`).join('')}</div>`).join('')}
    </div>`;
}

$('planner').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pick) {
    const id = b.dataset.pick;
    state.picks = state.picks.includes(id) ? state.picks.filter((x) => x !== id) : [...state.picks, id].slice(0, state.team);
  } else if (b.dataset.remove) state.picks = state.picks.filter((x) => x !== b.dataset.remove);
  else if (b.dataset.comp) state.picks = COMPS[Number(b.dataset.comp)].ids.slice(0, state.team);
  else if (b.id === 'clear') state.picks = [];
  else return;
  persist();
  renderPlanner();
});
$('planner').addEventListener('change', (e) => {
  if (e.target.id !== 'team-size') return;
  state.team = Number(e.target.value);
  state.picks = state.picks.slice(0, state.team);
  persist();
  renderPlanner();
});

// ---- Tips --------------------------------------------------------------------------------------------

const TIPS = [
  ['⭐', 'Merge before chasing traits', 'Early on, stars matter more than traits. Buy copies of troops you already own.'],
  ['🧱', 'Tanks in front, shooters behind', 'Put Knight, Royal Giant, Giant or a Boss at the front. Keep Musketeer, Princess and Archers at the back, where they\'re safe longer.'],
  ['🎯', 'Pick one or two traits', 'Two traits at tier 2 usually beat four traits that are switched off. Noble and Boss are rated strongest this month; Clan and Forest are good too.'],
  ['👀', 'Watch the other players', 'Only 4 copies of each troop exist per game. If two players are buying Bosses, go for something else.'],
  ['💰', 'Sell what you won\'t merge', 'A lone troop you\'ll never pair up is Elixir waiting to be used. Spear Goblins sell for more the higher their stars.'],
  ['🎒', 'Equip every round', 'Equipment isn\'t added for you any more. Drag it onto a troop during Deploy, or it does nothing.'],
  ['👹', 'Let Bosses get hit', 'A Boss gets its Stage 2 power below 50% HP, so it\'s best at the front.'],
  ['📜', 'Play for your Ruler\'s quest', 'Quest 3 gives an extra team slot and a 3★ troop: often enough to win the late game.'],
];

function renderTips() {
  $('tips').innerHTML = `<div class="card"><h2>Strategy</h2>
      ${TIPS.map(([icon, title, body]) => `<div class="mt-tip"><span aria-hidden="true">${icon}</span><div><b>${esc(title)}</b><p>${esc(body)}</p></div></div>`).join('')}
    </div>
    <div class="card"><h2>Rulers</h2>
      ${RULERS.map((r) => `<details class="mt-ruler"><summary>${r.emoji} <b>${esc(r.name)}</b></summary>
        <p>${esc(r.ability)}</p>${r.quest ? `<p class="hint">📜 Quest: ${esc(r.quest)} in one game</p>` : ''}${r.unlock ? `<p class="hint">🔓 ${esc(r.unlock)}</p>` : ''}${r.tip ? `<p class="hint">💡 ${esc(r.tip)}</p>` : ''}</details>`).join('')}
      <p class="hint">Spirit Empress, Elixir Loong and Grand Warden are rated strongest right now.</p>
    </div>
    <div class="card"><h2>This month's modifiers</h2>
      <table class="mt-mods"><tbody>${MODIFIERS.map(([league, mods]) => `<tr><th>${esc(league)}</th><td>${esc(mods)}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="card"><h2>What changed lately</h2><ul>
      <li><b>October:</b> Supers went into the shared shop, the Boss trait came back reworked, Elixir per round went from 5 back to 4, and every game starts with a random 2-Elixir troop.</li>
      <li><b>September 8:</b> Clan, Undead and Rider were toned down; Grand Warden and Royale King quests got easier.</li>
      <li><b>Season 11 (from 1 September):</b> Supers, 17 reworked troops, 10 removed, equipment assigned by hand, Starsteel Road to 4,000.</li>
      <li><b>Coming:</b> November's Supers, traits and troops are announced at the end of October.</li>
    </ul>
    <p class="hint">Sources: Supercell's Merge Tactics release notes, and the trackers seemeta.com and mergetacticsbuild.com (updated ${esc(UPDATED.date)}).</p></div>`;
}

// ---- Tabs --------------------------------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

renderLessons();
renderPractice();
renderTroops();
renderPlanner();
renderTips();
