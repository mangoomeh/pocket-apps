import { keepUnreadable } from '../shared/store.js';
import { trainBigrams, nextWordOdds, pickWord, trainFilter, scoreMessage, roughTokens } from '../src/learnai.js';
import * as EN from './lessons.js';
import * as ZH from './lessons-zh.js';

const STORAGE_KEY = 'learnai-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.done) return { lang: /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en', ...s };
  } catch { /* ignore */ }
  return { done: {}, lang: /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en' };
}
keepUnreadable(STORAGE_KEY, (s) => !!s.done);
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };

// English or Chinese: the lesson content comes from lessons.js or lessons-zh.js, the rest from t().
const zh = () => state.lang === 'zh';
const t = (en, cn) => (zh() ? cn : en);
const C = () => (zh() ? ZH : EN);

let lesson = null; // the open lesson
let step = 0; // index into its cards, then its quiz questions, then the finish screen
let answers = []; // chosen option per quiz question

// ---- Header and lesson list ------------------------------------------------------------------------

const LEVELS = [['beginner', 'Beginner', '入门'], ['intermediate', 'Intermediate', '进阶']];
const levelOf = (l) => l.level || 'beginner';
const doneCount = (list) => list.filter((l) => state.done[l.id]).length;

function renderProgress() {
  const { LESSONS } = C();
  const n = doneCount(LESSONS);
  const total = LESSONS.length;
  $('progress-bar').style.width = `${(n / total) * 100}%`;
  const per = LEVELS.map(([k, en, cn]) => [LESSONS.filter((l) => levelOf(l) === k).length, en, cn]);
  $('progress-line').textContent = n === total
    ? t(`All ${total} lessons done 🎉`, `全部 ${total} 课都完成了 🎉`)
    : n ? t(`${n} of ${total} lessons done`, `已完成 ${n} / ${total} 课`)
      : t(per.map(([c, en]) => `${c} ${en.toLowerCase()}`).join(' + ') + ' lessons', per.map(([c, , cn]) => `${cn} ${c} 课`).join(' + '));
}

const lessonRow = (l, i) => {
  const d = state.done[l.id];
  return `<li><button type="button" class="la-lesson ${d ? 'done' : ''}" data-open="${l.id}">
    <span class="la-emoji" aria-hidden="true">${l.emoji}</span>
    <span class="la-text"><strong>${i + 1}. ${esc(l.title)}</strong><small>${t(`${l.minutes} min`, `${l.minutes} 分钟`)}${d ? t(` · quiz ${d.score}/${l.quiz.length}`, ` · 测验 ${d.score}/${l.quiz.length}`) : ''}</small></span>
    <span class="la-check" aria-label="${d ? t('Done', '已完成') : t('Not done', '未完成')}">${d ? '✓' : '›'}</span></button></li>`;
};

function renderList() {
  const { LESSONS } = C();
  const next = LESSONS.find((l) => !state.done[l.id]);
  const beginners = LESSONS.filter((l) => levelOf(l) === 'beginner');
  const intermediate = LESSONS.filter((l) => levelOf(l) === 'intermediate');
  // Finishing the beginner lessons earns a badge and an invitation to the next level.
  const levelUp = next && levelOf(next) === 'intermediate' && !doneCount(intermediate);
  const top = !next
    ? `<div class="card la-cert"><p class="la-cert-emoji">🏆</p><h2>${t('You finished both levels!', '两个级别都完成了！')}</h2>
      <p class="hint">${t('You know how AI works, how to get good answers from it, and how to keep yourself and your data safe. Keep practising: the best way to learn is to use it.', '你已经知道 AI 怎么运作、怎么得到好的回答，以及怎么保护自己和你的资料。继续练习：最好的学法就是去用。')}</p></div>`
    : levelUp
      ? `<div class="card la-cert"><p class="la-cert-emoji">🏅</p><h2>${t('Beginner level done!', '入门级完成了！')}</h2>
        <p class="hint">${t('You know how AI learns, writes and slips up, how to ask it well and how to stay safe. Ready to get more out of it?', '你已经知道 AI 怎么学习、怎么写字、为什么会出错、怎么问得好，以及怎么保护自己。准备好更上一层楼了吗？')}</p>
        <button class="primary" type="button" data-open="${next.id}">${t('Start Intermediate: ', '开始进阶：')}${next.emoji} ${esc(next.title)}</button></div>`
      : `<button class="primary la-continue" type="button" data-open="${next.id}">${doneCount(LESSONS) ? t('Continue', '继续') : t('Start', '开始')}${t(': ', '：')}${next.emoji} ${esc(next.title)}</button>`;
  const section = (list, [, en, cn], about) => `
    <h2 class="la-level">${t(en, cn)} <small>${t(`${list.length} lessons · about ${list.reduce((m, l) => m + l.minutes, 0)} min`, `${list.length} 课 · 约 ${list.reduce((m, l) => m + l.minutes, 0)} 分钟`)}${doneCount(list) ? t(` · ${doneCount(list)} done`, ` · 已完成 ${doneCount(list)}`) : ''}</small></h2>
    <p class="hint la-level-about">${about}</p>
    <ol class="la-lessons">${list.map(lessonRow).join('')}</ol>`;
  $('lesson-list').innerHTML = `${top}
    ${section(beginners, LEVELS[0], t('Start here: what AI is, how it works, and how to use it safely.', '从这里开始：AI 是什么、怎么运作，以及怎么安全地使用。'))}
    ${section(intermediate, LEVELS[1], t('For when you already use a chatbot: better answers, files and photos, agents, and protecting your data.', '给已经在用聊天机器人的你：更好的回答、文件和照片、智能体，以及保护你的资料。'))}
    ${doneCount(LESSONS) ? `<p class="la-reset"><button class="linkish" type="button" id="reset">${t('Reset my progress', '重设我的进度')}</button></p>` : ''}`;
}

