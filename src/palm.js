// Palm reading: a guided self-reading. You look at your own palm and pick what you see at
// each step; the reading is put together from traditional palmistry meanings. For fun and
// reflection, like Tarot: it doesn't predict anything.

// ---- The steps -------------------------------------------------------------------------------
// Each step asks about one feature. `line` is the line its drawing highlights; each option can
// change how the hand is drawn (`draw`) and adds keywords and a sentence to the reading.

export const STEPS = [
  {
    id: 'hand', section: 'intro', title: 'Which hand are you reading?',
    spot: 'Palmists read both. Your dominant hand (the one you write with) shows what you’ve made of yourself and where you’re heading; the other shows the nature you were born with.',
    options: [
      { id: 'dominant', label: 'My dominant hand', short: 'Dominant', meaning: 'This is your dominant hand, so the reading is about who you’ve become and the direction you’re taking.' },
      { id: 'other', label: 'My other hand', short: 'Other hand', meaning: 'This is your non-dominant hand, so the reading is about the nature you were born with: your instincts and potential.' },
    ],
  },
  {
    id: 'palm', section: 'character', title: 'Palm shape',
    spot: 'Look at the palm only, not the fingers. Compare its width across the base of the fingers with its length from there down to the first wrist crease.',
    options: [
      { id: 'square', label: 'Square', short: 'Square palm', hint: 'About as long as it is wide', draw: { palm: 'square' } },
      { id: 'long', label: 'Long', short: 'Long palm', hint: 'Clearly longer than it is wide', draw: { palm: 'long' } },
    ],
  },
  {
    id: 'fingers', section: 'character', title: 'Finger length',
    spot: 'Hold your fingers together and compare your middle finger with the length of your palm.',
    options: [
      { id: 'short', label: 'Short', short: 'Short fingers', hint: 'Middle finger clearly shorter than the palm', draw: { fingers: 'short' } },
      { id: 'long', label: 'Long', short: 'Long fingers', hint: 'Middle finger about as long as the palm', draw: { fingers: 'long' } },
    ],
  },
  {
    id: 'heartEnd', section: 'love', line: 'heart', title: 'Heart line: where it ends',
    spot: 'The heart line is the top one of the big lines across your palm. It starts at the edge under your little finger and runs towards your index finger. Where does it stop?',
    options: [
      { id: 'middle', label: 'Under the middle finger', short: 'Heart line ends under the middle finger', draw: { heartEnd: 'middle' }, keywords: ['Independent', 'Shows love in deeds'],
        meaning: 'Your heart line ends under the middle finger: you show love through what you do more than what you say, and you need room to be yourself in a relationship.' },
      { id: 'between', label: 'Between middle and index', short: 'Heart line ends between middle and index', draw: { heartEnd: 'between' }, keywords: ['Balanced', 'Warm'],
        meaning: 'Your heart line ends between the middle and index fingers, the balanced spot: warm and caring, but realistic about people, giving and taking in equal measure.' },
      { id: 'index', label: 'Under the index finger', short: 'Heart line ends under the index finger', draw: { heartEnd: 'index' }, keywords: ['Loyal', 'Idealistic'],
        meaning: 'Your heart line reaches under the index finger: you’re loyal and devoted, with high ideals in love, and you’d rather wait for the right person than settle.' },
    ],
  },
  {
    id: 'heartShape', section: 'love', line: 'heart', title: 'Heart line: its shape',
    spot: 'Follow the heart line along its length. Does it sweep upwards in a curve, or run fairly straight across?',
    options: [
      { id: 'curved', label: 'Curved upwards', short: 'Curved heart line', draw: { heartShape: 'curved' }, keywords: ['Expressive', 'Affectionate'],
        meaning: 'It curves upwards, the sign of someone open with their feelings: affectionate, romantic and quick to show how they feel.' },
      { id: 'straight', label: 'Fairly straight', short: 'Straight heart line', draw: { heartShape: 'straight' }, keywords: ['Private', 'Steady'],
        meaning: 'It runs fairly straight, which suggests you keep your feelings private until you trust someone, and love in a calm, steady way.' },
    ],
  },
  {
    id: 'headLength', section: 'mind', line: 'head', title: 'Head line: its length',
    spot: 'The head line is the next big line down. It starts at the thumb side, between thumb and index finger, and runs across the palm. How far does it go?',
    options: [
      { id: 'short', label: 'Short', short: 'Short head line', hint: 'Stops around the middle of the palm', draw: { headLength: 'short' }, keywords: ['Decisive', 'Practical'],
        meaning: 'A shorter head line: you think fast and decide quickly, preferring action and practical results to long deliberation.' },
      { id: 'long', label: 'Long', short: 'Long head line', hint: 'Runs most of the way across', draw: { headLength: 'long' }, keywords: ['Thorough', 'Curious'],
        meaning: 'A long head line: you’re a thorough thinker who looks at things from every side, plans ahead and has wide interests.' },
    ],
  },
  {
    id: 'headSlope', section: 'mind', line: 'head', title: 'Head line: straight or sloping',
    spot: 'Does the head line run straight across the palm, or curve down towards the wrist on the little finger side?',
    options: [
      { id: 'straight', label: 'Straight across', short: 'Straight head line', draw: { headSlope: 'straight' }, keywords: ['Logical', 'Realistic'],
        meaning: 'It runs straight across: a logical, realistic mind that likes facts, order and a clear plan.' },
      { id: 'sloping', label: 'Sloping down', short: 'Sloping head line', draw: { headSlope: 'sloping' }, keywords: ['Imaginative', 'Creative'],
        meaning: 'It slopes down towards the wrist, the mark of imagination: creative and intuitive, at home with ideas and feelings as much as facts.' },
    ],
  },
  {
    id: 'headStart', section: 'mind', line: 'head', title: 'Head line: where it starts',
    spot: 'Look at where the head line begins, near your thumb. Is it joined to the life line (the line curving round the thumb) at first, or does it start apart from it?',
    options: [
      { id: 'joined', label: 'Joined to the life line', short: 'Head and life lines joined', draw: { headStart: 'joined' }, keywords: ['Careful', 'Close to family'],
        meaning: 'It starts joined to the life line: you tend to look before you leap, and family and close ties shaped you early on.' },
      { id: 'separate', label: 'Starts apart', short: 'Head and life lines apart', draw: { headStart: 'separate' }, keywords: ['Independent', 'Adventurous'],
        meaning: 'It starts apart from the life line: independent from an early age, confident and ready to take a chance.' },
    ],
  },
  {
    id: 'lifeArc', section: 'energy', line: 'life', title: 'Life line: its curve',
    spot: 'The life line curves around the base of your thumb, from between thumb and index finger down towards the wrist. (Its length doesn’t say how long you’ll live: that’s a myth.) How wide is the curve?',
    options: [
      { id: 'wide', label: 'Wide, reaching into the palm', short: 'Wide life line', draw: { lifeArc: 'wide' }, keywords: ['Energetic', 'Outgoing'],
        meaning: 'Your life line sweeps wide into the palm: plenty of energy and enthusiasm, happiest when you’re out and doing things.' },
      { id: 'close', label: 'Close to the thumb', short: 'Life line close to the thumb', draw: { lifeArc: 'close' }, keywords: ['Calm', 'Home-loving'],
        meaning: 'Your life line hugs the thumb: you value calm and home comforts, and recharge best with rest and people you know well.' },
    ],
  },
  {
    id: 'fate', section: 'path', line: 'fate', title: 'Fate line',
    spot: 'The fate line runs up the middle of the palm, from near the wrist towards the middle finger. Not everyone has one. What does yours look like?',
    options: [
      { id: 'strong', label: 'Clear and deep', short: 'Clear fate line', draw: { fate: 'strong' }, keywords: ['Driven', 'Focused'],
        meaning: 'A clear fate line: a strong sense of direction, often a calling or career that feels meant to be.' },
      { id: 'faint', label: 'Faint or broken', short: 'Faint fate line', draw: { fate: 'faint' }, keywords: ['Adaptable', 'Open'],
        meaning: 'A faint or broken fate line: your path is shaped by changing interests and chances taken. You adapt well and reinvent yourself.' },
      { id: 'fromLife', label: 'Starts from the life line', short: 'Fate line from the life line', draw: { fate: 'fromLife' }, keywords: ['Self-made'],
        meaning: 'Your fate line grows out of the life line: a self-made path, built by your own effort, with early support from family.' },
      { id: 'none', label: 'I can’t see one', short: 'No fate line', draw: { fate: 'none' }, keywords: ['Free-spirited'],
        meaning: 'No clear fate line: you’re not tied to one set path. Plenty of successful people have none; it means freedom to choose.' },
    ],
  },
  {
    id: 'sun', section: 'path', line: 'sun', title: 'Sun line',
    spot: 'The sun line is a shorter vertical line under your ring finger. It’s often missing or faint.',
    options: [
      { id: 'clear', label: 'I can see one', short: 'Sun line', draw: { sun: 'clear' }, keywords: ['Creative', 'Recognised'],
        meaning: 'You have a sun line: creativity and joy in your work, and a knack for being noticed and appreciated for it.' },
      { id: 'none', label: 'No sun line', short: 'No sun line', draw: { sun: 'none' },
        meaning: 'No sun line: your satisfaction comes quietly, from the work itself more than from applause.' },
    ],
  },
];

