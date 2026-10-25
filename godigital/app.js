import { APPS, LANGS, findLesson, renderScreen, say } from '../src/godigital.js';

const STORAGE_KEY = 'godigital-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function load() {
  const lang = /^zh\b/i.test(navigator.language || '') ? 'zh' : /^my\b/i.test(navigator.language || '') ? 'my' : 'en';
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.done) return { lang, big: false, autoRead: false, ...s };
  } catch { /* ignore */ }
  return { done: {}, lang, big: false, autoRead: false };
}
const state = load();
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };

// Words around the guides, in each language.
const UI = {
  eyebrow: { en: 'Step-by-step picture guides', zh: '一步一步的图解教学', my: 'အဆင့်ဆင့် ပုံဖြင့် လမ်းညွှန်' },
  title: { en: 'Go Digital', zh: '轻松学手机', my: 'ဖုန်းသုံးနည်း လွယ်လွယ်' },
  intro: { en: 'Pick a guide. Then tap the glowing button, just like on your phone.', zh: '选一个教学，然后跟着发光的按钮点，就像在手机上一样。', my: 'လမ်းညွှန်တစ်ခု ရွေးပါ။ ထို့နောက် သင့်ဖုန်းပေါ်ကဲ့သို့ပင် တောက်ပနေသော ခလုတ်ကို နှိပ်ပါ။' },
  steps: { en: (n) => `${n} steps`, zh: (n) => `${n} 步`, my: (n) => `အဆင့် ${n} ဆင့်` },
  done: { en: 'Done ✓', zh: '已完成 ✓', my: 'ပြီးပြီ ✓' },
  all: { en: '‹ All guides', zh: '‹ 全部教学', my: '‹ လမ်းညွှန်အားလုံး' },
  back: { en: 'Back', zh: '上一步', my: 'နောက်သို့' },
  next: { en: 'Next', zh: '下一步', my: 'ရှေ့သို့' },
  finish: { en: 'Finish', zh: '完成', my: 'ပြီးဆုံး' },
  stepOf: { en: (i, n) => `Step ${i} of ${n}`, zh: (i, n) => `第 ${i} / ${n} 步`, my: (i, n) => `အဆင့် ${i} / ${n}` },
  tapHint: { en: '👆 Tap the glowing part of the phone', zh: '👆 点手机上发光的地方', my: '👆 ဖုန်းပေါ်ရှိ တောက်ပနေသော နေရာကို နှိပ်ပါ' },
  lookHint: { en: '👀 Just look, then tap Next', zh: '👀 看一看，然后点“下一步”', my: '👀 ကြည့်ပြီး ရှေ့သို့ ကို နှိပ်ပါ' },
  wellDone: { en: 'Well done! 👍', zh: '做得好！👍', my: 'တော်လိုက်တာ။ 👍' },
  read: { en: '🔊 Read aloud', zh: '🔊 朗读', my: '🔊 အသံဖြင့် ဖတ်ရန်' },
  noVoice: { en: 'This phone has no voice for this language.', zh: '这部手机没有这个语言的语音。', my: 'ဤဖုန်းတွင် ဤဘာသာစကားအတွက် အသံ မရှိပါ။' },
  youDidIt: { en: '🎉 You did it!', zh: '🎉 你学会了！', my: '🎉 သင် လုပ်နိုင်ပါပြီ။' },
  tryIt: { en: 'Now try it on your own phone. Go slowly, and ask family if you get stuck.', zh: '现在在自己的手机上试试看。慢慢来，有问题就问家人。', my: 'ယခု သင့်ဖုန်းပေါ်တွင် စမ်းကြည့်ပါ။ ဖြည်းဖြည်း လုပ်ပါ၊ အခက်အခဲ ရှိလျှင် မိသားစုကို မေးပါ။' },
  nextGuide: { en: 'Next guide: ', zh: '下一个：', my: 'နောက်လမ်းညွှန်: ' },
  again: { en: 'Do it again', zh: '再做一次', my: 'ထပ်လုပ်ရန်' },
  textSize: { en: 'Bigger text', zh: '大字体', my: 'စာလုံးကြီး' },
  autoRead: { en: 'Read each step aloud', zh: '自动朗读每一步', my: 'အဆင့်တိုင်းကို အသံဖြင့် ဖတ်ပေးရန်' },
  disclaimer: {
    en: 'Practice pictures only. The DBS pictures are DBS\'s own screenshots from its help pages and guide; the others are simplified drawings. Real apps change their look and may look different on your phone. Not made by, or linked to, Grab, FairPrice or DBS. Never type your PIN or passwords here. For banking help, always use the bank\'s own app, website or the number on your card.',
    zh: '图片只供练习。DBS 的图片是 DBS 帮助网页和指南里的截图，其他是简化的图画。真正的应用程序会更新外观，在你的手机上可能不一样。本应用与 Grab、FairPrice 和 DBS 无关。绝对不要在这里输入密码或 PIN。银行问题请只用银行自己的应用程序、网站或卡背面的电话。',
    my: 'လေ့ကျင့်ရန် ပုံများသာ ဖြစ်ပါသည်။ DBS ပုံများမှာ DBS ၏ အကူအညီစာမျက်နှာနှင့် လမ်းညွှန်မှ ဖန်သားပြင်ပုံများ ဖြစ်ပြီး ကျန်ပုံများကို ရိုးရှင်းအောင် ရေးဆွဲထားပါသည်။ PIN သို့မဟုတ် စကားဝှက်ကို ဤနေရာတွင် ဘယ်တော့မှ မရိုက်ပါနှင့်။ အမှန်တကယ် အက်ပ်များ၏ ပုံစံ ပြောင်းလဲနိုင်ပြီး သင့်ဖုန်းပေါ်တွင် ကွဲပြားနိုင်ပါသည်။ Grab၊ FairPrice သို့မဟုတ် DBS နှင့် မသက်ဆိုင်ပါ။ ဘဏ်ဆိုင်ရာ အကူအညီအတွက် ဘဏ်၏ ကိုယ်ပိုင်အက်ပ်၊ ဝက်ဘ်ဆိုက် သို့မဟုတ် ကတ်ပေါ်ရှိ နံပါတ်ကိုသာ သုံးပါ။',
  },
};
const ui = (key, ...args) => {
  const v = UI[key][state.lang] ?? UI[key].en;
  return typeof v === 'function' ? v(...args) : v;
};