// ---- Lesson view -----------------------------------------------------------------------------------

function openLesson(id) {
  lesson = C().LESSONS.find((l) => l.id === id);
  step = 0;
  answers = [];
  $('lesson-list').hidden = true;
  $('lesson-view').hidden = false;
  renderLesson();
}

function closeLesson() {
  lesson = null;
  $('lesson-list').hidden = false;
  $('lesson-view').hidden = true;
  renderList();
  window.scrollTo(0, 0);
}

function renderLesson() {
  const nCards = lesson.cards.length;
  const nQuiz = lesson.quiz.length;
  const total = nCards + nQuiz;
  const dots = Array.from({ length: total }, (_, i) => `<span class="${i < step ? 'past' : i === step ? 'now' : ''} ${i >= nCards ? 'q' : ''}"></span>`).join('');
  let body;
  let canNext = true;
  if (step < nCards) {
    const c = lesson.cards[step];
    body = c.demo ? `<div class="card la-demo" id="demo"></div>` : `<div class="card la-card"><h2>${c.h}</h2>${c.body}</div>`;
  } else if (step < total) {
    const qi = step - nCards;
    const q = lesson.quiz[qi];
    const picked = answers[qi];
    canNext = picked != null;
    body = `<div class="card la-quiz"><p class="eyebrow-dark">${t(`Quick check · ${qi + 1} of ${nQuiz}`, `小测验 · 第 ${qi + 1} / ${nQuiz} 题`)}</p><h2>${esc(q.q)}</h2>
      <div class="la-options">${q.options.map((o, i) => {
        const cls = picked == null ? '' : i === q.answer ? 'right' : i === picked ? 'wrong' : 'dim';
        return `<button type="button" class="la-option ${cls}" data-pick="${i}" ${picked != null ? 'disabled' : ''}>${esc(o)}</button>`;
      }).join('')}</div>
      ${picked != null ? `<p class="la-why ${picked === q.answer ? 'right' : 'wrong'}"><b>${picked === q.answer ? t('Yes!', '答对了！') : t('Not quite.', '不太对。')}</b> ${esc(q.why)}</p>` : ''}</div>`;
  } else {
    const score = lesson.quiz.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
    const prev = state.done[lesson.id];
    state.done[lesson.id] = { score: Math.max(score, prev?.score ?? 0) };
    persist();
    renderProgress();
    const { LESSONS } = C();
    const next = LESSONS[LESSONS.indexOf(lesson) + 1];
    body = `<div class="card la-finish"><p class="la-cert-emoji">${score === nQuiz ? '🌟' : '👍'}</p>
      <h2>${t('Lesson done!', '这一课完成了！')}</h2><p>${t(`You got <b>${score} of ${nQuiz}</b>${score === nQuiz ? ' — perfect.' : '. Have another look whenever you like.'}`, `你答对了 <b>${score} / ${nQuiz}</b> 题${score === nQuiz ? '，满分！' : '。随时可以回来再看一遍。'}`)}</p>
      ${next ? `<button class="primary" type="button" data-open="${next.id}">${t('Next: ', '下一课：')}${next.emoji} ${esc(next.title)}</button>` : `<button class="primary" type="button" id="to-list">${t('See your progress 🏅', '查看你的进度 🏅')}</button>`}
      <button class="secondary" type="button" id="again">${t('Do this lesson again', '重做这一课')}</button></div>`;
  }
  const atEnd = step >= total;
  $('lesson-view').innerHTML = `
    <div class="la-lesson-head"><button class="secondary small" type="button" id="close">${t('‹ Lessons', '‹ 课程')}</button>
      <span>${lesson.emoji} ${esc(lesson.title)}</span></div>
    <div class="la-dots">${dots}</div>
    ${body}
    ${atEnd ? '' : `<div class="la-nav">
      <button class="secondary" type="button" id="prev" ${step === 0 ? 'disabled' : ''}>${t('Back', '上一步')}</button>
      <button class="primary" type="button" id="next" ${canNext ? '' : 'disabled'}>${step === total - 1 ? t('Finish', '完成') : step === nCards - 1 ? t('Quick quiz', '小测验') : t('Next', '下一步')}</button></div>`}`;
  const c = lesson.cards[step];
  if (c?.demo) DEMOS[c.demo]($('demo'), c);
}