// The hand's element, from palm shape and finger length.
export const ELEMENTS = {
  earth: { name: 'Earth hand', icon: '🌱', keywords: ['Practical', 'Reliable'],
    text: 'A square palm with short fingers is an Earth hand: practical, grounded and dependable. You trust what you can see and touch, like working with your hands, and people rely on your common sense.' },
  air: { name: 'Air hand', icon: '🌬️', keywords: ['Curious', 'Communicative'],
    text: 'A square palm with long fingers is an Air hand: curious, sociable and quick-witted. You love ideas and conversation, and need variety to stay interested.' },
  water: { name: 'Water hand', icon: '🌊', keywords: ['Intuitive', 'Sensitive'],
    text: 'A long palm with long fingers is a Water hand: sensitive, intuitive and imaginative. You feel things deeply, read people well and are drawn to creative work.' },
  fire: { name: 'Fire hand', icon: '🔥', keywords: ['Energetic', 'Passionate'],
    text: 'A long palm with short fingers is a Fire hand: energetic, passionate and confident. You act on instinct, inspire others and get bored by routine.' },
};

export function elementOf(answers) {
  const { palm, fingers } = answers;
  if (!palm || !fingers) return null;
  return palm === 'square' ? (fingers === 'short' ? 'earth' : 'air') : (fingers === 'long' ? 'water' : 'fire');
}