// ---- Reading aloud -----------------------------------------------------------------------------------

const VOICE_LANG = { en: ['en-SG', 'en-GB', 'en'], zh: ['zh-CN', 'zh-SG', 'zh'], my: ['my-MM', 'my'] };
const speech = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
function voiceFor(lang) {
  const voices = speech?.getVoices() || [];
  for (const code of VOICE_LANG[lang]) {
    const v = voices.find((x) => x.lang.toLowerCase().replace('_', '-').startsWith(code.toLowerCase()));
    if (v) return v;
  }
  return null;
}
function speak(text) {
  if (!speech) return false;
  const voice = voiceFor(state.lang);
  if (!voice) return false;
  speech.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[“”"]/g, ''));
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;
  speech.speak(u);
  return true;
}

// ---- Guide list ------------------------------------------------------------------------------------

let current = null; // { app, lesson }
let step = 0;

function renderList() {
  $('list').innerHTML = `
    <p class="gd-intro">${esc(ui('intro'))}</p>
    ${APPS.map((app) => `<section class="gd-app" style="--app:${app.color}">
      <h2><span class="gd-appicon" aria-hidden="true">${app.emoji}</span><span>${esc(app.name)}<small>${esc(say(app, state.lang))}</small></span></h2>
      <div class="gd-lessons">${app.lessons.map((l) => `<button type="button" class="gd-lesson ${state.done[l.id] ? 'done' : ''}" data-open="${l.id}">
        <span class="gd-lemoji" aria-hidden="true">${l.emoji}</span>
        <b>${esc(say(l, state.lang))}</b>
        <small>${state.done[l.id] ? ui('done') : ui('steps', l.steps.length)}</small>
      </button>`).join('')}</div>
    </section>`).join('')}
    <div class="card gd-settings">
      <label class="check"><input type="checkbox" id="big" ${state.big ? 'checked' : ''}> ${esc(ui('textSize'))}</label>
      <label class="check"><input type="checkbox" id="auto-read" ${state.autoRead ? 'checked' : ''}> ${esc(ui('autoRead'))}</label>
    </div>
    <p class="hint gd-disclaimer">${esc(ui('disclaimer'))}</p>`;
}

// ---- A guide, step by step -------------------------------------------------------------------------

function open(id) {
  current = findLesson(id);
  step = 0;
  $('list').hidden = true;
  $('guide').hidden = false;
  renderStep();
  window.scrollTo(0, 0);
}

function close() {
  speech?.cancel();
  current = null;
  $('list').hidden = false;
  $('guide').hidden = true;
  renderList();
  window.scrollTo(0, 0);
}

function renderStep() {
  const { app, lesson } = current;
  const n = lesson.steps.length;
  const head = `<div class="gd-head"><button type="button" class="secondary small" id="close">${esc(ui('all'))}</button>
    <span>${lesson.emoji} ${esc(say(lesson, state.lang))}</span></div>`;
  if (step >= n) {
    state.done[lesson.id] = true;
    persist();
    const all = APPS.flatMap((a) => a.lessons);
    const next = all[all.indexOf(lesson) + 1];
    $('guide').innerHTML = `${head}
      <div class="card gd-finish"><p class="gd-big">${esc(ui('youDidIt'))}</p><p>${esc(ui('tryIt'))}</p>
      ${next ? `<button type="button" class="primary" data-open="${next.id}">${esc(ui('nextGuide'))}${next.emoji} ${esc(say(next, state.lang))}</button>` : ''}
      <button type="button" class="secondary" id="again">${esc(ui('again'))}</button></div>`;
    return;
  }
  const s = lesson.steps[step];
  const caption = say(s, state.lang);
  $('guide').innerHTML = `${head}
    <div class="gd-dots" aria-label="${esc(ui('stepOf', step + 1, n))}">${lesson.steps.map((_, i) => `<span class="${i < step ? 'past' : i === step ? 'now' : ''}"></span>`).join('')}</div>
    <div class="gd-stage">
      <div class="gd-phone ${s.shot ? 'photo' : ''}" style="--app:${app.color}" aria-hidden="true"><div class="gd-screen" id="screen">${renderScreen(s)}</div></div>
    </div>
    <div class="card gd-caption">
      <p class="gd-stepno">${esc(ui('stepOf', step + 1, n))}</p>
      <p class="gd-say" id="say">${esc(caption)}</p>
      ${s.chips ? `<p class="gd-chips">${s.chips.map((c) => `<span>${esc(say(c, state.lang))}</span>`).join('')}</p>` : ''}
      <p class="gd-hint" id="hint">${esc(s.tap ? ui('tapHint') : ui('lookHint'))}</p>
    </div>
    <div class="gd-nav">
      <button type="button" class="secondary" id="prev" ${step === 0 ? 'disabled' : ''}>‹ ${esc(ui('back'))}</button>
      <button type="button" class="secondary" id="read">${esc(ui('read'))}</button>
      <button type="button" class="primary" id="next">${esc(step === n - 1 ? ui('finish') : ui('next'))} ›</button>
    </div>`;
  if (s.tap) markTarget(s.tap);
  if (state.autoRead) speak(caption);
}

// Glow the button to press, and point at it with a hand.
function markTarget(id) {
  const screen = $('screen');
  const target = screen.querySelector(`[data-id="${id}"]`);
  if (!target) return;
  target.classList.add('gd-glow');
  target.scrollIntoView({ block: 'nearest' });
  const hand = document.createElement('span');
  hand.className = 'gd-hand';
  hand.textContent = '👆';
  const place = () => {
    const a = screen.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const h = hand.offsetHeight || 40;
    let left = b.left - a.left + Math.min(b.width * 0.6, b.width - 8);
    let top = b.top - a.top + b.height * 0.55;
    if (screen.querySelector('.gd-shot')) {
      // On a real screenshot, point from just below the button so its label stays readable,
      // or from above, pointing down, when it's at the bottom of the screen.
      left = b.left - a.left + (b.width > a.width / 2 ? b.width * 0.7 : b.width / 2);
      top = b.bottom - a.top - h * 0.2;
      if (top + h > a.height) {
        hand.textContent = '👇';
        hand.classList.add('down');
        top = b.top - a.top - h * 0.8;
      }
    }
    // Keep the whole hand on the screen, even for buttons at its edge.
    hand.style.left = `${Math.min(left, a.width - h * 0.75)}px`;
    hand.style.top = `${Math.min(top, a.height - h) + screen.scrollTop}px`;
  };
  screen.append(hand);
  place();
}

function go(delta) {
  speech?.cancel();
  step = Math.max(0, step + delta);
  renderStep();
}

// ---- Events ----------------------------------------------------------------------------------------

$('list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-open]');
  if (b) open(b.dataset.open);
});
$('list').addEventListener('change', (e) => {
  if (e.target.id === 'big') { state.big = e.target.checked; persist(); applySize(); }
  if (e.target.id === 'auto-read') { state.autoRead = e.target.checked; persist(); }
});