function go(delta) {
  step = Math.max(0, step + delta);
  renderLesson();
  window.scrollTo(0, 0);
}

// ---- Demos -----------------------------------------------------------------------------------------

const DEMOS = { predict: demoPredict, spam: demoSpam, tokens: demoTokens, prompt: demoPrompt, check: demoCheck, sort: demoSort, judge: demoJudge };
const pct = (p) => `${Math.round(p * 100)}%`;
const verdict = (s) => {
  const scam = s.p >= 0.5;
  const sure = pct(scam ? s.p : 1 - s.p);
  return `${scam ? `🚨 ${t('Scam', '诈骗')}` : `✅ ${t('Normal', '正常')}`} <small>${t(`${sure} sure`, `把握 ${sure}`)}</small>`;
};

const bigramsFor = new Map();
function demoPredict(box) {
  const { PREDICT_TEXT, PREDICT_STARTS } = C();
  if (!bigramsFor.has(state.lang)) bigramsFor.set(state.lang, trainBigrams(PREDICT_TEXT));
  const bigrams = bigramsFor.get(state.lang);
  let sentence = [];
  let temperature = 1;
  const last = () => (sentence.length ? sentence[sentence.length - 1] : '<s>');
  const context = () => ['<s>', ...sentence];
  const ended = () => ['.', '?', '!', '。', '？', '！'].includes(last());
  // Chinese is written without spaces between words.
  const text = () => (zh() ? sentence.join('') : sentence.map((w, i) => (i && !/^[.,!?]$/.test(w) ? ` ${w}` : w)).join('').replace(/^./, (c) => c.toUpperCase()));
  const add = (w) => { if (w) sentence.push(w); draw(); };
  function draw() {
    const odds = sentence.length && !ended() ? nextWordOdds(bigrams, context(), temperature).slice(0, 5) : [];
    const n = PREDICT_TEXT.split('\n').length;
    box.innerHTML = `<p class="eyebrow-dark">${t('Try it: be the chatbot', '试试看：当一次聊天机器人')}</p>
      <h2>${t('What word comes next?', '下一个词是什么？')}</h2>
      <p class="hint">${t(`This tiny model has read ${n} everyday sentences and only looks at the last two words, so it sometimes writes nonsense. Real chatbots read billions of sentences and look back over the whole conversation. Tap a word, or let it pick.`,
        `这个小模型只读过 ${n} 个日常句子，而且只看最后两个词，所以有时会写出不通的句子。真正的聊天机器人读过几十亿个句子，还会回顾整段对话。点一个词，或让它自己选。`)}</p>
      ${sentence.length ? '' : `<p class="la-label">${t('Pick a first word:', '选第一个词：')}</p><div class="la-chips">${PREDICT_STARTS.map((w) => `<button type="button" class="la-chip" data-w="${w}">${w}</button>`).join('')}</div>`}
      ${sentence.length ? `<p class="la-sentence">${esc(text())}<span class="la-caret">${ended() ? '' : '▍'}</span></p>` : ''}
      ${odds.length ? `<div class="la-odds">${odds.map((o) => `<button type="button" class="la-odd" data-w="${esc(o.word)}"><span class="w">${esc(o.word)}</span><span class="bar"><span style="width:${pct(o.p)}"></span></span><span class="p">${pct(o.p)}</span></button>`).join('')}</div>` : ''}
      ${sentence.length ? `<div class="la-row">
        ${ended() ? '' : `<button type="button" class="secondary small" id="p-one">${t('Let AI pick one', '让 AI 选一个')}</button><button type="button" class="secondary small" id="p-all">${t('Finish the sentence', '把句子写完')}</button>`}
        <button type="button" class="secondary small" id="p-reset">${t('Start again', '重新开始')}</button></div>` : ''}
      <label class="field"><span>${t('Temperature', '温度')}${t(': ', '：')}<b>${temperature.toFixed(1)}</b> ${temperature < 0.7 ? t('(safe, predictable)', '（稳定、可预测）') : temperature > 1.4 ? t('(wild, creative)', '（狂野、有创意）') : t('(normal)', '（一般）')}</span>
        <input type="range" id="p-temp" min="0.2" max="2" step="0.1" value="${temperature}"></label>
      <p class="hint">${t('Watch the percentages change as you move the slider: low makes the top word win more often, high gives the long shots a chance.', '拉动滑杆时留意百分比的变化：调低时最可能的词更常胜出，调高时冷门的词也有机会。')}</p>`;
  }
  box.onclick = (e) => {
    const w = e.target.closest('[data-w]')?.dataset.w;
    if (w) { add(w); return; }
    const id = e.target.closest('button')?.id;
    if (id === 'p-one') add(pickWord(nextWordOdds(bigrams, context(), temperature), Math.random()));
    if (id === 'p-all') {
      for (let i = 0; i < 15 && !ended(); i++) {
        const w2 = pickWord(nextWordOdds(bigrams, context(), temperature), Math.random());
        if (!w2) break;
        sentence.push(w2);
      }
      draw();
    }
    if (id === 'p-reset') { sentence = []; draw(); }
  };
  box.oninput = (e) => { if (e.target.id === 'p-temp') { temperature = Number(e.target.value); draw(); } };
  draw();
}