export const SECTIONS = [
  { id: 'character', title: 'Character', icon: '✋' },
  { id: 'love', title: 'Love and feelings', icon: '❤️' },
  { id: 'mind', title: 'Mind', icon: '💡' },
  { id: 'energy', title: 'Energy', icon: '⚡' },
  { id: 'path', title: 'Life path', icon: '🧭' },
];

export const stepById = (id) => STEPS.find((s) => s.id === id);
export const optionOf = (step, id) => step?.options.find((o) => o.id === id) || null;

// How many steps are answered (skips don't count).
export const answeredCount = (answers) => STEPS.filter((s) => optionOf(s, answers[s.id])).length;

// The reading for a set of answers ({ stepId: optionId }) in `lang`; unknown ids are ignored.
export function buildReading(answers, lang = 'en') {
  const C = content(lang);
  const el = elementOf(answers);
  const element = el ? C.ELEMENTS[el] : null;
  const hand = optionOf(C.STEPS.find((s) => s.id === 'hand'), answers.hand);
  const sections = [];
  const keywords = [...(element?.keywords || [])];
  for (const sec of C.SECTIONS) {
    const text = [];
    if (sec.id === 'character' && element) text.push(element.text);
    for (const step of C.STEPS.filter((s) => s.section === sec.id)) {
      const o = optionOf(step, answers[step.id]);
      if (!o) continue;
      if (o.meaning) text.push(o.meaning);
      for (const k of o.keywords || []) if (!keywords.includes(k)) keywords.push(k);
    }
    if (text.length) sections.push({ ...sec, text });
  }
  const title = element ? element.name : lang === 'zh' ? ZH.yourPalm : 'Your palm';
  return { title, icon: element?.icon || '🖐️', element: el, intro: hand?.meaning || '', sections, keywords, answered: answeredCount(answers) };
}

