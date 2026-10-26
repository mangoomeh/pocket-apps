// Merge Tactics (Clash Royale's auto-battler mode): the current troop pool, traits, Rulers and modifiers,
// plus the logic behind the trait planner and the merge practice board.
//
// Facts are from Supercell's Season 11 release notes and its October 2026 update, with the troop pool,
// costs and trait breakpoints from community trackers (seemeta.com, mergetacticsbuild.com), checked
// against each other. The game changes every month: update UPDATED and the lists below when it does.

export const UPDATED = { label: 'Season 11 · October 2026', date: '2026-10-26', seasonEnds: '30 Nov 2026' };

// ---- Troops ------------------------------------------------------------------------------------------
// role: 'tank' (front line, soaks damage), 'melee' (front or middle), 'ranged' (back line).
// note: what the troop does in Merge Tactics, from the release notes; empty where they don't say.

export const TROOPS = [
  // Boss: October's Supers, 5 Elixir, shared pool. Stage 2 below 50% HP.
  { id: 'pekka', name: 'P.E.K.K.A', cost: 5, trait: 'boss', role: 'tank', super: true, note: 'Every few hits, a swing hits all enemies in a line. Stage 2: lifesteal and more Movement Speed.' },
  { id: 'megaknight', name: 'Mega Knight', cost: 5, trait: 'boss', role: 'tank', super: true, note: 'Every few seconds, jumps on enemies for area damage and a 2s stun. Stage 2: every hit knocks back and stuns.' },
  { id: 'minipekka', name: 'Mini P.E.K.K.A', cost: 5, trait: 'boss', role: 'melee', super: true, note: 'Every few hits, cooks a pancake that levels up a random ally. Stage 2: drains energy from enemies using abilities.' },
  { id: 'monk', name: 'Monk', cost: 5, trait: 'boss', role: 'tank', super: true, note: 'Every 3rd hit knocks the target back. Stage 2: a damage-reflecting shield and heals every few hits.' },
  // Clan
  { id: 'archer', name: 'Archers', cost: 2, trait: 'clan', role: 'ranged', note: 'After a few hits, arrows deal bonus damage for the rest of the round.' },
  { id: 'barbarian', name: 'Barbarians', cost: 2, trait: 'clan', role: 'melee', note: 'After a few hits, gains bonus Hit and Movement Speed for the round.' },
  { id: 'giant', name: 'Giant', cost: 3, trait: 'clan', role: 'tank', note: 'Every few seconds, throws the nearest enemy, dealing damage based on its max HP.' },
  { id: 'valkyrie', name: 'Valkyrie', cost: 3, trait: 'clan', role: 'melee', note: 'After a few hits, spins and damages all enemies around her for the round.' },
  { id: 'archerqueen', name: 'Archer Queen', cost: 4, trait: 'clan', role: 'ranged', note: '' },
  // Noble
  { id: 'knight', name: 'Knight', cost: 2, trait: 'noble', role: 'tank', note: 'Every few seconds, taunts enemies in range to attack him for 2s.' },
  { id: 'princess', name: 'Princess', cost: 2, trait: 'noble', role: 'ranged', note: 'Area-damage arrows at the farthest enemy; every few hits they slow Hit and Movement Speed for 3s.' },
  { id: 'musketeer', name: 'Musketeer', cost: 3, trait: 'noble', role: 'ranged', note: 'At combat start, snipes the farthest enemy (within 6 hexes) three times, with bonus damage and a short stun.' },
  { id: 'royalgiant', name: 'Royal Giant', cost: 3, trait: 'noble', role: 'tank', note: 'Every few hits, knocks surrounding enemies back 1 hex.' },
  { id: 'goldenknight', name: 'Golden Knight', cost: 4, trait: 'noble', role: 'melee', note: '' },
  // Forest
  { id: 'firecracker', name: 'Firecracker', cost: 2, trait: 'forest', role: 'ranged', note: '' },
  { id: 'magicarcher', name: 'Magic Archer', cost: 2, trait: 'forest', role: 'ranged', note: '' },
  { id: 'babydragon', name: 'Baby Dragon', cost: 3, trait: 'forest', role: 'ranged', note: 'Area-damage fireballs; each attack gives allies within 2 hexes bonus Hit and Movement Speed.' },
  { id: 'bandit', name: 'Bandit', cost: 3, trait: 'forest', role: 'melee', note: '' },
  { id: 'bossbandit', name: 'Boss Bandit', cost: 4, trait: 'forest', role: 'melee', note: '' },
  // Goblin
  { id: 'dartgoblin', name: 'Dart Goblin', cost: 2, trait: 'goblin', role: 'ranged', note: 'After a few hits, darts poison for damage based on max HP, stacking up to 5 times.' },
  { id: 'speargoblin', name: 'Spear Goblins', cost: 2, trait: 'goblin', role: 'ranged', note: 'Sells for more Elixir the higher its Merge Level.' },
  { id: 'goblincage', name: 'Goblin Cage', cost: 3, trait: 'goblin', role: 'tank', note: 'Cages the nearest enemy and damages it over time; when destroyed, releases it and a Goblin Brawler.' },
  { id: 'goblindemolisher', name: 'Goblin Demolisher', cost: 3, trait: 'goblin', role: 'melee', note: 'Rushes the lowest-HP enemy and explodes below 50% HP for area damage.' },
  { id: 'goblinmachine', name: 'Goblin Machine', cost: 4, trait: 'goblin', role: 'tank', note: '' },
  // Undead
  { id: 'bomber', name: 'Bomber', cost: 2, trait: 'undead', role: 'ranged', note: 'Throws a bomb with a 2-hex radius; every few hits it bounces on and damages again.' },
  { id: 'royalghost', name: 'Royal Ghost', cost: 2, trait: 'undead', role: 'melee', note: '' },
  { id: 'giantskeleton', name: 'Giant Skeleton', cost: 3, trait: 'undead', role: 'tank', note: '' },
  { id: 'witch', name: 'Witch', cost: 3, trait: 'undead', role: 'ranged', note: '' },
  { id: 'skeletonking', name: 'Skeleton King', cost: 4, trait: 'undead', role: 'melee', note: '' },
];