let doneTimer;
$('guide').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b?.id === 'close') return close();
  if (b?.id === 'prev') return go(-1);
  if (b?.id === 'next') return go(1);
  if (b?.id === 'again') { step = 0; return renderStep(); }
  if (b?.dataset.open) return open(b.dataset.open);
  if (b?.id === 'read') {
    if (!speak($('say').textContent)) $('hint').textContent = ui('noVoice');
    return;
  }
  // Tapping on the phone: the glowing part moves on, anything else gets a reminder.
  if (e.target.closest('#screen')) {
    const s = current.lesson.steps[step];
    if (s.tap && e.target.closest(`[data-id="${s.tap}"]`)) {
      clearTimeout(doneTimer);
      $('hint').textContent = ui('wellDone');
      $('hint').classList.add('ok');
      doneTimer = setTimeout(() => go(1), 700);
    } else {
      $('hint').classList.remove('nudge');
      void $('hint').offsetWidth; // restart the animation
      $('hint').classList.add('nudge');
    }
  }
});

function applySize() { document.body.classList.toggle('gd-bigtext', state.big); }

function applyLanguage() {
  document.documentElement.lang = { en: 'en', zh: 'zh-Hans', my: 'my' }[state.lang];
  document.title = ui('title');
  $('eyebrow').textContent = ui('eyebrow');
  $('title').textContent = ui('title');
  document.querySelector(`input[name="lang"][value="${state.lang}"]`).checked = true;
}

function renderAll() {
  applyLanguage();
  applySize();
  if (current) renderStep(); else renderList();
}

$('langs').innerHTML = LANGS.map(([code, label]) => `<label><input type="radio" name="lang" value="${code}"> ${label}</label>`).join('');
document.querySelectorAll('input[name="lang"]').forEach((el) => el.addEventListener('input', () => {
  speech?.cancel();
  state.lang = el.value;
  persist();
  renderAll();
}));

renderAll();
