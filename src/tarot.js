// Tarot: the 78 cards of the Rider–Waite–Smith deck (Pamela Colman Smith's 1909 art, public domain),
// their traditional meanings upright and reversed, the spreads, and the shuffling and reading logic.
// Meanings follow the common Rider–Waite tradition (A. E. Waite's Pictorial Key and later practice),
// written short and plain.

// ---- The Major Arcana --------------------------------------------------------------------------------
// [name, upright keywords, upright meaning, reversed keywords, reversed meaning]

const MAJORS = [
  ['The Fool', 'beginnings, trust, adventure', 'A fresh start. Step forward with an open heart, even without knowing where the road goes.',
    'recklessness, hesitation', 'Either leaping without looking, or holding back from a start you need to make.'],
  ['The Magician', 'skill, willpower, action', 'You have what you need. Focus your talents and make it happen.',
    'scattered energy, tricks', 'Talent wasted or misused. Watch for manipulation, including telling yourself stories.'],
  ['The High Priestess', 'intuition, mystery, inner knowing', 'Be still and listen inward. The answer is quieter than you expect.',
    'secrets, ignoring your gut', 'You know more than you admit. Something hidden wants to come out.'],
  ['The Empress', 'nurturing, abundance, creativity', 'Growth, comfort and care. Tend what you love and it flourishes.',
    'smothering, neglecting yourself', 'Giving too much, or not enough to yourself. Creativity feels blocked.'],
  ['The Emperor', 'structure, authority, stability', 'Take charge with clear rules and steady leadership.',
    'rigidity, control', 'Too much control, or too little. A clash with authority.'],
  ['The Hierophant', 'tradition, teaching, belonging', 'Learn from those who came before; shared values and institutions guide you.',
    'rebellion, your own path', 'Questioning the rules and finding your own way.'],
  ['The Lovers', 'love, harmony, choices', 'A meaningful bond, or a choice made from your true values.',
    'imbalance, a hard choice', 'Disharmony, mixed signals, or a decision you keep avoiding.'],
  ['The Chariot', 'drive, determination, victory', 'Pull opposing forces together and push forward. Success through focus.',
    'loss of direction', 'Pulled in two directions. Take back the reins.'],
  ['Strength', 'courage, patience, gentle power', 'Quiet strength wins: kindness and patience tame what force cannot.',
    'self-doubt, frustration', 'Your inner strength is there, but doubt is louder right now.'],
  ['The Hermit', 'solitude, reflection, wisdom', 'Step back to find your own light. Time alone brings answers.',
    'isolation, withdrawal', 'Solitude has turned into loneliness. Reconnect.'],
  ['Wheel of Fortune', 'cycles, change, luck', 'The wheel turns. Change is coming; luck shifts in your favour.',
    'setbacks, resisting change', 'A down turn of the wheel. Ride it out; it keeps turning.'],
  ['Justice', 'fairness, truth, consequences', 'Fair outcomes. Act with honesty and accept the results of your choices.',
    'unfairness, avoiding blame', 'Something feels unjust, or responsibility is being dodged.'],
  ['The Hanged Man', 'pause, surrender, new view', 'Stop and see things differently. Letting go brings insight.',
    'stalling, resistance', 'Stuck because you won\'t let go or change your view.'],
  ['Death', 'endings, transformation, release', 'An ending that makes room for something new. Rarely literal.',
    'clinging, fear of change', 'Holding on to what has already ended.'],
  ['Temperance', 'balance, moderation, healing', 'Blend and balance. Patience and the middle way.',
    'excess, imbalance', 'Too much of something. Bring it back to centre.'],
  ['The Devil', 'attachment, temptation, habits', 'Something holds you: a habit, a desire, a fear. The chains are looser than they look.',
    'breaking free', 'Release from a bad habit or relationship. You are taking your power back.'],
  ['The Tower', 'sudden change, upheaval, truth', 'A shake-up that clears false foundations. Hard, but it frees you.',
    'avoiding disaster, delayed change', 'Upheaval averted or postponed. The change is still needed.'],
  ['The Star', 'hope, renewal, calm', 'Healing after hard times. Trust the future.',
    'discouragement', 'Faith has dimmed. Small steps bring hope back.'],
  ['The Moon', 'uncertainty, dreams, illusion', 'Not everything is as it seems. Trust your intuition through the fog.',
    'clarity returning', 'Confusion lifts and fears lose their grip.'],
  ['The Sun', 'joy, success, warmth', 'Happiness, energy and clarity. Things go well.',
    'joy delayed', 'The sun is behind a cloud: still good, just slower or dimmer.'],
  ['Judgement', 'awakening, reckoning, calling', 'A wake-up call. Reflect honestly and answer it.',
    'self-doubt, ignoring the call', 'Being too hard on yourself, or not listening to what calls you.'],
  ['The World', 'completion, wholeness, travel', 'A cycle completes. Celebrate what you\'ve achieved.',
    'unfinished business', 'Almost there. Tie up loose ends.'],
];