// ---- Traits ------------------------------------------------------------------------------------------
// tiers: [troops needed, bonus]. Traits count different troops on the board; the bench doesn't count.

export const TRAITS = {
  boss: { name: 'Boss', emoji: '👹', color: '#7c2d12', what: 'Bonus max HP and damage. Below 50% HP a Boss turns into Stage 2 and scares nearby enemies for 3s.',
    tiers: [[1, '+25% HP and damage'], [2, '+50%'], [3, '+100%'], [4, '+200%']] },
  noble: { name: 'Noble', emoji: '👑', color: '#a16207', what: 'All your troops deal more damage and take less.',
    tiers: [[2, '+15% damage, −15% damage taken'], [4, '+30% / −30%'], [6, '+60% / −60%']] },
  clan: { name: 'Clan', emoji: '🛡️', color: '#1d4ed8', what: 'Once a round, when an ally drops below 50% HP, your troops heal and hit faster for 3s.',
    tiers: [[2, 'heal 30% HP, +30% Hit Speed'], [4, 'heal 50%, +50%'], [6, 'heal 100%, +100%']] },
  forest: { name: 'Forest', emoji: '🌲', color: '#15803d', what: 'Bonus Hit Speed, and your lowest-HP troop keeps turning invisible for 2.5s.',
    tiers: [[2, '+15% Hit Speed, invisible every 4.5s'], [4, '+30%, every 3.5s'], [6, '+60%, every 2.5s']] },
  goblin: { name: 'Goblin', emoji: '👺', color: '#4d7c0f', what: 'Gives you free Goblin troops in an Orb.',
    tiers: [[2, 'a 2- or 3-Elixir Goblin'], [4, 'a 3- or 4-Elixir Goblin'], [6, 'a 2-, 3- and 4-Elixir Goblin every round']] },
  undead: { name: 'Undead', emoji: '💀', color: '#6b21a8', what: 'Every troop knocked out makes all your troops a little stronger for the rest of the game.',
    tiers: [[2, '+1% HP and damage each'], [4, '+2% each'], [6, '+6% each']] },
};

// ---- Rulers ------------------------------------------------------------------------------------------