// ---- Drawing the hand ------------------------------------------------------------------------
// A right palm facing you (thumb on the right), as an SVG string. `look` sets the hand's shape
// and each line's variant (the `draw` values above); `highlight` is the line drawn in the
// accent colour, with the other lines faint. Lines are placed in the palm's own box: u from
// the little-finger edge (0) to the thumb edge (1), v from the base of the fingers (0) to the wrist (1).

export const DEFAULT_LOOK = {
  palm: 'square', fingers: 'long', heartEnd: 'between', heartShape: 'curved', headLength: 'long', headSlope: 'straight',
  headStart: 'joined', lifeArc: 'wide', fate: 'strong', sun: 'none',
};

// The look for a set of answers: every answered option's `draw` over the default.
export function lookFor(answers) {
  const look = { ...DEFAULT_LOOK };
  for (const step of STEPS) Object.assign(look, optionOf(step, answers[step.id])?.draw);
  return look;
}

const r1 = (n) => Math.round(n * 10) / 10;

function linePaths(look, box) {
  const P = (u, v) => [box.x + u * box.w, box.y + v * box.h];
  const q = (a, c, b) => `M${P(...a).map(r1)} Q${P(...c).map(r1)} ${P(...b).map(r1)}`;
  const paths = {};
  // Heart: from the little-finger edge towards the index finger.
  const heartEnd = { middle: [0.55, 0.12], between: [0.68, 0.08], index: [0.84, 0.05] }[look.heartEnd] || [0.68, 0.08];
  // Straight: the bend sits on the line between its ends. Curved: it dips, so the end sweeps up.
  paths.heart = q([0, 0.24], look.heartShape === 'straight' ? [heartEnd[0] / 2, (0.24 + heartEnd[1]) / 2] : [heartEnd[0] * 0.45, 0.3], heartEnd);
  // Head: from the thumb side across.
  const headFrom = look.headStart === 'separate' ? [0.92, 0.22] : [0.95, 0.32];
  const headTo = [look.headLength === 'short' ? 0.46 : 0.08, look.headSlope === 'sloping' ? (look.headLength === 'short' ? 0.58 : 0.72) : 0.42];
  paths.head = q(headFrom, [(headFrom[0] + headTo[0]) / 2, look.headSlope === 'sloping' ? 0.4 : 0.36], headTo);
  // Life: around the base of the thumb.
  paths.life = q([0.95, 0.34], look.lifeArc === 'close' ? [0.66, 0.62] : [0.36, 0.66], [0.74, 1]);
  // Fate: up the middle towards the middle finger.
  if (look.fate === 'fromLife') paths.fate = q([0.68, 0.86], [0.56, 0.5], [0.52, 0.06]);
  else if (look.fate !== 'none') paths.fate = q([0.5, 1], [0.52, 0.5], [0.52, 0.06]);
  // Sun: under the ring finger.
  if (look.sun === 'clear') paths.sun = q([0.3, 0.62], [0.29, 0.34], [0.3, 0.06]);
  return paths;
}