// ---- The Minor Arcana --------------------------------------------------------------------------------

export const SUITS = {
  wands: { name: 'Wands', element: 'Fire', emoji: '🔥', about: 'energy, passion, ambition, work and creativity' },
  cups: { name: 'Cups', element: 'Water', emoji: '💧', about: 'feelings, love, relationships and intuition' },
  swords: { name: 'Swords', element: 'Air', emoji: '🌬️', about: 'thoughts, words, conflict and decisions' },
  pentacles: { name: 'Pentacles', element: 'Earth', emoji: '🪙', about: 'money, work, the body and practical matters' },
};
export const RANKS = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];

// [upright keywords, upright meaning, reversed keywords, reversed meaning], Ace to King
const MINORS = {
  wands: [
    ['inspiration, a spark, new venture', 'A burst of energy and a new idea. Act on it.', 'delays, lack of drive', 'The spark is there but won\'t catch yet.'],
    ['planning, future vision', 'Look ahead and plan your next move.', 'fear of the unknown', 'Playing it too safe, or poor planning.'],
    ['expansion, looking ahead', 'Your plans are underway; opportunities come from further afield.', 'setbacks, obstacles', 'Delays to plans; check what you didn\'t foresee.'],
    ['celebration, home, harmony', 'A happy milestone, a homecoming or a joyful gathering.', 'tension at home', 'Celebration postponed, or unease where you live.'],
    ['competition, conflict', 'Clashing egos and rivalry. Keep it friendly.', 'avoiding conflict', 'Tension ends, or is swept under the carpet.'],
    ['victory, recognition', 'Success and public praise.', 'ego, a fall from grace', 'Recognition withheld, or pride getting in the way.'],
    ['standing your ground', 'Defend your position; you have the high ground.', 'overwhelmed, giving up', 'Feeling outnumbered. Pick your battles.'],
    ['speed, movement, news', 'Things move fast: news, travel, quick progress.', 'delays, frustration', 'Momentum stalls. Wait for the right moment.'],
    ['resilience, persistence', 'Weary but nearly there. Hold on.', 'exhaustion, defensiveness', 'You\'re running on empty. Ask for help.'],
    ['burden, responsibility', 'Carrying too much. Put some down.', 'letting go', 'Delegating, or a load finally lifted.'],
    ['curiosity, enthusiasm, news', 'An eager start, exciting news or a free spirit.', 'impatience, false starts', 'All talk and no follow-through.'],
    ['action, adventure, boldness', 'Charge ahead with passion.', 'haste, recklessness', 'Rushing in; scattered energy.'],
    ['confidence, warmth, determination', 'Radiant, capable and sure of yourself.', 'jealousy, insecurity', 'Self-doubt or demanding behaviour.'],
    ['vision, leadership, bold moves', 'A natural leader with a big vision.', 'impulsiveness, high expectations', 'Domineering, or expecting too much of others.'],
  ],
  cups: [
    ['new love, emotional opening', 'Your heart opens: love, compassion, a new feeling.', 'blocked feelings', 'Emotions held back or turned inward.'],
    ['partnership, connection', 'A mutual bond, attraction or reconciliation.', 'imbalance, a rift', 'A relationship out of step.'],
    ['friendship, celebration', 'Good times with friends and community.', 'overindulgence, gossip', 'Too much partying, or a third person interfering.'],
    ['apathy, contemplation', 'Bored or withdrawn, you may miss what\'s offered.', 'new interest, awareness', 'Waking up to new possibilities.'],
    ['loss, regret, grief', 'Focusing on what\'s lost. Two cups still stand behind you.', 'acceptance, moving on', 'Healing begins; forgiveness.'],
    ['nostalgia, innocence', 'Happy memories and childhood joys; kindness.', 'stuck in the past', 'Living in memories; time to grow.'],
    ['choices, daydreams', 'Many options, some illusions. Choose clearly.', 'clarity, a decision', 'The fog lifts and you choose.'],
    ['walking away, searching', 'Leaving something behind to find deeper meaning.', 'fear of change, drifting', 'Unsure whether to stay or go.'],
    ['contentment, a wish granted', 'Satisfaction: the "wish card".', 'smugness, unmet wishes', 'Happiness that doesn\'t quite satisfy.'],
    ['happiness, family, harmony', 'Lasting joy and loving relationships.', 'broken harmony', 'Family tension or unmet ideals.'],
    ['creative idea, sensitivity, message', 'A sweet message, an intuitive nudge or a new feeling.', 'emotional immaturity', 'Moodiness or a creative block.'],
    ['romance, charm, following the heart', 'An offer, a romantic gesture or an idealist.', 'moodiness, unrealistic', 'Feelings run away with you.'],
    ['compassion, calm, intuition', 'Caring, emotionally wise and supportive.', 'insecurity, co-dependence', 'Taking on others\' feelings; self-care needed.'],
    ['emotional balance, generosity', 'Calm, mature and diplomatic.', 'manipulation, moodiness', 'Emotions bottled up or used to control.'],
  ],
  swords: [
    ['clarity, breakthrough, truth', 'A clear idea cuts through confusion.', 'confusion, harsh words', 'Muddled thinking, or truth used as a weapon.'],
    ['stalemate, a difficult decision', 'Torn between two choices, avoiding both.', 'information overload', 'The deadlock breaks, or confusion grows.'],
    ['heartbreak, sorrow', 'Painful truth and grief. It hurts, and it heals.', 'recovery, forgiveness', 'Releasing pain; moving on.'],
    ['rest, recovery', 'Take a break and recharge.', 'restlessness, burnout', 'You need rest but won\'t stop.'],
    ['conflict, winning at a cost', 'A win that leaves bad feeling.', 'reconciliation', 'Ending a conflict; making amends.'],
    ['transition, moving on', 'Leaving troubled waters for calmer ones.', 'stuck, unresolved baggage', 'Can\'t move on yet.'],
    ['strategy, sneaking', 'Acting alone, or getting away with something.', 'coming clean', 'A deception exposed, or conscience wins.'],
    ['feeling trapped', 'Stuck by your own thoughts; the way out is closer than it seems.', 'release, new perspective', 'Freeing yourself from limiting beliefs.'],
    ['anxiety, worry, sleepless nights', 'Fears loom large at night. Most won\'t come true.', 'hope, reaching out', 'The worst passes; talk to someone.'],
    ['an ending, hitting bottom', 'A painful end, but the only way now is up.', 'recovery, survival', 'Rising from a low point.'],
    ['curiosity, new ideas, vigilance', 'Eager to learn and quick-witted.', 'gossip, all talk', 'Hasty words or spying.'],
    ['ambition, fast action', 'Charging after a goal, full speed.', 'reckless, aggressive', 'Rushing without thinking.'],
    ['independence, clear thinking', 'Sharp, honest and direct.', 'coldness, bitterness', 'Harsh judgement or a cutting tongue.'],
    ['authority, truth, intellect', 'Clear, fair and logical.', 'misuse of power', 'Cold manipulation or rigid thinking.'],
  ],
  pentacles: [
    ['opportunity, prosperity, new money', 'A practical new start: a job, money or a healthy beginning.', 'missed chance, poor planning', 'An opportunity slips through your fingers.'],
    ['balance, juggling', 'Keeping many things going at once.', 'overwhelm, disorganisation', 'Dropping the balls; prioritise.'],
    ['teamwork, skill, learning', 'Good work recognised; collaboration pays.', 'poor teamwork', 'Misaligned effort or sloppy work.'],
    ['security, saving, control', 'Holding on tight to what you have.', 'greed or overspending', 'Too tight, or too loose, with money.'],
    ['hardship, feeling left out', 'Money worries or isolation. Help is near.', 'recovery', 'Hard times ending; reaching out works.'],
    ['generosity, giving and receiving', 'Sharing what you have; fair exchange.', 'strings attached, debt', 'Unequal giving, or charity with conditions.'],
    ['patience, long-term view', 'Your investment grows slowly. Assess and wait.', 'impatience, little reward', 'Effort not paying off; rethink.'],
    ['diligence, craft, mastery', 'Hard work and skill-building.', 'perfectionism, lack of focus', 'Repetitive work without heart.'],
    ['independence, luxury, self-worth', 'Enjoying the fruits of your own work.', 'over-investment in work', 'Living beyond your means, or lonely success.'],
    ['legacy, family wealth', 'Long-term security, inheritance and roots.', 'family money disputes', 'Financial loss or family conflict.'],
    ['ambition, study, new skills', 'A diligent student or a promising offer.', 'procrastination', 'A lack of progress or follow-through.'],
    ['hard work, routine, reliability', 'Slow and steady wins.', 'boredom, stuck in a rut', 'Laziness or excessive caution.'],
    ['nurturing, practical, provider', 'Down-to-earth, caring and resourceful.', 'self-care neglected', 'Work and home out of balance.'],
    ['wealth, security, abundance', 'Successful, generous and grounded.', 'greed, stubbornness', 'Obsessed with status or money.'],
  ],
};