export const RULERS = [
  { name: 'Royale King', emoji: '🤴', ability: 'Gets 4–8 Golden Elixir at random every round he loses.', quest: 'Lose 1 / 2 / 4 rounds', unlock: 'Free from the start', tip: 'Good while learning: losing early rounds still pays.' },
  { name: 'Spirit Empress', emoji: '🧚', ability: '+1 Golden Elixir every time you merge.', quest: 'Merge 3 / 25 / 60 troops', tip: 'The strongest Ruler right now. Merge often.' },
  { name: 'Elixir Loong', emoji: '🐉', ability: '5 Golden Elixir a round instead of 4, and one more troop on the board (3–7 instead of 2–6).', quest: 'Win 2 / 3 / 5 rounds in a row', tip: 'Strong and simple: more Elixir every round.' },
  { name: 'Grand Warden', emoji: '🧙', ability: 'At 5s and 15s into each round, a random troop gets a shield.', quest: 'Shield 2 / 8 / 16 troops', tip: 'Helps your tanks last.' },
  { name: 'Dagger Duchess', emoji: '🗡️', ability: 'A Dagger to equip: one troop attacks faster for a few hits.', quest: 'Win 1 / 2 / 4 rounds in under 8s', tip: 'Give the Dagger to your best damage troop.' },
  { name: 'Battle Machine', emoji: '🤖', ability: 'Free buildings: 1-Star in round 1, 2-Star in round 3, 3-Star in round 5, 4-Star in round 8; one fewer troop from round 5.', quest: '', tip: '' },
  { name: 'Ronin', emoji: '🥷', ability: 'When an enemy steps on the crossover tile, a charged slash damages troops in the way.', quest: 'Knock out 1 / 3 / 5 troops with Double Edge', tip: '' },
  { name: 'Tomb Queen', emoji: '⚰️', ability: 'At combat start, spawns a Tombstone; when it breaks, she rises and joins the fight.', quest: 'Summon 3 / 15 / 50 troops', tip: '' },
  { name: 'Goblin Queen', emoji: '👸', ability: 'Each troop knocked out has a 33% chance to give you a Goblin.', quest: 'Get 2 / 8 / 20 Goblins', tip: 'Pairs with the Goblin trait.' },
  { name: 'Echo Sage', emoji: '🔮', ability: 'Once a round, charges up and knocks out its target and the enemies around it, then vanishes. Levels up after 2, 4 and 8 knockouts.', quest: 'Knock out 2 / 4 / 8 troops', tip: '' },
];

// ---- Modifiers by league (October) -----------------------------------------------------------------

export const MODIFIERS = [
  ['Bronze I', 'Merge Training, Trait Training'], ['Bronze II', 'Trade Training, Equipment Training'], ['Bronze III', 'Tile Training, Building Training'],
  ['Silver I', 'Merge Bonus, Domination'], ['Silver II', 'Star Advantage, Merge Mini'], ['Silver III', 'Orb Galore, 3-Star Fantasy'], ['Silver IV', 'Battle Royale, Goblin\'s Treasure'],
  ['Gold I', 'Royale River, Trait Gift'], ['Gold II', 'Abyss Tile, Ascension'], ['Gold III', 'Four Stars, Wormhole Tile'], ['Gold IV', 'Trait Dummy, You\'re Mine'], ['Gold V', 'First Free, Echo Bench'],
  ['Diamond', 'Jump Tile, Cursed Tile'],
];

// ---- Trait planner -----------------------------------------------------------------------------------

export const troop = (id) => TROOPS.find((t) => t.id === id);

// Which traits a board switches on: each trait with its count, the tier reached (0 = none yet) and how
// many more troops reach the next tier. Duplicates count once.
export function traitSummary(ids) {
  const counts = {};
  for (const id of new Set(ids)) {
    const t = troop(id);
    if (t) counts[t.trait] = (counts[t.trait] || 0) + 1;
  }
  return Object.entries(counts).map(([key, count]) => {
    const { tiers } = TRAITS[key];
    const tier = tiers.filter(([n]) => count >= n).length;
    const next = tiers[tier];
    return { key, count, tier, bonus: tier ? tiers[tier - 1][1] : '', toNext: next ? next[0] - count : 0, max: tiers.length };
  }).sort((a, b) => b.tier - a.tier || b.count - a.count || a.key.localeCompare(b.key));
}

// Front or back: tanks in front, ranged at the back, other melee in the middle.
export function placement(ids) {
  const rows = { front: [], middle: [], back: [] };
  for (const id of ids) {
    const t = troop(id);
    if (t) rows[t.role === 'tank' ? 'front' : t.role === 'ranged' ? 'back' : 'middle'].push(t);
  }
  return rows;
}

// ---- Merge practice ----------------------------------------------------------------------------------
// A small, simplified copy of a match's deploy phase: a 3-card shop that only changes when you buy,
// 4 Elixir a round, a bench of 5, and a team size that grows by one each round from 2 to 6.
// Merging two identical troops of the same star makes one troop a star higher, up to 4 stars.

export const PRACTICE = { elixir: 4, bench: 5, startTeam: 2, maxTeam: 6, maxStar: 4, pool: ['knight', 'princess', 'archer', 'barbarian', 'bomber', 'dartgoblin'] };