export function handSvg({ look = DEFAULT_LOOK, highlight = null, size = 'large', label = 'A palm' } = {}) {
  const long = look.palm === 'long';
  const box = long ? { x: 46, y: 104, w: 100, h: 140 } : { x: 38, y: 116, w: 116, h: 120 };
  const scale = look.fingers === 'short' ? 0.72 : 1;
  // Little, ring, middle, index (left to right), as a share of the palm's width and a length.
  const fingers = [[0.02, 0.21, 52], [0.26, 0.24, 74], [0.51, 0.24, 82], [0.76, 0.23, 70]].map(([u, w, len]) => {
    const fw = w * box.w; const fl = len * scale;
    return `<rect x="${r1(box.x + u * box.w)}" y="${r1(box.y - fl + 14)}" width="${r1(fw)}" height="${r1(fl)}" rx="${r1(fw / 2)}"/>`;
  }).join('');
  const thumb = `<ellipse cx="${r1(box.x + box.w + 8)}" cy="${r1(box.y + box.h * 0.48)}" rx="15" ry="${long ? 40 : 36}" transform="rotate(-32 ${r1(box.x + box.w + 8)} ${r1(box.y + box.h * 0.48)})"/>`;
  const palm = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="28"/>`;
  const wrist = `<rect x="${r1(box.x + box.w * 0.14)}" y="${r1(box.y + box.h - 10)}" width="${r1(box.w * 0.72)}" height="34" rx="8"/>`;
  const paths = linePaths(look, box);
  const lines = Object.entries(paths).map(([name, d]) => {
    const on = name === highlight;
    const dashed = name === 'fate' && look.fate === 'faint' ? ' stroke-dasharray="7 6"' : '';
    return `<path class="pl-line${on ? ' on' : ''}" data-line="${name}" d="${d}"${dashed}/>`;
  });
  // The highlighted line is drawn last, so it sits on top.
  lines.sort((a, b) => (a.includes(' on"') ? 1 : 0) - (b.includes(' on"') ? 1 : 0));
  // Cropped to the hand: short fingers leave no empty space above.
  const top = Math.floor(box.y + 14 - 82 * scale - 6);
  const bottom = Math.ceil(box.y + box.h + 30);
  return `<svg class="pl-hand ${size}" viewBox="0 ${top} 200 ${bottom - top}" role="img" aria-label="${label}"><g class="pl-skin">${wrist}${fingers}${thumb}${palm}</g>${lines.join('')}</svg>`;
}

// ---- Saved readings ----------------------------------------------------------------------------

export function newSaved(answers, id, now = Date.now()) {
  const r = buildReading(answers);
  return { id, at: now, answers: { ...answers }, title: r.title, icon: r.icon, keywords: r.keywords.slice(0, 6) };
}

// What a reading says, as plain text for sharing.
export function readingText(answers, lang = 'en') {
  const r = buildReading(answers, lang);
  const zh = lang === 'zh';
  const parts = [`${r.icon} ${r.title}`];
  if (r.intro) parts.push(r.intro);
  for (const s of r.sections) parts.push(`${s.icon} ${s.title}\n${s.text.join(' ')}`);
  if (r.keywords.length) parts.push(zh ? `${ZH.keywordsLabel}：${r.keywords.join('、')}` : `Keywords: ${r.keywords.join(', ')}`);
  parts.push(zh ? ZH.footer : 'For fun and reflection, from traditional palmistry.');
  return parts.join('\n\n');
}

// ---- 中文 -------------------------------------------------------------------------------------
// Simplified Chinese for every step, option, hand type and section, by id. Anything missing
// falls back to English (tests/palm.test.js checks nothing is).

export const ZH = {
  steps: {
    hand: { title: '你看的是哪只手？', spot: '手相两只手都看。惯用手（写字的那只）代表你后天的努力和未来的方向；另一只手代表你与生俱来的天性。',
      options: {
        dominant: { label: '我的惯用手', short: '惯用手', meaning: '这是你的惯用手，所以这份解读讲的是你后天成为的样子，以及你正在走的方向。' },
        other: { label: '我的另一只手', short: '另一只手', meaning: '这是你的非惯用手，所以这份解读讲的是你与生俱来的天性：你的本能与潜质。' },
      } },
    palm: { title: '手掌形状', spot: '只看手掌，不看手指。比较手指根部的掌宽，和从那里到第一条腕纹的掌长。',
      options: {
        square: { label: '方形', short: '方形手掌', hint: '长和宽差不多' },
        long: { label: '长形', short: '长形手掌', hint: '明显长过宽' },
      } },
    fingers: { title: '手指长度', spot: '手指并拢，拿中指和手掌的长度比较。',
      options: {
        short: { label: '短', short: '短手指', hint: '中指明显比手掌短' },
        long: { label: '长', short: '长手指', hint: '中指和手掌差不多长' },
      } },
    heartEnd: { title: '感情线：在哪里结束', spot: '感情线是横过手掌的几条主线中最上面的一条。它从小指下方的掌边开始，往食指方向延伸。它在哪里停下？',
      options: {
        middle: { label: '中指下方', short: '感情线止于中指下方', keywords: ['独立', '用行动表达爱'],
          meaning: '你的感情线止于中指下方：你更多用行动而不是言语表达爱，在感情里也需要保有自己的空间。' },
        between: { label: '中指与食指之间', short: '感情线止于中指与食指之间', keywords: ['平衡', '温暖'],
          meaning: '你的感情线止于中指和食指之间，这是最平衡的位置：温暖体贴，又能看清人情，付出与收获都恰到好处。' },
        index: { label: '食指下方', short: '感情线止于食指下方', keywords: ['忠诚', '理想主义'],
          meaning: '你的感情线延伸到食指下方：你忠诚专一，对爱情有很高的理想，宁愿等对的人，也不愿将就。' },
      } },
    heartShape: { title: '感情线：形状', spot: '顺着感情线看下去。它是向上弯成一道弧线，还是比较平直地横过手掌？',
      options: {
        curved: { label: '向上弯曲', short: '弯曲的感情线', keywords: ['善于表达', '深情'],
          meaning: '它向上弯曲，代表你对感情很坦率：深情、浪漫，心里怎么想很快就会表现出来。' },
        straight: { label: '比较平直', short: '平直的感情线', keywords: ['内敛', '稳定'],
          meaning: '它比较平直，说明你在信任一个人之前会把感情藏在心里，爱得平静而长久。' },
      } },
    headLength: { title: '智慧线：长度', spot: '智慧线是往下的第二条主线。它从拇指那一侧、拇指和食指之间开始，横过手掌。它延伸到哪里？',
      options: {
        short: { label: '短', short: '短智慧线', hint: '大约停在手掌中间', keywords: ['果断', '务实'],
          meaning: '智慧线较短：你思考快、决定快，比起反复琢磨，更喜欢行动和看得见的结果。' },
        long: { label: '长', short: '长智慧线', hint: '几乎横过整个手掌', keywords: ['周全', '好奇'],
          meaning: '智慧线很长：你想事情周全，会从各个角度考虑，喜欢提前计划，兴趣也很广。' },
      } },
    headSlope: { title: '智慧线：平直还是下垂', spot: '智慧线是平直地横过手掌，还是在小指那一侧往手腕方向弯下去？',
      options: {
        straight: { label: '平直', short: '平直的智慧线', keywords: ['理性', '实际'],
          meaning: '它平直地横过手掌：头脑理性、实际，喜欢事实、条理和清楚的计划。' },
        sloping: { label: '向下倾斜', short: '下垂的智慧线', keywords: ['想象力丰富', '有创意'],
          meaning: '它往手腕方向倾斜，这是想象力的标志：有创意、直觉敏锐，对想法和感受同样得心应手。' },
      } },
    headStart: { title: '智慧线：起点', spot: '看智慧线靠近拇指的起点。它一开始是和生命线（绕着拇指的那条线）连在一起，还是分开的？',
      options: {
        joined: { label: '与生命线相连', short: '智慧线与生命线相连', keywords: ['谨慎', '重视家庭'],
          meaning: '它的起点和生命线相连：你习惯三思而后行，家人和亲近的关系很早就塑造了你。' },
        separate: { label: '分开起始', short: '智慧线与生命线分开', keywords: ['独立', '爱冒险'],
          meaning: '它的起点和生命线分开：你从小就很独立，自信，也敢于冒险。' },
      } },
    lifeArc: { title: '生命线：弧度', spot: '生命线绕着拇指根部，从拇指和食指之间往手腕方向弯下去。（它的长短并不代表寿命，那是误传。）这道弧有多宽？',
      options: {
        wide: { label: '很宽，延伸到掌心', short: '宽阔的生命线', keywords: ['精力充沛', '外向'],
          meaning: '你的生命线大大地弯进掌心：精力充沛、热情满满，出门做事的时候最开心。' },
        close: { label: '贴近拇指', short: '贴近拇指的生命线', keywords: ['平和', '恋家'],
          meaning: '你的生命线紧贴拇指：你喜欢平静和家的舒适，和熟悉的人在一起、好好休息最能让你充电。' },
      } },
    fate: { title: '事业线', spot: '事业线（也叫命运线）从手腕附近往中指方向，竖着穿过手掌中央。不是每个人都有。你的是什么样子？',
      options: {
        strong: { label: '清晰而深', short: '清晰的事业线', keywords: ['有干劲', '专注'],
          meaning: '事业线清晰：你很有方向感，往往有一份像是命中注定的志向或事业。' },
        faint: { label: '浅或断续', short: '浅的事业线', keywords: ['适应力强', '开放'],
          meaning: '事业线浅或断续：你的道路随着兴趣的变化和抓住的机会而改变。你适应力强，也能重新塑造自己。' },
        fromLife: { label: '从生命线长出', short: '事业线起于生命线', keywords: ['白手起家'],
          meaning: '你的事业线从生命线长出：这是一条靠自己努力走出来的路，早年也得到了家人的支持。' },
        none: { label: '我看不到', short: '没有事业线', keywords: ['自由'],
          meaning: '没有明显的事业线：你不受一条固定的路束缚。很多成功的人都没有事业线，它代表你可以自由选择。' },
      } },
    sun: { title: '太阳线', spot: '太阳线是无名指下方一条较短的竖线，常常没有或很浅。',
      options: {
        clear: { label: '我看得到', short: '有太阳线', keywords: ['有创意', '受人赏识'],
          meaning: '你有太阳线：工作中充满创意和乐趣，也很容易被人注意和欣赏。' },
        none: { label: '没有太阳线', short: '没有太阳线',
          meaning: '没有太阳线：你的满足感来得安静，更多来自事情本身，而不是掌声。' },
      } },
  },
  elements: {
    earth: { name: '土型手', keywords: ['务实', '可靠'], text: '方形手掌配短手指是土型手：务实、踏实、靠得住。你相信看得见摸得着的东西，喜欢动手做事，大家都信赖你的常识。' },
    air: { name: '风型手', keywords: ['好奇', '善于沟通'], text: '方形手掌配长手指是风型手：好奇、合群、反应快。你喜欢想法和交流，需要新鲜感才不会觉得无聊。' },
    water: { name: '水型手', keywords: ['直觉强', '敏感'], text: '长形手掌配长手指是水型手：敏感、直觉强、富有想象力。你感受深刻，很会读懂别人，也容易被创意工作吸引。' },
    fire: { name: '火型手', keywords: ['精力充沛', '热情'], text: '长形手掌配短手指是火型手：精力充沛、热情、自信。你凭直觉行动，能鼓舞别人，最怕一成不变。' },
  },
  sections: { character: '性格', love: '爱情与感情', mind: '思维', energy: '精力', path: '人生道路' },
  yourPalm: '你的手掌',
  keywordsLabel: '关键词',
  footer: '依据传统手相学，仅供娱乐与自我反思。',
};

const zhStep = (id) => ZH.steps[id] || {};

// The steps, hand types and sections in `lang` ('en' or 'zh'), same shape as the English.
export function content(lang = 'en') {
  if (lang !== 'zh') return { STEPS, ELEMENTS, SECTIONS };
  return {
    STEPS: STEPS.map((s) => ({
      ...s, ...pick(zhStep(s.id), ['title', 'spot']),
      options: s.options.map((o) => ({ ...o, ...pick(zhStep(s.id).options?.[o.id], ['label', 'short', 'hint', 'meaning', 'keywords']) })),
    })),
    ELEMENTS: Object.fromEntries(Object.entries(ELEMENTS).map(([k, e]) => [k, { ...e, ...pick(ZH.elements[k], ['name', 'keywords', 'text']) }])),
    SECTIONS: SECTIONS.map((s) => ({ ...s, title: ZH.sections[s.id] || s.title })),
  };
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj?.[k] != null).map((k) => [k, obj[k]]));
}