function demoSpam(box) {
  const { SPAM_TRAIN, SPAM_TEST } = C();
  let labels = [];
  let custom = '';
  function draw() {
    if (labels.length < SPAM_TRAIN.length) {
      const m = SPAM_TRAIN[labels.length];
      box.innerHTML = `<p class="eyebrow-dark">${t('Try it: be the teacher', '试试看：当一次老师')}</p>
        <h2>${t('Teach a scam filter', '教一个诈骗过滤器')}</h2>
        <p class="hint">${t(`Label each message. The filter learns from your answers, nothing else. Message ${labels.length + 1} of ${SPAM_TRAIN.length}.`, `给每条信息贴上标签。过滤器只从你的答案学习，别的什么都不知道。第 ${labels.length + 1} / ${SPAM_TRAIN.length} 条。`)}</p>
        <div class="la-msg">${esc(m.text)}</div>
        <div class="la-row la-two"><button type="button" class="la-big bad" data-label="scam">🚨 ${t('Scam', '诈骗')}</button><button type="button" class="la-big good" data-label="normal">✅ ${t('Normal', '正常')}</button></div>`;
      return;
    }
    const model = trainFilter(SPAM_TRAIN.map((m, i) => ({ text: m.text, label: labels[i] })));
    const wrongTeach = labels.filter((l, i) => l !== SPAM_TRAIN[i].label).length;
    const results = SPAM_TEST.map((m) => ({ ...m, s: scoreMessage(model, m.text) }));
    const right = results.filter((r) => r.s && (r.s.p >= 0.5) === (r.label === 'scam')).length;
    const row = (text, s, truth) => {
      if (!s) return `<div class="la-test"><p>${esc(text)}</p><p class="hint">${t('It needs at least one scam and one normal example to learn.', '它至少需要一个诈骗和一个正常的例子才能学习。')}</p></div>`;
      const scam = s.p >= 0.5;
      const clues = s.clues.slice(0, 3).map((c) => `<span class="la-clue ${c.weight > 0 ? 'bad' : 'good'}">${esc(c.word)}</span>`).join(' ');
      return `<div class="la-test ${truth == null ? '' : scam === (truth === 'scam') ? 'ok' : 'miss'}">
        <p>${esc(text)}</p>
        <p class="la-verdict">${verdict(s)}${truth == null ? '' : scam === (truth === 'scam') ? ` <b class="ok">${t('✓ right', '✓ 对')}</b>` : ` <b class="miss">${t('✗ wrong', '✗ 错')}</b>`}</p>
        ${clues ? `<p class="hint">${t('Clue words', '线索词')}${t(': ', '：')}${clues}</p>` : ''}</div>`;
    };
    box.innerHTML = `<p class="eyebrow-dark">${t('Try it: be the teacher', '试试看：当一次老师')}</p>
      <h2>${t('Now it\'s tested on messages it has never seen', '现在用它没看过的信息来考它')}</h2>
      ${results.map((r) => row(r.text, r.s, r.label)).join('')}
      <p class="la-score">${t(`It got <b>${right} of ${SPAM_TEST.length}</b> right.`, `它答对了 <b>${right} / ${SPAM_TEST.length}</b> 条。`)}
        ${wrongTeach ? t(`You labelled ${wrongTeach} example${wrongTeach > 1 ? 's' : ''} differently from the usual answer, so it learned that too. Rubbish in, rubbish out!`, `你有 ${wrongTeach} 个例子的标签和一般答案不同，所以它也学到了。垃圾进，垃圾出！`) : t(`It learned only from your ${SPAM_TRAIN.length} examples: that's how AI learns.`, `它只从你的 ${SPAM_TRAIN.length} 个例子学习：AI 就是这样学的。`)}</p>
      ${zh() ? '<p class="hint">中文没有空格，所以它把文字切成两个字一组来学，线索词就是这些两个字的组合。</p>' : ''}
      <label class="field"><span>${t('Type your own message to test it', '输入你自己的信息来考它')}</span><input id="s-own" value="${esc(custom)}" placeholder="${t('e.g. Claim your free prize now', '例如：马上领取你的免费奖品')}" autocomplete="off"></label>
      <div id="s-own-out">${custom.trim() ? row(custom, scoreMessage(model, custom), null) : ''}</div>
      <button type="button" class="secondary small" id="s-reset">${t('Teach it again', '重新教它')}</button>`;
  }
  box.onclick = (e) => {
    const l = e.target.closest('[data-label]')?.dataset.label;
    if (l) { labels.push(l); draw(); return; }
    if (e.target.closest('#s-reset')) { labels = []; custom = ''; draw(); }
  };
  box.oninput = (e) => {
    if (e.target.id !== 's-own') return;
    custom = e.target.value;
    const model = trainFilter(SPAM_TRAIN.map((m, i) => ({ text: m.text, label: labels[i] })));
    const s = scoreMessage(model, custom);
    // Redraw only the result so typing isn't interrupted.
    const tmp = document.createElement('div');
    if (custom.trim() && s) {
      tmp.innerHTML = `<div class="la-test"><p class="la-verdict">${verdict(s)}</p>
        ${s.clues.length ? `<p class="hint">${t('Clue words', '线索词')}${t(': ', '：')}${s.clues.slice(0, 3).map((c) => `<span class="la-clue ${c.weight > 0 ? 'bad' : 'good'}">${esc(c.word)}</span>`).join(' ')}</p>` : `<p class="hint">${t('None of these words were in its lessons, so it\'s just guessing.', '这些字都不在它学过的内容里，所以它只是在猜。')}</p>`}</div>`;
    }
    box.querySelector('#s-own-out').innerHTML = tmp.innerHTML;
  };
  draw();
}

function demoTokens(box) {
  const start = t('I want to eat chicken rice tonight! Unbelievable. 你好 2026', '我今晚想吃鸡饭！Unbelievable. Hello 2026');
  box.innerHTML = `<p class="eyebrow-dark">${t('Try it: see what AI sees', '试试看：AI 眼中的文字')}</p>
    <h2>${t('Split text into tokens', '把文字切成 token')}</h2>
    <p class="hint">${t('Type anything. Each coloured block is roughly one token. (Every AI splits a little differently; this is a close imitation.)', '随便输入什么。每个彩色方块大约是一个 token。（每个 AI 切法都有点不同，这里是一个相近的模仿。）')}</p>
    <textarea id="t-in" class="la-textarea" rows="3">${esc(start)}</textarea>
    <div class="la-tokens" id="t-out"></div>
    <p class="la-score" id="t-count"></p>`;
  const draw = () => {
    const text = box.querySelector('#t-in').value;
    const toks = roughTokens(text);
    box.querySelector('#t-out').innerHTML = toks.map((tk, i) => `<span class="tk c${i % 5}">${esc(tk).replace(/ /g, '␣').replace(/\n/g, '↵')}</span>`).join('');
    const words = (text.match(/\S+/g) || []).length;
    box.querySelector('#t-count').innerHTML = t(`<b>${toks.length}</b> tokens · ${words} words · ${text.length} characters`, `<b>${toks.length}</b> 个 token · ${text.length} 个字符`);
  };
  box.querySelector('#t-in').addEventListener('input', draw);
  draw();
}

function demoPrompt(box) {
  const f = zh()
    ? { task: '写一条信息给房东', context: '厨房的水龙头已经漏水一个星期了', who: '我的房东', vague: '写信息', formats: ['100 字以内', '用列点', '用简单的表格', '分 3 个简短步骤', '用 WhatsApp 的口吻'], tones: ['有礼貌但坚定', '温暖亲切', '正式', '简单，给孩子看', '幽默'] }
    : { task: 'write a message to my landlord', context: 'the kitchen tap has been leaking for a week', who: 'my landlord', vague: 'write a', formats: ['under 100 words', 'as bullet points', 'as a simple table', 'in 3 short steps', 'in WhatsApp style'], tones: ['polite but firm', 'warm and friendly', 'formal', 'simple, for a child', 'funny'] };
  box.innerHTML = `<p class="eyebrow-dark">${t('Try it: build a prompt', '试试看：组一个提示词')}</p>
    <h2>${t('Prompt builder', '提示词组合器')}</h2>
    <p class="hint">${t('Fill in the parts. Watch a vague request turn into a clear one.', '把各部分填上，看看含糊的要求怎么变成清楚的要求。')}</p>
    <label class="field"><span>${t('1. Task: what should it do?', '1. 任务：要它做什么？')}</span><input id="b-task" value="${esc(f.task)}"></label>
    <label class="field"><span>${t('2. Context: what does it need to know?', '2. 背景：它需要知道什么？')}</span><input id="b-context" value="${esc(f.context)}"></label>
    <label class="field"><span>${t('3. Who is it for?', '3. 给谁看？')}</span><input id="b-who" value="${esc(f.who)}"></label>
    <label class="field"><span>${t('4. Format', '4. 格式')}</span><select id="b-format">${f.formats.map((o) => `<option>${o}</option>`).join('')}</select></label>
    <label class="field"><span>${t('5. Tone', '5. 语气')}</span><select id="b-tone">${f.tones.map((o) => `<option>${o}</option>`).join('')}</select></label>
    <p class="la-label">${t('Vague', '含糊')}${t(': ', '：')}<span class="la-weak">${t(`"${esc(f.vague)}…"`, `“${esc(f.vague)}……”`)}</span></p>
    <p class="la-label">${t('Clear:', '清楚：')}</p>
    <div class="la-built" id="b-out"></div>
    <button type="button" class="primary" id="b-copy">${t('Copy prompt', '复制提示词')}</button>`;
  const draw = () => {
    const v = (id) => box.querySelector(id).value.trim();
    const parts = zh() ? [
      v('#b-task') && `请${v('#b-task')}。`,
      v('#b-context') && `背景：${v('#b-context')}。`,
      v('#b-who') && `这是给${v('#b-who')}看的。`,
      `语气要${v('#b-tone')}，${v('#b-format')}。`,
    ] : [
      v('#b-task') && `Please ${v('#b-task')}.`,
      v('#b-context') && `Background: ${v('#b-context')}.`,
      v('#b-who') && `It's for ${v('#b-who')}.`,
      `Make it ${v('#b-tone')}, ${v('#b-format')}.`,
    ];
    box.querySelector('#b-out').textContent = parts.filter(Boolean).join(zh() ? '' : ' ');
  };
  box.oninput = draw;
  box.querySelector('#b-copy').addEventListener('click', () => copy(box.querySelector('#b-out').textContent, box.querySelector('#b-copy')));
  draw();
}