export function newPractice(rng = Math.random) {
  const s = { round: 1, elixir: PRACTICE.elixir, team: PRACTICE.startTeam, bench: [], board: [], shop: [], merges: 0, next: 1 };
  s.shop = [0, 1, 2].map(() => pick(rng));
  return s;
}
const pick = (rng) => PRACTICE.pool[Math.floor(rng() * PRACTICE.pool.length)];
const unit = (s, id, star = 1) => ({ uid: s.next++, id, star });

// Each action returns a message for the player, or an error.
export function buy(s, slot, rng = Math.random) {
  const id = s.shop[slot];
  const cost = troop(id).cost;
  if (s.elixir < cost) return { error: 'Not enough Elixir. Sell a troop or wait for the next round.' };
  if (s.bench.length >= PRACTICE.bench) return { error: 'Your bench is full. Merge, place or sell a troop first.' };
  s.elixir -= cost;
  s.bench.push(unit(s, id));
  s.shop[slot] = pick(rng);
  return { ok: `Bought ${troop(id).name}.` };
}

// A pair that can merge, if any: two of the same troop and star, anywhere you own them.
export function mergeable(s) {
  const all = [...s.board, ...s.bench];
  for (const a of all) {
    if (a.star >= PRACTICE.maxStar) continue;
    const b = all.find((x) => x !== a && x.id === a.id && x.star === a.star);
    if (b) return [a, b];
  }
  return null;
}

export function merge(s, uid) {
  const all = [...s.board, ...s.bench];
  const a = all.find((x) => x.uid === uid);
  const b = a && all.find((x) => x !== a && x.id === a.id && x.star === a.star);
  if (!a || !b || a.star >= PRACTICE.maxStar) return { error: 'You need two of the same troop with the same stars.' };
  // The merged troop stays where the board one was, if either was on the board.
  const keep = s.board.includes(b) && !s.board.includes(a) ? b : a;
  const gone = keep === a ? b : a;
  keep.star += 1;
  s.board = s.board.filter((x) => x !== gone);
  s.bench = s.bench.filter((x) => x !== gone);
  s.merges += 1;
  return { ok: `${troop(keep.id).name} is now ${keep.star}★!` };
}

export function place(s, uid) {
  const u = s.bench.find((x) => x.uid === uid);
  if (u) {
    if (s.board.length >= s.team) return { error: `Your team is full (${s.team} troops this round). Move one back to the bench first.` };
    s.bench = s.bench.filter((x) => x !== u);
    s.board.push(u);
    return { ok: `${troop(u.id).name} is on the board.` };
  }
  const b = s.board.find((x) => x.uid === uid);
  if (!b) return { error: 'No such troop.' };
  if (s.bench.length >= PRACTICE.bench) return { error: 'Your bench is full.' };
  s.board = s.board.filter((x) => x !== b);
  s.bench.push(b);
  return { ok: `${troop(b.id).name} is back on the bench.` };
}

// Selling gives back the Elixir it cost (a simplification: in the game the price depends on the troop
// and its stars).
export function sell(s, uid) {
  const u = [...s.board, ...s.bench].find((x) => x.uid === uid);
  if (!u) return { error: 'No such troop.' };
  s.board = s.board.filter((x) => x !== u);
  s.bench = s.bench.filter((x) => x !== u);
  const back = troop(u.id).cost;
  s.elixir += back;
  return { ok: `Sold for ${back} Elixir.` };
}

export function nextRound(s) {
  s.round += 1;
  s.elixir += PRACTICE.elixir;
  s.team = Math.min(PRACTICE.maxTeam, s.team + 1);
  return { ok: `Round ${s.round}: +${PRACTICE.elixir} Elixir, and room for ${s.team} troops.` };
}

// The practice board's goals, in order; each checks the state.
export const GOALS = [
  { text: 'Buy a troop from the shop.', done: (s) => s.bench.length + s.board.length > 0 },
  { text: 'Put a troop on the board: tap it on the bench.', done: (s) => s.board.length > 0 },
  { text: 'Get two of the same troop, then tap Merge.', done: (s) => s.merges > 0 },
  { text: 'Switch on a trait: two different troops of one trait on the board.', done: (s) => traitSummary(s.board.map((u) => u.id)).some((t) => t.tier > 0) },
  { text: 'Tap Next round to get more Elixir and a bigger team.', done: (s) => s.round > 1 },
  { text: 'Make a 3★ troop.', done: (s) => [...s.board, ...s.bench].some((u) => u.star >= 3) },
];