// ---- The deck ----------------------------------------------------------------------------------------

const card = (id, name, arcana, suit, rank, [up, upText, rev, revText]) => ({ id, name, arcana, suit, rank, img: `cards/${id}.jpg`, up, upText, rev, revText });

export const DECK = [
  ...MAJORS.map(([name, up, upText, rev, revText], i) => card(`major-${String(i).padStart(2, '0')}`, name, 'major', null, i, [up, upText, rev, revText])),
  ...Object.entries(MINORS).flatMap(([suit, cards]) => cards.map((m, r) => card(`${suit}-${String(r + 1).padStart(2, '0')}`, `${RANKS[r]} of ${SUITS[suit].name}`, 'minor', suit, r + 1, m))),
];

export const cardById = (id) => DECK.find((c) => c.id === id);
export const isCourt = (c) => c.arcana === 'minor' && c.rank > 10;

// ---- Spreads -----------------------------------------------------------------------------------------
// layout: grid positions [column, row] for drawing the spread, in a grid of cols × rows.

export const SPREADS = [
  { id: 'one', name: 'One card', emoji: '🃏', about: 'A quick message, or a card for today.', cols: 1, rows: 1,
    positions: [['Your card', 'The energy to work with right now.', [1, 1]]] },
  { id: 'three', name: 'Past · Present · Future', emoji: '⏳', about: 'Where you\'ve been, where you are, where it\'s heading.', cols: 3, rows: 1,
    positions: [['Past', 'What led here.', [1, 1]], ['Present', 'Where things stand.', [2, 1]], ['Future', 'Where it\'s heading if nothing changes.', [3, 1]]] },
  { id: 'sao', name: 'Situation · Action · Outcome', emoji: '🧭', about: 'For a problem you want to act on.', cols: 3, rows: 1,
    positions: [['Situation', 'What\'s really going on.', [1, 1]], ['Action', 'What to do about it.', [2, 1]], ['Outcome', 'Where that action leads.', [3, 1]]] },
  { id: 'love', name: 'Relationship', emoji: '💞', about: 'You, the other person, and what\'s between you.', cols: 3, rows: 1,
    positions: [['You', 'How you show up in this.', [1, 1]], ['Them', 'How they show up.', [3, 1]], ['The bond', 'The relationship itself.', [2, 1]]] },
  { id: 'choice', name: 'Two paths', emoji: '🔀', about: 'When you\'re choosing between two options.', cols: 3, rows: 2,
    positions: [['Where you are', 'The heart of the choice.', [2, 1]], ['Path A', 'Taking the first option.', [1, 2]], ['Path B', 'Taking the second option.', [3, 2]]] },
  { id: 'celtic', name: 'Celtic Cross', emoji: '✝️', about: 'The classic ten-card reading for a big question.', cols: 4, rows: 4,
    positions: [
      ['The heart', 'The core of the matter.', [2, 2]], ['The challenge', 'What crosses you.', [2, 2]],
      ['The root', 'What lies beneath.', [2, 3]], ['The past', 'What\'s passing away.', [1, 2]],
      ['The goal', 'The best that can come of it.', [2, 1]], ['Near future', 'What comes next.', [3, 2]],
      ['You', 'Your attitude.', [4, 4]], ['Others', 'People and surroundings.', [4, 3]],
      ['Hopes and fears', 'What you hope for, or fear.', [4, 2]], ['Outcome', 'Where it\'s heading.', [4, 1]],
    ] },
];
export const spreadById = (id) => SPREADS.find((s) => s.id === id);