function demoCheck(box) {
  const { CHECK_ITEMS } = C();
  const picks = [];
  function draw() {
    box.innerHTML = `<p class="eyebrow-dark">${t('Try it: be the checker', '试试看：当一次核查员')}</p>
      <h2>${t('Trust it, or double-check?', '相信，还是再核实？')}</h2>
      <p class="hint">${t('A chatbot said each of these. Decide which you\'d check before relying on it.', '下面每句都是聊天机器人说的。决定哪些你会先核实，再拿来用。')}</p>
      ${CHECK_ITEMS.map((it, i) => {
        const p = picks[i];
        const right = p != null && p === it.risky;
        return `<div class="la-test ${p == null ? '' : right ? 'ok' : 'miss'}"><p>${esc(it.text)}</p>
          ${p == null ? `<div class="la-row la-two"><button type="button" class="secondary small" data-c="${i}" data-v="0">👍 ${t('Fine', '没问题')}</button><button type="button" class="secondary small" data-c="${i}" data-v="1">🔍 ${t('Double-check', '再核实')}</button></div>`
          : `<p class="hint"><b>${right ? t('Good call.', '判断正确。') : t('Hmm.', '嗯……')}</b> ${esc(it.why)}</p>`}</div>`;
      }).join('')}`;
  }
  box.onclick = (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    picks[Number(b.dataset.c)] = b.dataset.v === '1';
    draw();
  };
  draw();
}