// ---- Drawing -----------------------------------------------------------------------------------------

// A fair random integer below n, from crypto when there is one.
export function randomInt(n, rand = cryptoRandom) {
  return Math.floor(rand() * n);
}
function cryptoRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }
  return Math.random();
}

// Fisher–Yates shuffle of card ids.
export function shuffle(ids, rand = cryptoRandom) {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, rand);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Draw the cards for a spread: a shuffled deck, the top cards, each upright or (if allowed) reversed.
export function draw(spreadId, { reversals = true, rand = cryptoRandom } = {}) {
  const spread = spreadById(spreadId);
  const deck = shuffle(DECK.map((c) => c.id), rand);
  return spread.positions.map((_, i) => ({ id: deck[i], reversed: reversals && rand() < 0.5 }));
}

// Card of the day: the same card all day, different each day, from the date and a per-device seed.
export function dailyCard(dateKey, seed = 0) {
  let h = 2166136261 ^ seed;
  for (const ch of `${dateKey}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h >>>= 0;
  return { id: DECK[h % DECK.length].id, reversed: ((h >>> 8) & 1) === 1 };
}

// ---- Reading the whole spread ------------------------------------------------------------------------

// What the mix of cards says, in a few plain sentences.
export function overview(cards) {
  const full = cards.map((c) => ({ ...cardById(c.id), reversed: c.reversed }));
  const n = full.length;
  const notes = [];
  const majors = full.filter((c) => c.arcana === 'major').length;
  if (n >= 3 && majors / n >= 0.5) notes.push('Many Major Arcana: big life themes are at work here, more than day-to-day events.');
  else if (n >= 3 && majors === 0) notes.push('No Major Arcana: this is about everyday matters you can shape yourself.');
  const counts = Object.fromEntries(Object.keys(SUITS).map((s) => [s, full.filter((c) => c.suit === s).length]));
  const [topSuit, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (n >= 3 && topCount >= Math.max(2, Math.ceil(n / 3))) notes.push(`Mostly ${SUITS[topSuit].name} (${SUITS[topSuit].element}): the focus is ${SUITS[topSuit].about}.`);
  const courts = full.filter(isCourt).length;
  if (n >= 3 && courts >= 2) notes.push('Several court cards: other people, or different sides of you, play a big part.');
  const reversed = full.filter((c) => c.reversed).length;
  if (n >= 3 && reversed / n > 0.5) notes.push('Mostly reversed: energy is blocked, delayed or turned inward. Look at what\'s holding you back.');
  else if (n >= 3 && reversed === 0) notes.push('All upright: energy flows openly.');
  const aces = full.filter((c) => c.arcana === 'minor' && c.rank === 1).length;
  if (aces >= 2) notes.push('More than one Ace: fresh starts and new opportunities.');
  return notes;
}