// A sorting game whose words come from the lesson card: each item is either fine or flagged.
function demoJudge(box, card) {
  const picks = [];
  function draw() {
    const answered = picks.filter((p) => p != null).length;
    const right = card.items.filter((it, i) => picks[i] === it.flag).length;
    box.innerHTML = `<p class="eyebrow-dark">${t('Try it', '试试看')}</p>
      <h2>${esc(card.title)}</h2>
      <p class="hint">${esc(card.hint)}</p>
      ${card.items.map((it, i) => {
        const p = picks[i];
        const ok = p === it.flag;
        return `<div class="la-test ${p == null ? '' : ok ? 'ok' : 'miss'}"><p>${esc(it.text)}</p>
          ${p == null ? `<div class="la-row la-two"><button type="button" class="secondary small" data-j="${i}" data-v="0">${esc(card.labels[0])}</button><button type="button" class="secondary small" data-j="${i}" data-v="1">${esc(card.labels[1])}</button></div>`
          : `<p class="hint"><b>${ok ? t('Good call.', '判断正确。') : t('Not quite.', '不太对。')}</b> ${esc(it.why)}</p>`}</div>`;
      }).join('')}
      ${answered === card.items.length ? `<p class="la-score">${t(`You got <b>${right} of ${card.items.length}</b> right.`, `你答对了 <b>${right} / ${card.items.length}</b> 题。`)}</p>` : ''}`;
  }
  box.onclick = (e) => {
    const b = e.target.closest('[data-j]');
    if (!b) return;
    picks[Number(b.dataset.j)] = b.dataset.v === '1';
    draw();
  };
  draw();
}

function demoSort(box) {
  const { SORT_ITEMS } = C();
  let i = 0;
  let score = 0;
  let last = null;
  function draw() {
    if (i >= SORT_ITEMS.length) {
      box.innerHTML = `<p class="eyebrow-dark">${t('Try it: sort the jobs', '试试看：把工作分类')}</p><h2>${t(`${score} of ${SORT_ITEMS.length} right`, `答对 ${score} / ${SORT_ITEMS.length}`)}</h2>
        <p class="hint">${score >= 6 ? t('You have a good instinct for when to lean on AI.', '你很清楚什么时候可以靠 AI。') : t('Rule of thumb: drafts, explanations and ideas are great; exact facts, decisions and official forms need you.', '简单原则：草稿、解释和点子很适合；准确的事实、决定和正式表格要靠你自己。')}</p>
        <button type="button" class="secondary small" id="o-again">${t('Play again', '再玩一次')}</button>`;
      return;
    }
    const it = SORT_ITEMS[i];
    box.innerHTML = `<p class="eyebrow-dark">${t(`Try it: sort the jobs · ${i + 1} of ${SORT_ITEMS.length}`, `试试看：把工作分类 · 第 ${i + 1} / ${SORT_ITEMS.length} 项`)}</p>
      <h2>${t('Good use of AI, or be careful?', '适合用 AI，还是要小心？')}</h2>
      ${last ? `<p class="la-why ${last.ok ? 'right' : 'wrong'}">${t(`${last.ok ? '✓ Right' : '✗ Not quite'}: "${esc(last.text)}" is ${last.good ? 'a good use' : 'one to be careful with'}.`, `${last.ok ? '✓ 对' : '✗ 不太对'}：“${esc(last.text)}”${last.good ? '很适合用 AI' : '要小心使用'}。`)}</p>` : ''}
      <div class="la-msg">${esc(it.text)}</div>
      <div class="la-row la-two"><button type="button" class="la-big good" data-g="1">✅ ${t('Good use', '适合')}</button><button type="button" class="la-big bad" data-g="0">⚠️ ${t('Be careful', '要小心')}</button></div>`;
  }
  box.onclick = (e) => {
    if (e.target.closest('#o-again')) { i = 0; score = 0; last = null; draw(); return; }
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const it = SORT_ITEMS[i];
    const ok = (b.dataset.g === '1') === it.good;
    if (ok) score++;
    last = { ok, text: it.text, good: it.good };
    i++;
    draw();
  };
  draw();
}

// ---- Prompts and words -----------------------------------------------------------------------------

async function copy(text, button) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  const was = button.textContent;
  button.textContent = t('Copied ✓', '已复制 ✓');
  setTimeout(() => { button.textContent = was; }, 1500);
}

function renderPrompts() {
  $('prompt-list').innerHTML = C().PROMPTS.map((p, i) => `<div class="card la-prompt">
    <h3>${p.emoji} ${esc(p.title)}</h3>
    <p>${esc(p.text).replace(/\[([^\]]+)\]/g, '<mark>[$1]</mark>')}</p>
    <button type="button" class="secondary small" data-copy="${i}">${t('Copy', '复制')}</button></div>`).join('');
}

function renderGlossary() {
  const q = $('word-search').value.trim().toLowerCase();
  const rows = C().GLOSSARY.filter(([w, d]) => !q || w.toLowerCase().includes(q) || d.toLowerCase().includes(q));
  $('glossary').innerHTML = rows.length ? rows.map(([w, d]) => `<dt>${esc(w)}</dt><dd>${esc(d)}</dd>`).join('') : `<dd class="hint">${t('No match. Try another word.', '找不到，换个词试试。')}</dd>`;
}

// ---- Start-up --------------------------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('lesson-list').addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  if (o) { openLesson(o.dataset.open); window.scrollTo(0, 0); return; }
  if (e.target.closest('#reset') && confirm(t('Reset your progress? Your quiz scores will be cleared.', '要重设进度吗？你的测验分数会被清除。'))) {
    state.done = {};
    persist();
    renderProgress();
    renderList();
  }
});
$('lesson-view').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.closest('#demo')) return;
  if (b.id === 'close' || b.id === 'to-list') closeLesson();
  else if (b.id === 'prev') go(-1);
  else if (b.id === 'next') go(1);
  else if (b.id === 'again') openLesson(lesson.id);
  else if (b.dataset.open) { openLesson(b.dataset.open); window.scrollTo(0, 0); }
  else if (b.dataset.pick != null) {
    answers[step - lesson.cards.length] = Number(b.dataset.pick);
    renderLesson();
  }
});
$('prompt-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) copy(C().PROMPTS[Number(b.dataset.copy)].text, b);
});
$('word-search').addEventListener('input', renderGlossary);

// Static text: elements carry their Chinese in data-zh; the English is the original markup.
function applyLanguage() {
  document.documentElement.lang = zh() ? 'zh-Hans' : 'en';
  document.title = t('AI for Beginners', 'AI 入门');
  document.querySelectorAll('[data-zh]').forEach((el) => {
    if (el.dataset.en == null) el.dataset.en = el.innerHTML;
    el.innerHTML = zh() ? el.dataset.zh : el.dataset.en;
  });
  document.querySelectorAll('[data-zh-placeholder]').forEach((el) => {
    if (el.dataset.enPlaceholder == null) el.dataset.enPlaceholder = el.placeholder;
    el.placeholder = zh() ? el.dataset.zhPlaceholder : el.dataset.enPlaceholder;
  });
  document.querySelector(`input[name="lang"][value="${state.lang}"]`).checked = true;
}

function renderAll() {
  applyLanguage();
  renderProgress();
  renderList();
  renderPrompts();
  renderGlossary();
  // An open lesson switches language where it is.
  if (lesson) { lesson = C().LESSONS.find((l) => l.id === lesson.id); renderLesson(); }
}

document.querySelectorAll('input[name="lang"]').forEach((el) => el.addEventListener('input', () => {
  state.lang = el.value;
  persist();
  renderAll();
}));

renderAll();
