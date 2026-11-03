import { keepUnreadable } from '../shared/store.js';
import {
  run, compileFunction, formatNumber, toFraction, derivative, integrate, findZero, findExtremum,
  CalcError, ANS_STARTERS, Y_TOKENS, FRAC_OPEN, FRAC_MID, FRAC_CLOSE, isFracMark,
} from '../src/ti84.js';

// ---- Screen geometry (logical pixels, like a 320×240 colour LCD) -------------------------

const W = 320, H = 240, BAR = 18;
const ROWS = 9, ROW_H = 24, TOP = BAR + 3;
const COLS = 26;
const GY0 = BAR, GW = W, GH = H - BAR; // graph area
const FONT = '"DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", ui-monospace, monospace';
const Y_COLORS = ['#1f5fd8', '#d8262b', '#111111', '#c2188f', '#0a8a3a', '#e0730c', '#7a4a1d', '#1b2a7a', '#2f9fd8', '#6b6b6b'];
const STORAGE_KEY = 'calc84-v1';
const $ = (id) => document.getElementById(id);

// ---- Persistent state -----------------------------------------------------------------------

const STANDARD = { xmin: -10, xmax: 10, xscl: 1, ymin: -10, ymax: 10, yscl: 1 };

function defaults() {
  return {
    mode: { degrees: false, fix: null, sci: false },
    fmt: { coords: true, grid: false, axes: true },
    vars: {},
    ans: 0,
    yeq: Y_TOKENS.map(() => ({ tokens: [], on: true })),
    win: { ...STANDARD },
    tbl: { start: 0, step: 1 },
    history: [],
    entries: [],
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.yeq) return { ...defaults(), ...s };
  } catch { /* storage unavailable: start fresh */ }
  return defaults();
}

keepUnreadable(STORAGE_KEY, (s) => !!s.yeq);
const state = load();
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* not remembered */ }
  }, 200);
}
addEventListener('pagehide', () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* not remembered */ }
});

// ---- Transient UI state -----------------------------------------------------------------------

const ed = (tokens = [], fresh = false) => ({ tokens: [...tokens], cursor: fresh ? 0 : tokens.length, fresh });

const ui = {
  screen: 'home', // home yeq window tblset mode format graph table menu error off
  shift: null, // '2nd' | 'alpha' | 'alock'
  overwrite: false,
  blink: true,
  home: ed(),
  recall: -1, // index into entries while pressing ↑ on the home screen
  yeqSel: 0,
  yeqEd: null,
  field: 0, // selected row on WINDOW / TBLSET
  fieldEd: null,
  opt: { row: 0, col: 0 }, // MODE / FORMAT cursor
  menu: null,
  error: null,
  graph: { mode: 'free', cx: GW >> 1, cy: GY0 + (GH >> 1), f: 0, x: 0, calc: null, prompt: null, box: null, info: null },
  table: { row: 0, col: 0, top: 0 },
  flash: null,
};

const compiledY = new Map();
function recompileY() {
  compiledY.clear();
  graphCache = null;
}
function yFn(i) {
  if (!compiledY.has(i)) compiledY.set(i, compileFunction(state.yeq[i].tokens, env));
  return compiledY.get(i);
}
const yByName = (name) => yFn(Y_TOKENS.indexOf(name))?.fn ?? null;
const env = () => ({ vars: state.vars, ans: state.ans, degrees: state.mode.degrees, y: yByName });
const activeFns = () => state.yeq.map((y, i) => i).filter((i) => state.yeq[i].on && yFn(i).fn);
const fmt = (v, digits = 10) => formatNumber(v, { fix: state.mode.fix, sci: state.mode.sci, digits });
// Plain-text form of tokens. A stacked fraction reads as n/d, with brackets only
// around parts that need them: X/2, (X+1)/2.
function tokensText(tokens) {
  let i = 0;
  const simple = (t) => /^([0-9.]+|[A-Zθπe]|Ans)$/.test(t);
  const part = (stops) => {
    let out = '';
    while (i < tokens.length && !stops.includes(tokens[i])) {
      if (tokens[i] === FRAC_OPEN) {
        i++;
        const num = part([FRAC_MID, FRAC_CLOSE]);
        if (tokens[i] === FRAC_MID) i++;
        const den = part([FRAC_CLOSE]);
        if (tokens[i] === FRAC_CLOSE) i++;
        out += `${simple(num) ? num : `(${num})`}/${simple(den) ? den : `(${den})`}`;
      } else out += tokens[i++];
    }
    return out;
  };
  return part([]);
}

// Text like "⁻12.5ᴇ3" back into tokens, for editing numbers on WINDOW and TBLSET.
const textToTokens = (s) => [...s].map((c) => (c === 'ᴇ' ? 'E' : c));

// ---- Keys --------------------------------------------------------------------------------------
// Each key: [id, label, 2nd label, alpha label, style, main action, 2nd action, alpha action]
// An action is a token to insert ("sin(") or a command (":trace").

const KEYS = [
  ['yeq', 'Y=', 'STAT PLOT', 'F1', 'top', ':yeq', ':unsupported:STAT PLOT', ':fmenu'],
  ['window', 'WINDOW', 'TBLSET', 'F2', 'top', ':window', ':tblset', null],
  ['zoom', 'ZOOM', 'FORMAT', 'F3', 'top', ':zoom', ':format', null],
  ['trace', 'TRACE', 'CALC', 'F4', 'top', ':trace', ':calc', null],
  ['graph', 'GRAPH', 'TABLE', 'F5', 'top', ':graph', ':table', null],
  ['second', '2nd', '', '', 'second', ':second', ':second', ':second'],
  ['mode', 'MODE', 'QUIT', '', 'small', ':mode', ':quit', null],
  ['del', 'DEL', 'INS', '', 'small', ':del', ':ins', null],
  null, null, // arrow pad
  ['alpha', 'ALPHA', 'A-LOCK', '', 'alpha', ':alpha', ':alock', ':alpha'],
  ['xt', 'X,T,θ,n', 'LINK', 'n/d', 'small', 'X', ':unsupported:LINK', ':frac'],
  ['stat', 'STAT', 'LIST', '', 'small', ':unsupported:STAT', ':unsupported:LIST', null],
  null, null,
  ['math', 'MATH', 'TEST', 'A', 'small', ':math', ':unsupported:TEST', 'A'],
  ['apps', 'APPS', 'ANGLE', 'B', 'small', ':unsupported:APPS', ':unsupported:ANGLE', 'B'],
  ['prgm', 'PRGM', 'DRAW', 'C', 'small', ':unsupported:PRGM', ':unsupported:DRAW', 'C'],
  ['vars', 'VARS', 'DISTR', '', 'small', ':vars', ':unsupported:DISTR', null],
  ['clear', 'CLEAR', '', '', 'small', ':clear', ':clear', ':clear'],
  ['inv', 'x⁻¹', 'MATRIX', 'D', '', '⁻¹', ':unsupported:MATRIX', 'D'],
  ['sin', 'SIN', 'SIN⁻¹', 'E', '', 'sin(', 'sin⁻¹(', 'E'],
  ['cos', 'COS', 'COS⁻¹', 'F', '', 'cos(', 'cos⁻¹(', 'F'],
  ['tan', 'TAN', 'TAN⁻¹', 'G', '', 'tan(', 'tan⁻¹(', 'G'],
  ['pow', '^', 'π', 'H', '', '^', 'π', 'H'],
  ['sq', 'x²', '√', 'I', '', '²', '√(', 'I'],
  ['comma', ',', 'EE', 'J', '', ',', 'E', 'J'],
  ['lp', '(', '{', 'K', '', '(', ':unsupported:LISTS', 'K'],
  ['rp', ')', '}', 'L', '', ')', ':unsupported:LISTS', 'L'],
  ['div', '÷', 'e', 'M', '', '÷', 'e', 'M'],
  ['log', 'LOG', '10ˣ', 'N', '', 'log(', '10^(', 'N'],
  ['7', '7', 'u', 'O', 'digit', '7', null, 'O'],
  ['8', '8', 'v', 'P', 'digit', '8', null, 'P'],
  ['9', '9', 'w', 'Q', 'digit', '9', null, 'Q'],
  ['mul', '×', '[', 'R', '', '×', ':unsupported:MATRIX', 'R'],
  ['ln', 'LN', 'eˣ', 'S', '', 'ln(', 'e^(', 'S'],
  ['4', '4', 'L4', 'T', 'digit', '4', null, 'T'],
  ['5', '5', 'L5', 'U', 'digit', '5', null, 'U'],
  ['6', '6', 'L6', 'V', 'digit', '6', null, 'V'],
  ['sub', '−', ']', 'W', '', '-', ':unsupported:MATRIX', 'W'],
  ['sto', 'STO→', 'RCL', 'X', 'small', '→', ':unsupported:RCL', 'X'],
  ['1', '1', 'L1', 'Y', 'digit', '1', null, 'Y'],
  ['2', '2', 'L2', 'Z', 'digit', '2', null, 'Z'],
  ['3', '3', 'L3', 'θ', 'digit', '3', null, 'θ'],
  ['add', '+', 'MEM', '"', '', '+', ':unsupported:MEM', null],
  ['on', 'ON', 'OFF', '', 'small', ':on', ':off', ':on'],
  ['0', '0', 'CATALOG', '␣', 'digit', '0', ':unsupported:CATALOG', null],
  ['dot', '.', 'i', ':', 'digit', '.', null, null],
  ['neg', '(−)', 'ANS', '?', '', '⁻', 'Ans', null],
  ['enter', 'ENTER', 'ENTRY', 'SOLVE', 'enter', ':enter', ':entry', null],
];
const KEY_BY_ID = Object.fromEntries(KEYS.filter(Boolean).map((k) => [k[0], k]));

function buildKeys() {
  const wrap = $('keys');
  KEYS.forEach((k, i) => {
    if (!k) {
      if (i === 8) wrap.append(buildDpad());
      return;
    }
    const [id, label, l2, la, style] = k;
    const cell = document.createElement('div');
    cell.className = `key ${style}`;
    cell.innerHTML = '<div class="labels"><span class="l2"></span><span class="la"></span></div><button type="button"></button>';
    cell.querySelector('.l2').textContent = l2;
    cell.querySelector('.la').textContent = la;
    const b = cell.querySelector('button');
    b.textContent = label;
    b.dataset.key = id;
    b.setAttribute('aria-label', label === '(−)' ? 'negative' : label);
    bindPress(b, id);
    wrap.append(cell);
  });
}

function buildDpad() {
  const pad = document.createElement('div');
  pad.className = 'dpad';
  for (const [dir, sym] of [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = dir;
    b.textContent = sym;
    b.dataset.key = dir;
    b.setAttribute('aria-label', dir);
    bindPress(b, dir);
    pad.append(b);
  }
  return pad;
}

// Arrow keys and DEL repeat while held, like the real calculator. Repeating stops on
// release, if the page loses focus, or after a few seconds in case a release is missed.
let repeatTimer;
const stopRepeat = () => clearTimeout(repeatTimer);
addEventListener('blur', stopRepeat);
document.addEventListener('visibilitychange', stopRepeat);

function bindPress(button, id) {
  const repeats = ['up', 'down', 'left', 'right', 'del'].includes(id);
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stopRepeat();
    press(id);
    if (repeats) {
      let count = 0;
      repeatTimer = setTimeout(function again() {
        press(id);
        if (++count < 80) repeatTimer = setTimeout(again, 70);
      }, 420);
    }
  });
  const stop = stopRepeat;
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointerleave', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', stop);
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  // Keyboard users activating the button with Enter/Space.
  button.addEventListener('click', (e) => { if (e.detail === 0) press(id); });
}

function press(id) {
  if (['up', 'down', 'left', 'right'].includes(id)) {
    dispatch(`:${id}`);
    render();
    return;
  }
  // Number keys pick menu items directly.
  if (ui.screen === 'menu' && !ui.shift && menuDigit(id)) {
    render();
    return;
  }
  const k = KEY_BY_ID[id];
  const [, , , , , main, second, alpha] = k;
  let action = main;
  if (ui.shift === '2nd') action = second;
  else if (ui.shift === 'alpha' || ui.shift === 'alock') action = alpha ?? main;
  const keepShift = id === 'second' || id === 'alpha' || (ui.shift === 'alock' && action !== ':alock');
  if (!keepShift && ui.shift !== 'alock') ui.shift = null;
  if (action) dispatch(action);
  ui.blink = true;
  render();
}

// ---- Dispatch -----------------------------------------------------------------------------------

function dispatch(action) {
  if (ui.screen === 'off') {
    if (action === ':on') { ui.screen = 'home'; ui.shift = null; }
    return;
  }
  if (!action.startsWith(':')) { insertToken(action); return; }
  const [cmd, arg] = action.slice(1).split(/:(.*)/);
  switch (cmd) {
    case 'second': ui.shift = ui.shift === '2nd' ? null : '2nd'; return;
    case 'alpha':
      ui.shift = ui.shift === 'alpha' || ui.shift === 'alock' ? null : 'alpha';
      return;
    case 'alock': ui.shift = 'alock'; return;
    case 'unsupported': showFlash(`${arg} isn't in this version`); return;
    case 'off': ui.screen = 'off'; return;
    case 'on': return;
  }
  // Leaving an editor screen commits what's being typed.
  const screenKeys = ['quit', 'mode', 'yeq', 'window', 'zoom', 'trace', 'graph', 'table', 'tblset', 'format', 'calc'];
  if (screenKeys.includes(cmd)) {
    commitFields();
    switch (cmd) {
      case 'quit': goHome(); return;
      case 'mode': openOptions('mode'); return;
      case 'format': openOptions('format'); return;
      case 'yeq': ui.screen = 'yeq'; ui.yeqEd = null; return;
      case 'window': openFields('window'); return;
      case 'tblset': openFields('tblset'); return;
      case 'zoom': openMenu(zoomMenu()); return;
      case 'calc': openMenu(calcMenu(), 'graph'); return;
      case 'graph': showGraph('free'); return;
      case 'trace': showGraph('trace'); return;
      case 'table': ui.screen = 'table'; ui.table = { row: 0, col: 0, top: 0 }; return;
    }
  }
  if (cmd === 'math') { openMenu(mathMenu()); return; }
  if (cmd === 'frac') { insertTemplate(); return; }
  if (cmd === 'fmenu') { openMenu(fracMenu()); return; }
  if (cmd === 'vars') { openMenu(varsMenu()); return; }
  if (cmd === 'ins') { ui.overwrite = !ui.overwrite; return; }
  const handler = SCREENS[ui.screen];
  handler?.(cmd);
}

function goHome() {
  ui.screen = 'home';
  ui.menu = null;
  ui.graph.calc = null;
  ui.graph.prompt = null;
}

let flashTimer;
function showFlash(text) {
  ui.flash = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { ui.flash = null; render(); }, 1600);
}

// ---- Editing ----------------------------------------------------------------------------------------

function currentEditor() {
  if (ui.screen === 'home') return ui.home;
  if (ui.screen === 'yeq') return ui.yeqEd ??= ed(state.yeq[ui.yeqSel].tokens);
  if (ui.screen === 'window' || ui.screen === 'tblset') {
    if (!ui.fieldEd) loadField();
    return ui.fieldEd;
  }
  if (ui.screen === 'graph' && ui.graph.prompt) return ui.graph.prompt.ed;
  return null;
}

function insertToken(tok) {
  // Typing a number while tracing jumps to that X, like on the real calculator.
  if (ui.screen === 'graph' && !ui.graph.prompt && /^[0-9.⁻]$/.test(tok) && (ui.graph.mode === 'trace' || ui.graph.calc)) {
    openXPrompt();
  }
  if (ui.screen === 'menu' || ui.screen === 'error') return;
  const e = currentEditor();
  if (!e) return;
  if (e.fresh) { e.tokens = []; e.cursor = 0; e.fresh = false; }
  if (e.cursor < 0) e.cursor = 0; // typing while on the Y= "=" sign
  if (ui.screen === 'home' && !e.tokens.length && ANS_STARTERS.has(tok)) {
    e.tokens.push('Ans');
    e.cursor = 1;
  }
  if (ui.overwrite && e.cursor < e.tokens.length) e.tokens[e.cursor] = tok;
  else e.tokens.splice(e.cursor, 0, tok);
  e.cursor++;
  afterEdit();
}

// ALPHA + X,T,θ,n: an empty stacked fraction, with the cursor in the numerator.
function insertTemplate() {
  if (ui.screen !== 'home' && ui.screen !== 'yeq') {
    showFlash('Fractions can be typed on the home screen and in Y=');
    return;
  }
  const e = currentEditor();
  if (e.cursor < 0) e.cursor = 0;
  e.tokens.splice(e.cursor, 0, FRAC_OPEN, FRAC_MID, FRAC_CLOSE);
  e.cursor++;
  afterEdit();
}

// The fraction a marker token belongs to: indexes of its FRAC( FRAC| FRAC) markers.
function fracAround(tokens, k) {
  let open = k;
  if (tokens[k] !== FRAC_OPEN) {
    for (let j = k - 1, depth = 0; j >= 0; j--) {
      if (tokens[j] === FRAC_CLOSE) depth++;
      else if (tokens[j] === FRAC_OPEN) { if (depth === 0) { open = j; break; } depth--; }
    }
  }
  let mid = -1, close = tokens.length;
  for (let j = open + 1, depth = 0; j < tokens.length; j++) {
    if (tokens[j] === FRAC_OPEN) depth++;
    else if (tokens[j] === FRAC_CLOSE) { if (depth === 0) { close = j; break; } depth--; }
    else if (tokens[j] === FRAC_MID && depth === 0) mid = j;
  }
  return { open, mid, close };
}

// The innermost fraction the cursor is inside, or null.
function enclosingFrac(tokens, cursor) {
  for (let j = cursor - 1, depth = 0; j >= 0; j--) {
    if (tokens[j] === FRAC_CLOSE) depth++;
    else if (tokens[j] === FRAC_OPEN) { if (depth === 0) return fracAround(tokens, j); depth--; }
  }
  return null;
}

// ▼ moves from the numerator to the denominator and ▲ back, like the CE.
function fracNav(e, dir) {
  const f = e.cursor >= 0 && enclosingFrac(e.tokens, e.cursor);
  if (!f) return false;
  const inNum = e.cursor <= f.mid;
  if (dir === 'down' && inNum) e.cursor = f.mid + 1;
  else if (dir === 'up' && !inNum) e.cursor = f.mid;
  return true;
}

// Deleting a fraction's edge removes the fraction once it's empty; otherwise it's kept
// (and backspace steps into it) so its contents aren't lost.
function deleteAtMarker(e, k, backwards) {
  const f = fracAround(e.tokens, k);
  if (f.close - f.open === 2) {
    e.tokens.splice(f.open, 3);
    e.cursor = f.open;
    afterEdit();
  } else if (backwards) {
    e.cursor--;
  }
}

function afterEdit() {
  if (ui.screen === 'yeq') {
    state.yeq[ui.yeqSel].tokens = [...ui.yeqEd.tokens];
    recompileY();
    save();
  }
  ui.recall = -1;
}

function editKeys(cmd, e) {
  switch (cmd) {
    case 'left':
      if (e.cursor > 0) e.cursor--;
      return true;
    case 'right':
      if (e.cursor < e.tokens.length) e.cursor++;
      return true;
    case 'del': {
      if (e.fresh) { e.fresh = false; }
      const k = e.cursor < e.tokens.length ? e.cursor : e.cursor - 1;
      if (k >= 0 && isFracMark(e.tokens[k])) { deleteAtMarker(e, k, false); return true; }
      if (e.cursor < e.tokens.length) e.tokens.splice(e.cursor, 1);
      else if (e.cursor > 0) e.tokens.splice(--e.cursor, 1);
      afterEdit();
      return true;
    }
    case 'backspace':
      if (e.cursor > 0 && isFracMark(e.tokens[e.cursor - 1])) { deleteAtMarker(e, e.cursor - 1, true); return true; }
      if (e.cursor > 0) { e.tokens.splice(--e.cursor, 1); afterEdit(); }
      return true;
  }
  return false;
}

// ---- Home screen -------------------------------------------------------------------------------------

function ctx() {
  return { vars: state.vars, ans: state.ans, degrees: state.mode.degrees, y: yByName };
}

function homeEnter() {
  let tokens = ui.home.tokens;
  if (!tokens.length) {
    // ENTER on an empty line repeats the last entry.
    if (!state.entries.length) return;
    tokens = state.entries[state.entries.length - 1];
  }
  try {
    const { value, store, convert } = run(tokens, ctx());
    if (store) state.vars[store] = value;
    state.ans = value;
    // Like the CE's AUTO answers: a calculation typed with n/d fractions answers as a fraction.
    let asFrac = convert === '▶Frac' || (tokens.some(isFracMark) && convert !== '▶Dec');
    if (convert === '▶F◀▶D') asFrac = !state.history.at(-1)?.frac;
    let out = fmt(value);
    let frac = null;
    if (asFrac) {
      frac = toFraction(value);
      if (frac) out = `${frac.n < 0 ? '⁻' : ''}${Math.abs(frac.n)}/${frac.d}`;
    }
    state.history.push({ input: [...tokens], output: out, ...(frac ? { frac } : {}) });
    if (state.history.length > 60) state.history.shift();
    state.entries.push([...tokens]);
    if (state.entries.length > 30) state.entries.shift();
    ui.home = ed();
    ui.recall = -1;
    announce(out);
    save();
  } catch (err) {
    if (!(err instanceof CalcError)) throw err;
    showError(err.kind, { back: 'home', canGoto: true, input: tokens });
  }
}

const SCREENS = {};

SCREENS.home = (cmd) => {
  const e = ui.home;
  if (editKeys(cmd, e)) return;
  switch (cmd) {
    case 'enter': homeEnter(); return;
    case 'entry': recallEntry(1); return;
    case 'up': if (!fracNav(e, 'up')) recallEntry(1); return;
    case 'down': if (!fracNav(e, 'down')) recallEntry(-1); return;
    case 'clear':
      if (e.tokens.length) ui.home = ed();
      else state.history = [];
      save();
  }
};

function recallEntry(dir) {
  const n = state.entries.length;
  if (!n) return;
  if (ui.recall === -1 && dir < 0) return;
  ui.recall = Math.max(-1, Math.min(n - 1, ui.recall + dir));
  ui.home = ui.recall === -1 ? ed() : ed(state.entries[n - 1 - ui.recall]);
}

// ---- Errors -------------------------------------------------------------------------------------------

function showError(kind, { back, canGoto = false, input = null }) {
  ui.error = { kind, back, canGoto, input };
  openMenu({
    title: `ERR:${kind}`,
    error: true,
    tabs: [{ name: '', items: [
      { label: 'Quit', run: () => { goHome(); if (back === 'home') ui.home = ed(); } },
      ...(canGoto ? [{ label: 'Goto', run: () => { ui.screen = back; if (input) ui.home = ed(input); } }] : []),
    ] }],
  }, back);
}

// ---- Menus -------------------------------------------------------------------------------------------

function openMenu(menu, back = ui.screen) {
  ui.menu = { tab: 0, sel: 0, top: 0, back: back === 'menu' ? ui.menu?.back ?? 'home' : back, ...menu };
  ui.screen = 'menu';
}

function menuInsert(tok) {
  return () => {
    ui.screen = ui.menu.back;
    if (ui.screen === 'graph' && !ui.graph.prompt) ui.screen = 'home';
    insertToken(tok);
  };
}

function mathMenu() {
  return {
    tabs: [
      { name: 'MATH', items: [
        { label: '▶Frac', run: menuInsert('▶Frac') }, { label: '▶Dec', run: menuInsert('▶Dec') },
        { label: '³', run: menuInsert('³') }, { label: '³√(', run: menuInsert('³√(') },
        { label: 'ˣ√', run: menuInsert('ˣ√') }, { label: 'nDeriv(', run: menuInsert('nDeriv(') },
        { label: 'fnInt(', run: menuInsert('fnInt(') },
      ] },
      { name: 'NUM', items: ['abs(', 'round(', 'iPart(', 'fPart(', 'int(', 'min(', 'max(', 'lcm(', 'gcd(']
        .map((t) => ({ label: t, run: menuInsert(t) })) },
      { name: 'PRB', items: [
        { label: 'rand', run: menuInsert('rand') }, { label: 'nPr', run: menuInsert(' nPr ') },
        { label: 'nCr', run: menuInsert(' nCr ') }, { label: '!', run: menuInsert('!') },
        { label: 'randInt(', run: menuInsert('randInt(') },
      ] },
    ],
  };
}

function fracMenu() {
  return {
    tabs: [{ name: 'FRAC', items: [
      { label: 'n/d', run: () => insertTemplate() },
      { label: '▶F◀▶D', run: menuInsert('▶F◀▶D') },
      { label: '▶Frac', run: menuInsert('▶Frac') },
      { label: '▶Dec', run: menuInsert('▶Dec') },
    ] }],
  };
}

function varsMenu() {
  return { tabs: [{ name: 'Y-VARS', items: Y_TOKENS.map((t) => ({ label: t, run: menuInsert(t) })) }] };
}

function zoomMenu() {
  const set = (w) => () => { Object.assign(state.win, w); graphChanged(); showGraph('free'); };
  return {
    tabs: [{ name: 'ZOOM', items: [
      { label: 'ZBox', run: () => { showGraph('free'); ui.graph.mode = 'zbox'; ui.graph.box = null; } },
      { label: 'Zoom In', run: () => { showGraph('free'); ui.graph.mode = 'zin'; } },
      { label: 'Zoom Out', run: () => { showGraph('free'); ui.graph.mode = 'zout'; } },
      { label: 'ZDecimal', run: set({ xmin: -15.9, xmax: 15.9, xscl: 1, ymin: -10.9, ymax: 10.9, yscl: 1 }) },
      { label: 'ZSquare', run: () => { zSquare(); showGraph('free'); } },
      { label: 'ZStandard', run: set(STANDARD) },
      { label: 'ZTrig', run: set({ xmin: -6.152285613, xmax: 6.152285613, xscl: Math.PI / 2, ymin: -4, ymax: 4, yscl: 1 }) },
      { label: 'ZInteger', run: () => { zInteger(); showGraph('free'); } },
      { label: 'ZoomFit', run: () => { zoomFit(); showGraph('free'); } },
    ] }],
  };
}

function calcMenu() {
  const start = (type) => () => startCalc(type);
  return {
    tabs: [{ name: 'CALCULATE', items: [
      { label: 'value', run: start('value') }, { label: 'zero', run: start('zero') },
      { label: 'minimum', run: start('minimum') }, { label: 'maximum', run: start('maximum') },
      { label: 'intersect', run: start('intersect') }, { label: 'dy/dx', run: start('dydx') },
      { label: '∫f(x)dx', run: start('integral') },
    ] }],
  };
}

SCREENS.menu = (cmd) => {
  const m = ui.menu;
  const items = m.tabs[m.tab].items;
  switch (cmd) {
    case 'up': m.sel = (m.sel - 1 + items.length) % items.length; break;
    case 'down': m.sel = (m.sel + 1) % items.length; break;
    case 'left': if (m.tabs.length > 1) { m.tab = (m.tab - 1 + m.tabs.length) % m.tabs.length; m.sel = 0; } break;
    case 'right': if (m.tabs.length > 1) { m.tab = (m.tab + 1) % m.tabs.length; m.sel = 0; } break;
    case 'enter': pickMenu(m.sel); return;
    case 'clear': ui.screen = m.back === 'graph' ? 'graph' : m.back; if (m.error) goHome(); return;
  }
  if (m.sel < m.top) m.top = m.sel;
  if (m.sel > m.top + ROWS - 2) m.top = m.sel - (ROWS - 2);
};

function pickMenu(i) {
  const item = ui.menu.tabs[ui.menu.tab].items[i];
  if (!item) return;
  const back = ui.menu.back;
  ui.screen = back;
  item.run();
  if (ui.screen === 'menu' && ui.menu.error) return;
  if (ui.screen !== 'menu') ui.menu = null;
}

// Number keys pick menu items directly (1–9, 0 for the tenth).
function menuDigit(tok) {
  if (!/^[0-9]$/.test(tok)) return false;
  pickMenu(tok === '0' ? 9 : Number(tok) - 1);
  return true;
}

// ---- Y= editor ---------------------------------------------------------------------------------------

SCREENS.yeq = (cmd) => {
  const e = currentEditor();
  const row = state.yeq[ui.yeqSel];
  // Cursor position -1 sits on the "=" sign; ENTER there turns the graph on or off.
  if (e.cursor === -1) {
    if (cmd === 'enter') { row.on = !row.on; recompileY(); save(); return; }
    if (cmd === 'right') { e.cursor = 0; return; }
  } else if (cmd === 'left' && e.cursor === 0) { e.cursor = -1; return; }
  if (e.cursor >= 0 && editKeys(cmd, e)) return;
  if ((cmd === 'up' || cmd === 'down') && fracNav(e, cmd)) return;
  switch (cmd) {
    case 'up': moveY(-1); break;
    case 'down': case 'enter': moveY(1); break;
    case 'clear': row.tokens = []; ui.yeqEd = ed(); recompileY(); save(); break;
  }
};

function moveY(d) {
  ui.yeqSel = (ui.yeqSel + d + state.yeq.length) % state.yeq.length;
  ui.yeqEd = null;
}

// ---- WINDOW and TBLSET ------------------------------------------------------------------------------

const WINDOW_FIELDS = [['Xmin', 'xmin'], ['Xmax', 'xmax'], ['Xscl', 'xscl'], ['Ymin', 'ymin'], ['Ymax', 'ymax'], ['Yscl', 'yscl']];
const TBL_FIELDS = [['TblStart', 'start'], ['ΔTbl', 'step']];

const fieldsFor = (screen) => (screen === 'window' ? [WINDOW_FIELDS, state.win] : [TBL_FIELDS, state.tbl]);

function openFields(screen) {
  ui.screen = screen;
  ui.field = 0;
  loadField();
}

function loadField() {
  const [fields, obj] = fieldsFor(ui.screen);
  ui.fieldEd = ed(textToTokens(fmt(obj[fields[ui.field][1]])), true);
}

// Saves the field being edited; invalid input keeps the old value.
function commitFields() {
  if ((ui.screen !== 'window' && ui.screen !== 'tblset') || !ui.fieldEd) return;
  const [fields, obj] = fieldsFor(ui.screen);
  const key = fields[ui.field][1];
  try {
    const { value } = run(ui.fieldEd.tokens, ctx());
    const next = { ...obj, [key]: value };
    const ok = ui.screen === 'window'
      ? next.xmin < next.xmax && next.ymin < next.ymax && next.xscl >= 0 && next.yscl >= 0
      : next.step !== 0;
    if (ok) { obj[key] = value; graphChanged(); save(); }
    else showFlash(ui.screen === 'window' ? 'ERR:WINDOW RANGE' : 'ΔTbl can’t be 0');
  } catch {
    showFlash('Invalid number');
  }
  ui.fieldEd = null;
}

SCREENS.window = SCREENS.tblset = (cmd) => {
  const [fields] = fieldsFor(ui.screen);
  if (editKeys(cmd, currentEditor())) return;
  const move = (d) => { commitFields(); ui.field = (ui.field + d + fields.length) % fields.length; loadField(); };
  switch (cmd) {
    case 'up': move(-1); break;
    case 'down': case 'enter': move(1); break;
    case 'clear': ui.fieldEd = ed(); break;
  }
};

// ---- MODE and FORMAT ---------------------------------------------------------------------------------

const OPTION_SCREENS = {
  mode: [
    { opts: ['NORMAL', 'SCI'], get: () => (state.mode.sci ? 1 : 0), set: (i) => { state.mode.sci = i === 1; } },
    { opts: ['FLOAT', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], get: () => (state.mode.fix == null ? 0 : state.mode.fix + 1), set: (i) => { state.mode.fix = i === 0 ? null : i - 1; } },
    { opts: ['RADIAN', 'DEGREE'], get: () => (state.mode.degrees ? 1 : 0), set: (i) => { state.mode.degrees = i === 1; recompileY(); } },
    { opts: ['FUNCTION'], get: () => 0, set: () => {} },
  ],
  format: [
    { opts: ['CoordOn', 'CoordOff'], get: () => (state.fmt.coords ? 0 : 1), set: (i) => { state.fmt.coords = i === 0; } },
    { opts: ['GridOff', 'GridOn'], get: () => (state.fmt.grid ? 1 : 0), set: (i) => { state.fmt.grid = i === 1; } },
    { opts: ['AxesOn', 'AxesOff'], get: () => (state.fmt.axes ? 0 : 1), set: (i) => { state.fmt.axes = i === 0; } },
  ],
};

function openOptions(screen) {
  ui.screen = screen;
  ui.opt = { row: 0, col: OPTION_SCREENS[screen][0].get() };
}

SCREENS.mode = SCREENS.format = (cmd) => {
  const rows = OPTION_SCREENS[ui.screen];
  const o = ui.opt;
  switch (cmd) {
    case 'up': o.row = (o.row - 1 + rows.length) % rows.length; o.col = rows[o.row].get(); break;
    case 'down': o.row = (o.row + 1) % rows.length; o.col = rows[o.row].get(); break;
    case 'left': o.col = Math.max(0, o.col - 1); break;
    case 'right': o.col = Math.min(rows[o.row].opts.length - 1, o.col + 1); break;
    case 'enter': rows[o.row].set(o.col); graphChanged(); save(); break;
    case 'clear': goHome(); break;
  }
};

// ---- Graph -----------------------------------------------------------------------------------------------

let graphCache = null;
function graphChanged() { graphCache = null; }

const px = (x) => ((x - state.win.xmin) / (state.win.xmax - state.win.xmin)) * (GW - 1);
const py = (y) => GY0 + ((state.win.ymax - y) / (state.win.ymax - state.win.ymin)) * (GH - 1);
const xAt = (i) => state.win.xmin + (i * (state.win.xmax - state.win.xmin)) / (GW - 1);
const yAt = (j) => state.win.ymax - ((j - GY0) * (state.win.ymax - state.win.ymin)) / (GH - 1);
const dX = () => (state.win.xmax - state.win.xmin) / (GW - 1);

function showGraph(mode) {
  ui.screen = 'graph';
  const g = ui.graph;
  g.calc = null;
  g.prompt = null;
  g.info = null;
  g.mode = mode;
  if (mode === 'trace') {
    const fns = activeFns();
    if (!fns.length) { g.mode = 'free'; return; }
    if (!fns.includes(g.f)) g.f = fns[0];
    g.x = xAt(GW >> 1);
  } else {
    g.cx = GW >> 1;
    g.cy = GY0 + (GH >> 1);
  }
}

function cycleFn(d) {
  const fns = activeFns();
  if (!fns.length) return;
  const i = fns.indexOf(ui.graph.f);
  ui.graph.f = fns[(i + d + fns.length) % fns.length];
}

// Moving the trace cursor past the edge scrolls the window, like the real calculator.
function traceStep(d) {
  const g = ui.graph;
  const i = Math.round(px(g.x)) + d;
  if (i < 0 || i > GW - 1) {
    const shift = (state.win.xmax - state.win.xmin) / 4 * Math.sign(d);
    state.win.xmin += shift;
    state.win.xmax += shift;
    graphChanged();
    save();
  }
  g.x = xAt(Math.round(px(g.x)) + d);
}

function openXPrompt() {
  const g = ui.graph;
  g.prompt = {
    label: 'X=',
    ed: ed(),
    done: (x) => {
      if (x < state.win.xmin || x > state.win.xmax) { showFlash('ERR:INVALID (outside window)'); return; }
      g.x = x;
      if (g.calc?.type === 'value') finishCalc();
      else if (g.calc) calcEnter();
    },
  };
}

SCREENS.graph = (cmd) => {
  const g = ui.graph;
  if (g.prompt) {
    if (editKeys(cmd, g.prompt.ed)) return;
    if (cmd === 'enter') {
      try {
        const { value } = run(g.prompt.ed.tokens, ctx());
        const p = g.prompt;
        g.prompt = null;
        p.done(value);
      } catch (err) {
        if (!(err instanceof CalcError)) throw err;
        showFlash(`ERR:${err.kind}`);
      }
    } else if (cmd === 'clear') {
      g.prompt = null;
      if (g.calc?.type === 'value') g.calc = null;
    }
    return;
  }
  if (g.calc) { calcKeys(cmd); return; }
  if (g.mode === 'trace') {
    switch (cmd) {
      case 'left': traceStep(-1); return;
      case 'right': traceStep(1); return;
      case 'up': cycleFn(-1); return;
      case 'down': cycleFn(1); return;
      case 'enter': centreOn(g.x, yFn(g.f).fn(g.x)); return;
      case 'clear': goHome(); return;
    }
    return;
  }
  // Free-moving cursor (also used by ZBox and Zoom In/Out).
  switch (cmd) {
    case 'left': g.cx = Math.max(0, g.cx - 1); return;
    case 'right': g.cx = Math.min(GW - 1, g.cx + 1); return;
    case 'up': g.cy = Math.max(GY0, g.cy - 1); return;
    case 'down': g.cy = Math.min(H - 1, g.cy + 1); return;
    case 'clear':
      if (g.mode === 'zbox' && g.box) { g.box = null; return; }
      goHome();
      return;
    case 'enter': {
      const x = xAt(g.cx), y = yAt(g.cy);
      if (g.mode === 'zin' || g.mode === 'zout') { zoomAbout(x, y, g.mode === 'zin' ? 1 / 4 : 4); return; }
      if (g.mode === 'zbox') {
        if (!g.box) { g.box = { x, y, cx: g.cx, cy: g.cy }; return; }
        if (g.box.cx === g.cx || g.box.cy === g.cy) return;
        Object.assign(state.win, {
          xmin: Math.min(g.box.x, x), xmax: Math.max(g.box.x, x),
          ymin: Math.min(g.box.y, y), ymax: Math.max(g.box.y, y),
        });
        g.box = null;
        g.mode = 'free';
        graphChanged();
        save();
      }
    }
  }
};

function centreOn(x, y) {
  if (!Number.isFinite(y)) return;
  const hw = (state.win.xmax - state.win.xmin) / 2, hh = (state.win.ymax - state.win.ymin) / 2;
  Object.assign(state.win, { xmin: x - hw, xmax: x + hw, ymin: y - hh, ymax: y + hh });
  graphChanged();
  save();
}

function zoomAbout(x, y, f) {
  const hw = ((state.win.xmax - state.win.xmin) / 2) * f, hh = ((state.win.ymax - state.win.ymin) / 2) * f;
  Object.assign(state.win, { xmin: x - hw, xmax: x + hw, ymin: y - hh, ymax: y + hh });
  ui.graph.cx = GW >> 1;
  ui.graph.cy = GY0 + (GH >> 1);
  graphChanged();
  save();
}

function zSquare() {
  // Make one unit the same length on both axes, keeping the y-range.
  const perPx = (state.win.ymax - state.win.ymin) / (GH - 1);
  const mid = (state.win.xmin + state.win.xmax) / 2;
  const half = (perPx * (GW - 1)) / 2;
  state.win.xmin = mid - half;
  state.win.xmax = mid + half;
  graphChanged();
  save();
}

function zInteger() {
  const midX = Math.round((state.win.xmin + state.win.xmax) / 2), midY = Math.round((state.win.ymin + state.win.ymax) / 2);
  Object.assign(state.win, { xmin: midX - (GW - 1) / 2, xmax: midX + (GW - 1) / 2, xscl: 10, ymin: midY - (GH - 1) / 2, ymax: midY + (GH - 1) / 2, yscl: 10 });
  graphChanged();
  save();
}

function zoomFit() {
  let lo = Infinity, hi = -Infinity;
  for (const i of activeFns()) {
    const f = yFn(i).fn;
    for (let p = 0; p < GW; p++) {
      const y = f(xAt(p));
      if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
  }
  if (!Number.isFinite(lo)) return;
  if (lo === hi) { lo -= 1; hi += 1; }
  state.win.ymin = lo;
  state.win.ymax = hi;
  graphChanged();
  save();
}

// ---- CALC (2nd TRACE) --------------------------------------------------------------------------------

const CALC_STEPS = {
  zero: ['Left Bound?', 'Right Bound?', 'Guess?'],
  minimum: ['Left Bound?', 'Right Bound?', 'Guess?'],
  maximum: ['Left Bound?', 'Right Bound?', 'Guess?'],
  intersect: ['First curve?', 'Second curve?', 'Guess?'],
  integral: ['Lower Limit?', 'Upper Limit?'],
  dydx: [''],
  value: [],
};

function startCalc(type) {
  showGraph('trace');
  const g = ui.graph;
  if (g.mode !== 'trace') { showFlash('No graphs selected in Y='); return; }
  g.calc = { type, step: 0, marks: [] };
  if (type === 'value') openXPrompt();
}

function calcKeys(cmd) {
  const g = ui.graph;
  const c = g.calc;
  if (c.result) {
    // After a result, arrow keys go back to tracing.
    if (['left', 'right', 'up', 'down'].includes(cmd)) { g.calc = null; g.info = null; SCREENS.graph(cmd); }
    else if (cmd === 'clear') { g.calc = null; g.info = null; }
    return;
  }
  switch (cmd) {
    case 'left': traceStep(-1); return;
    case 'right': traceStep(1); return;
    case 'up': if (!(c.type === 'intersect' && c.step === 2)) cycleFn(-1); return;
    case 'down': if (!(c.type === 'intersect' && c.step === 2)) cycleFn(1); return;
    case 'clear': g.calc = null; return;
    case 'enter': calcEnter(); return;
  }
}

function calcEnter() {
  const g = ui.graph;
  const c = g.calc;
  if (c.type === 'value') return;
  if (c.type === 'intersect' && c.step < 2) {
    c.marks.push(g.f);
    c.step++;
    if (c.step === 1) cycleFn(1);
    if (c.step === 2 && c.marks[0] === c.marks[1]) { showFlash('Pick two different curves'); c.step = 1; c.marks.pop(); }
    return;
  }
  c.marks.push(g.x);
  c.step++;
  if (c.step >= CALC_STEPS[c.type].length) finishCalc();
}

function finishCalc() {
  const g = ui.graph;
  const c = g.calc;
  const f = yFn(g.f).fn;
  const label = (name, x, y) => {
    g.x = x;
    c.result = true;
    g.info = { name, x, y };
  };
  switch (c.type) {
    case 'value': {
      c.result = true;
      g.info = { name: '', x: g.x, y: f(g.x) };
      return;
    }
    case 'dydx': {
      c.result = true;
      g.info = { name: 'dy/dx', value: derivative(f, g.x) };
      return;
    }
    case 'zero': case 'minimum': case 'maximum': {
      const [a, b] = c.marks;
      const r = c.type === 'zero' ? findZero(f, a, b) : findExtremum(f, a, b, c.type === 'maximum');
      if (r == null) { g.calc = null; showFlash(c.type === 'zero' ? 'ERR:NO SIGN CHANGE' : 'ERR:BOUND'); return; }
      const x = c.type === 'zero' ? r : r.x;
      label(c.type === 'zero' ? 'Zero' : c.type === 'minimum' ? 'Minimum' : 'Maximum', x, c.type === 'zero' ? 0 : f(x));
      return;
    }
    case 'intersect': {
      const [i1, i2] = c.marks;
      const f1 = yFn(i1).fn, f2 = yFn(i2).fn;
      const d = (x) => f1(x) - f2(x);
      const guess = c.marks[2];
      // Widen the search around the guess until the curves cross.
      let x = null;
      for (let w = dX() * 4; w <= (state.win.xmax - state.win.xmin) * 2 && x == null; w *= 2) {
        x = findZero(d, guess - w, guess) ?? findZero(d, guess, guess + w);
      }
      if (x == null) { g.calc = null; showFlash('ERR:NO SIGN CHANGE'); return; }
      g.f = i1;
      label('Intersection', x, f1(x));
      return;
    }
    case 'integral': {
      const [a, b] = c.marks;
      c.shade = { a, b, f: g.f };
      c.result = true;
      g.info = { name: '∫f(x)dx', value: integrate(f, a, b) };
    }
  }
}

// ---- TABLE ------------------------------------------------------------------------------------------

const TABLE_ROWS = 7;

SCREENS.table = (cmd) => {
  const t = ui.table;
  const cols = 1 + activeFns().length;
  switch (cmd) {
    case 'up': if (t.row > 0) t.row--; else t.top--; break;
    case 'down': if (t.row < TABLE_ROWS - 1) t.row++; else t.top++; break;
    case 'left': t.col = Math.max(0, t.col - 1); break;
    case 'right': t.col = Math.min(cols - 1, t.col + 1); break;
    case 'clear': goHome(); break;
  }
};

// Fits a number into a narrow table column.
function short(v, width) {
  if (!Number.isFinite(v)) return 'ERROR';
  for (let d = 7; d >= 1; d--) {
    const s = formatNumber(v, { digits: d });
    if (s.length <= width) return s;
  }
  return formatNumber(v, { digits: 2, sci: true });
}

// ---- Rendering ----------------------------------------------------------------------------------------

const canvas = $('lcd');
const g2 = canvas.getContext('2d');
let scale = 1;

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  scale = (r.width * dpr) / W;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  graphCache = null;
  render();
}

function setFont(size, weight = '') {
  g2.font = `${weight} ${size}px ${FONT}`;
}

let CW = 12;
function measure() {
  setFont(20);
  CW = Math.min(12, g2.measureText('M').width);
}

// Draws one text row. segs: [{ text, inv, color }]. Each character occupies one cell.
function drawRow(row, segs, { right = false, y } = {}) {
  const total = segs.reduce((n, s) => n + [...s.text].length, 0);
  let col = right ? Math.max(0, COLS - total) : 0;
  const top = y ?? TOP + row * ROW_H;
  setFont(20);
  g2.textBaseline = 'middle';
  for (const s of segs) {
    for (const ch of s.text) {
      if (col >= COLS) return;
      const x = 4 + col * CW;
      if (s.inv) {
        g2.fillStyle = s.invColor || '#111';
        g2.fillRect(x, top, CW, ROW_H - 1);
      }
      g2.fillStyle = s.inv ? '#fff' : (s.color || '#111');
      g2.fillText(ch, x + 0.5, top + ROW_H / 2 + 1);
      col++;
    }
  }
}

function statusBar() {
  g2.fillStyle = '#3a4150';
  g2.fillRect(0, 0, W, BAR);
  setFont(11, '600');
  g2.textBaseline = 'middle';
  g2.fillStyle = '#e8ecf2';
  const m = state.mode;
  g2.fillText(`${m.sci ? 'SCI' : 'NORMAL'} ${m.fix == null ? 'FLOAT' : `FIX${m.fix}`} REAL ${m.degrees ? 'DEGREE' : 'RADIAN'}`, 5, BAR / 2 + 1);
  if (ui.shift) {
    const label = { '2nd': '2ND', alpha: 'ALPHA', alock: 'A-LOCK' }[ui.shift];
    const w = g2.measureText(label).width + 10;
    g2.fillStyle = ui.shift === '2nd' ? '#3d8fd0' : '#45a956';
    g2.fillRect(W - w - 3, 2, w, BAR - 4);
    g2.fillStyle = '#fff';
    g2.fillText(label, W - w + 2, BAR / 2 + 1);
  }
  if (ui.overwrite) {
    g2.fillStyle = '#e8ecf2';
    g2.fillText('OVR', W - 90, BAR / 2 + 1);
  }
}

// Wraps text into lines of COLS characters, returning [{ text, start }].
function wrap(text) {
  const chars = [...text];
  const lines = [];
  for (let i = 0; i < Math.max(1, chars.length); i += COLS) lines.push({ text: chars.slice(i, i + COLS).join(''), start: i });
  return lines;
}

function cursorChar() {
  if (ui.shift === '2nd') return '↑';
  if (ui.shift === 'alpha' || ui.shift === 'alock') return 'A';
  return null;
}

// Line segments for an editor, with the blinking cursor drawn over its token.
function editorLines(e, prefix = '', prefixSegs = []) {
  const before = prefix + tokensText(e.tokens.slice(0, Math.max(0, e.cursor)));
  const full = prefix + tokensText(e.tokens);
  const cursorAt = e.cursor < 0 ? -1 : [...before].length;
  const lines = wrap(full + ' ');
  return lines.map(({ text, start }) => {
    const segs = [];
    const chars = [...text];
    chars.forEach((ch, i) => {
      const idx = start + i;
      const pre = prefixSegs.find((p) => idx >= p.from && idx < p.to);
      const isCursor = idx === cursorAt && ui.blink;
      const shown = isCursor && cursorChar() ? cursorChar() : ch;
      segs.push({ text: shown, inv: isCursor || pre?.inv, color: pre?.color, invColor: isCursor ? '#111' : pre?.invColor });
    });
    return segs;
  });
}

// ---- Stacked fractions ---------------------------------------------------------------------------------
// Tokens containing n/d templates are laid out in two dimensions: each part is a box with
// a width and the space it needs above (up) and below (down) the middle of the text line.

function layoutTokens(tokens) {
  let i = 0;
  function seq(stops) {
    const start = i;
    const items = [];
    let w = 0, up = ROW_H / 2, down = ROW_H / 2;
    while (i < tokens.length && !stops.includes(tokens[i])) {
      const t = tokens[i];
      if (t === FRAC_OPEN) {
        const open = i++;
        const num = seq([FRAC_MID, FRAC_CLOSE]);
        if (tokens[i] === FRAC_MID) i++;
        const den = seq([FRAC_CLOSE]);
        if (tokens[i] === FRAC_CLOSE) i++;
        const fw = Math.max(num.w, den.w) + 8;
        items.push({ kind: 'frac', idx: open, x: w, w: fw, num, den });
        w += fw;
        up = Math.max(up, num.up + num.down + 1);
        down = Math.max(down, den.up + den.down + 1);
      } else {
        const n = [...t].length;
        items.push({ kind: 'text', idx: i, x: w, w: n * CW, text: t });
        w += n * CW;
        i++;
      }
    }
    const empty = !items.length;
    return { items, w: empty ? CW : w, up, down, end: i, empty };
  }
  return seq([]);
}

// Draws (or, with paint=false, only measures) a box with its text middle line at y,
// recording the screen position of every cursor index in `pos`.
function drawBox(box, x, y, pos, cursor, paint = true) {
  for (const it of box.items) {
    pos[it.idx] ??= { x: x + it.x, y };
    if (it.kind === 'text') {
      if (!paint) continue;
      const chars = [...it.text];
      chars.forEach((ch, k) => {
        const cx = x + it.x + k * CW;
        const isCursor = k === 0 && cursor === it.idx && ui.blink;
        if (isCursor) {
          g2.fillStyle = '#111';
          g2.fillRect(cx, y - ROW_H / 2, CW, ROW_H - 1);
          pos.cursorDrawn = true;
        }
        g2.fillStyle = isCursor ? '#fff' : '#111';
        g2.fillText(isCursor && cursorChar() ? cursorChar() : ch, cx + 0.5, y + 1);
      });
    } else {
      const fx = x + it.x;
      const numX = fx + (it.w - it.num.w) / 2, denX = fx + (it.w - it.den.w) / 2;
      drawBox(it.num, numX, y - 1 - it.num.down, pos, cursor, paint);
      drawBox(it.den, denX, y + 1 + it.den.up, pos, cursor, paint);
      if (paint) {
        g2.fillStyle = '#111';
        g2.fillRect(fx + 2, Math.round(y) - 0.5, it.w - 4, 1.5);
      }
    }
  }
  pos[box.end] ??= { x: x + (box.empty ? 0 : box.w), y };
  if (box.empty && paint) {
    // An empty slot in a template shows as a dotted box.
    g2.strokeStyle = '#8a8f98';
    g2.setLineDash([2, 2]);
    g2.strokeRect(x + 1.5, y - 8.5, CW - 3, 17);
    g2.setLineDash([]);
  }
}

// Paints a laid-out line whose top edge is at `top`. Long lines scroll to keep the cursor visible.
function paintBox(box, { top, right = false, cursor = null, left = 4 }) {
  const y = top + box.up;
  let x = right ? W - 4 - box.w : left;
  if (cursor != null) {
    const probe = {};
    drawBox(box, 0, y, probe, cursor, false);
    const cx = left + (probe[cursor]?.x ?? box.w);
    if (cx + CW > W - 4) x = left - (cx + CW - (W - 4));
  }
  setFont(20);
  g2.textBaseline = 'middle';
  const pos = {};
  drawBox(box, x, y, pos, cursor);
  // Cursor on a fraction edge or at the end of a part: a block on its own.
  if (cursor != null && ui.blink && !pos.cursorDrawn && pos[cursor]) {
    const p = pos[cursor];
    g2.fillStyle = '#111';
    g2.fillRect(p.x, p.y - ROW_H / 2, CW, ROW_H - 1);
    if (cursorChar()) {
      g2.fillStyle = '#fff';
      g2.fillText(cursorChar(), p.x + 0.5, p.y + 1);
    }
  }
}

const fracTokens = ({ n, d }) => [...(n < 0 ? ['⁻'] : []), FRAC_OPEN, ...String(Math.abs(n)), FRAC_MID, ...String(d), FRAC_CLOSE];

function renderHome() {
  // Each block is one line (or a taller line holding fractions) with its height.
  const blocks = [];
  const textLine = (segs, right = false) => ({ h: ROW_H, draw: (top) => drawRow(0, segs, { right, y: top }) });
  const boxLine = (tokens, opts = {}) => {
    const box = layoutTokens(tokens);
    return { h: box.up + box.down, draw: (top) => paintBox(box, { top, ...opts }) };
  };
  for (const h of state.history) {
    if (h.input.some(isFracMark)) blocks.push(boxLine(h.input));
    else for (const l of wrap(tokensText(h.input))) blocks.push(textLine([{ text: l.text }]));
    blocks.push(h.frac ? boxLine(fracTokens(h.frac), { right: true }) : textLine([{ text: h.output }], true));
  }
  if (ui.home.tokens.some(isFracMark)) blocks.push(boxLine(ui.home.tokens, { cursor: ui.home.cursor }));
  else for (const segs of editorLines(ui.home)) blocks.push(textLine(segs));
  // Show the newest lines that fit.
  let used = 0, first = blocks.length;
  while (first > 0 && used + blocks[first - 1].h <= H - TOP) used += blocks[--first].h;
  let top = TOP;
  for (const b of blocks.slice(first)) { b.draw(top); top += b.h; }
}

function renderMenu() {
  const m = ui.menu;
  if (m.error) {
    drawRow(0, [{ text: m.title, inv: true }]);
  } else {
    const segs = [];
    m.tabs.forEach((t, i) => {
      if (i) segs.push({ text: ' ' });
      segs.push({ text: t.name, inv: i === m.tab });
    });
    drawRow(0, segs);
  }
  const items = m.tabs[m.tab].items;
  items.slice(m.top, m.top + ROWS - 1).forEach((item, k) => {
    const i = m.top + k;
    const num = i === 9 ? '0' : String(i + 1);
    const more = k === ROWS - 2 && i < items.length - 1;
    drawRow(k + 1, [{ text: `${num}${more ? '↓' : ':'}`, inv: i === m.sel }, { text: item.label }]);
  });
}

function renderYeq() {
  drawRow(0, [{ text: ' Plot1 Plot2 Plot3', color: '#777' }]);
  const blocks = state.yeq.map((y, i) => yeqBlock(y, i));
  // Scroll so the selected equation is visible.
  const avail = H - TOP - ROW_H;
  const span = (a, b) => blocks.slice(a, b + 1).reduce((n, bl) => n + bl.h, 0);
  let first = 0;
  while (first < ui.yeqSel && span(first, ui.yeqSel) > avail) first++;
  let top = TOP + ROW_H;
  for (let i = first; i < blocks.length && top < H; i++) { blocks[i].draw(top); top += blocks[i].h; }
}

function yeqBlock(y, i) {
  const prefix = `■Y${i === 9 ? 0 : i + 1}=`;
  const eqIdx = prefix.length - 1;
  const selected = i === ui.yeqSel;
  const e = selected ? currentEditor() : { tokens: y.tokens, cursor: null };
  const onEq = selected && e.cursor === -1 && ui.blink;
  const prefixSegs = [...prefix].map((ch, k) => ({
    text: ch,
    color: k === 0 ? Y_COLORS[i] : undefined,
    inv: k === eqIdx && (y.on || onEq),
    invColor: onEq && y.on ? '#3d8fd0' : '#111',
  }));

  if (e.tokens.some(isFracMark)) {
    const box = layoutTokens(e.tokens);
    const h = Math.max(ROW_H, box.up + box.down);
    return {
      h,
      draw: (top) => {
        drawRow(0, prefixSegs, { y: top + box.up - ROW_H / 2 });
        paintBox(box, { top, left: 4 + prefix.length * CW, cursor: selected && e.cursor >= 0 ? e.cursor : null });
      },
    };
  }
  if (selected) {
    const ranges = [
      { from: 0, to: 1, color: Y_COLORS[i] },
      { from: eqIdx, to: eqIdx + 1, inv: y.on, invColor: '#111' },
    ];
    const lines = editorLines(e.cursor === -1 ? { ...e, cursor: 0 } : e, prefix, ranges);
    if (e.cursor === -1) {
      lines[0][eqIdx] = prefixSegs[eqIdx];
      if (lines[0][prefix.length]) lines[0][prefix.length].inv = false;
    }
    return { h: lines.length * ROW_H, draw: (top) => lines.forEach((segs, k) => drawRow(0, segs, { y: top + k * ROW_H })) };
  }
  const rest = [...tokensText(y.tokens)].slice(0, COLS - prefix.length).join('');
  return { h: ROW_H, draw: (top) => drawRow(0, [...prefixSegs, { text: rest }], { y: top }) };
}

function renderFields(title) {
  const [fields, obj] = fieldsFor(ui.screen);
  drawRow(0, [{ text: title, color: '#1f5fd8' }]);
  fields.forEach(([label, key], i) => {
    if (i === ui.field && ui.fieldEd) {
      const lines = editorLines(ui.fieldEd, `${label}=`);
      drawRow(i + 1, lines[0]);
    } else {
      drawRow(i + 1, [{ text: `${label}=${fmt(obj[key])}` }]);
    }
  });
}

function renderOptions() {
  const rows = OPTION_SCREENS[ui.screen];
  rows.forEach((r, i) => {
    const segs = [];
    r.opts.forEach((o, k) => {
      if (k) segs.push({ text: ' ' });
      const selected = r.get() === k;
      const cursor = ui.opt.row === i && ui.opt.col === k;
      segs.push({ text: o, inv: selected || (cursor && ui.blink), invColor: cursor && !selected ? '#3d8fd0' : '#111' });
    });
    drawRow(i, segs);
  });
}

function drawGraphBase() {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const k = c.getContext('2d');
  k.setTransform(scale, 0, 0, scale, 0, 0);
  k.fillStyle = '#fff';
  k.fillRect(0, GY0, GW, GH);
  const { xmin, xmax, ymin, ymax, xscl, yscl } = state.win;
  const x0 = px(0), y0 = py(0);

  if (state.fmt.grid && xscl > 0 && yscl > 0 && (xmax - xmin) / xscl < 80 && (ymax - ymin) / yscl < 80) {
    k.fillStyle = '#9aa3ad';
    for (let x = Math.ceil(xmin / xscl) * xscl; x <= xmax; x += xscl) {
      for (let y = Math.ceil(ymin / yscl) * yscl; y <= ymax; y += yscl) k.fillRect(Math.round(px(x)) - 0.5, Math.round(py(y)) - 0.5, 1.5, 1.5);
    }
  }
  if (state.fmt.axes) {
    k.strokeStyle = '#111';
    k.lineWidth = 1;
    k.beginPath();
    if (y0 >= GY0 && y0 <= H) { k.moveTo(0, Math.round(y0) + 0.5); k.lineTo(GW, Math.round(y0) + 0.5); }
    if (x0 >= 0 && x0 <= GW) { k.moveTo(Math.round(x0) + 0.5, GY0); k.lineTo(Math.round(x0) + 0.5, H); }
    if (xscl > 0 && (xmax - xmin) / xscl < 200 && y0 >= GY0 && y0 <= H) {
      for (let x = Math.ceil(xmin / xscl) * xscl; x <= xmax; x += xscl) { const p = Math.round(px(x)) + 0.5; k.moveTo(p, y0 - 3); k.lineTo(p, y0 + 3); }
    }
    if (yscl > 0 && (ymax - ymin) / yscl < 200 && x0 >= 0 && x0 <= GW) {
      for (let y = Math.ceil(ymin / yscl) * yscl; y <= ymax; y += yscl) { const p = Math.round(py(y)) + 0.5; k.moveTo(x0 - 3, p); k.lineTo(x0 + 3, p); }
    }
    k.stroke();
  }

  k.save();
  k.beginPath();
  k.rect(0, GY0, GW, GH);
  k.clip();
  k.lineWidth = 2;
  k.lineJoin = 'round';
  for (const i of activeFns()) {
    const f = yFn(i).fn;
    k.strokeStyle = Y_COLORS[i];
    k.beginPath();
    let down = false, prevY = NaN, prevX = NaN;
    for (let p = 0; p < GW; p += 0.5) {
      const x = xAt(p), y = f(x);
      if (!Number.isFinite(y)) { down = false; continue; }
      const sy = Math.max(-1e4, Math.min(1e4, py(y)));
      if (down && Math.abs(sy - py(prevY)) > GH) {
        const mid = f((x + prevX) / 2);
        if (!(Number.isFinite(mid) && mid >= Math.min(prevY, y) && mid <= Math.max(prevY, y))) down = false;
      }
      if (down) k.lineTo(p, sy); else k.moveTo(p, sy);
      down = true;
      prevY = y; prevX = x;
    }
    k.stroke();
  }
  k.restore();
  return c;
}

function drawCursorCross(x, y, color = '#111') {
  g2.strokeStyle = color;
  g2.lineWidth = 1.5;
  g2.beginPath();
  g2.moveTo(x - 6, y); g2.lineTo(x - 2, y);
  g2.moveTo(x + 2, y); g2.lineTo(x + 6, y);
  g2.moveTo(x, y - 6); g2.lineTo(x, y - 2);
  g2.moveTo(x, y + 2); g2.lineTo(x, y + 6);
  g2.stroke();
}

function graphText(text, x, y, color = '#111', align = 'left') {
  setFont(13, '600');
  g2.textBaseline = 'middle';
  g2.textAlign = align;
  const w = g2.measureText(text).width;
  g2.fillStyle = 'rgb(255 255 255 / .85)';
  g2.fillRect(align === 'left' ? x - 2 : x - w - 2, y - 8, w + 4, 16);
  g2.fillStyle = color;
  g2.fillText(text, x, y);
  g2.textAlign = 'left';
}

function renderGraph() {
  graphCache ??= drawGraphBase();
  g2.save();
  g2.setTransform(1, 0, 0, 1, 0, 0);
  g2.drawImage(graphCache, 0, 0);
  g2.restore();
  const g = ui.graph;
  const c = g.calc;

  // Shaded integral.
  if (c?.shade) {
    const f = yFn(c.shade.f).fn;
    const [a, b] = [Math.min(c.shade.a, c.shade.b), Math.max(c.shade.a, c.shade.b)];
    g2.save();
    g2.beginPath();
    g2.rect(0, GY0, GW, GH);
    g2.clip();
    g2.fillStyle = Y_COLORS[c.shade.f];
    g2.globalAlpha = 0.3;
    g2.beginPath();
    g2.moveTo(px(a), py(0));
    for (let p = px(a); p <= px(b); p += 0.5) {
      const y = f(xAt(p));
      g2.lineTo(p, Number.isFinite(y) ? Math.max(GY0 - 10, Math.min(H + 10, py(y))) : py(0));
    }
    g2.lineTo(px(b), py(0));
    g2.closePath();
    g2.fill();
    g2.restore();
  }

  // Bound markers for CALC.
  if (c && !['intersect', 'value', 'dydx'].includes(c.type)) {
    g2.fillStyle = '#111';
    c.marks.slice(0, 2).forEach((x, i) => {
      const p = px(x);
      g2.beginPath();
      if (i === 0) { g2.moveTo(p, GY0 + 4); g2.lineTo(p + 6, GY0 + 8); g2.lineTo(p, GY0 + 12); }
      else { g2.moveTo(p, GY0 + 4); g2.lineTo(p - 6, GY0 + 8); g2.lineTo(p, GY0 + 12); }
      g2.fill();
    });
  }

  const bottom = H - 10;
  if (g.mode === 'trace' || c) {
    const f = yFn(g.f).fn;
    const y = f ? f(g.x) : NaN;
    if (Number.isFinite(y)) {
      const cy = py(y);
      if (cy >= GY0 && cy <= H) {
        g2.fillStyle = Y_COLORS[g.f];
        g2.fillRect(px(g.x) - 3, cy - 3, 6, 6);
        drawCursorCross(px(g.x), cy, Y_COLORS[g.f]);
      }
    }
    graphText(`Y${g.f === 9 ? 0 : g.f + 1}=${tokensText(state.yeq[g.f].tokens)}`.slice(0, 34), 4, GY0 + 10, Y_COLORS[g.f]);
    if (g.prompt) {
      graphText(`${g.prompt.label}${tokensText(g.prompt.ed.tokens)}${ui.blink ? '█' : ' '}`, 4, bottom);
    } else if (g.info) {
      if (g.info.value != null) graphText(`${g.info.name}=${fmt(g.info.value, 8)}`, 4, bottom);
      else {
        if (g.info.name) graphText(g.info.name, 4, bottom - 18);
        graphText(`X=${fmt(g.info.x, 8)}`, 4, bottom);
        graphText(`Y=${fmt(g.info.y, 8)}`, W - 4, bottom, '#111', 'right');
      }
    } else if (c && CALC_STEPS[c.type][c.step]) {
      graphText(CALC_STEPS[c.type][c.step], 4, bottom - 18);
      graphText(`X=${fmt(g.x, 8)}`, 4, bottom);
      graphText(`Y=${fmt(y, 8)}`, W - 4, bottom, '#111', 'right');
    } else if (state.fmt.coords) {
      graphText(`X=${fmt(g.x, 8)}`, 4, bottom);
      graphText(`Y=${Number.isFinite(y) ? fmt(y, 8) : ''}`, W - 4, bottom, '#111', 'right');
    }
  } else {
    // Free cursor.
    const x = xAt(g.cx), y = yAt(g.cy);
    if (g.box) {
      g2.strokeStyle = '#111';
      g2.setLineDash([3, 3]);
      g2.strokeRect(Math.min(g.box.cx, g.cx) + 0.5, Math.min(g.box.cy, g.cy) + 0.5, Math.abs(g.cx - g.box.cx), Math.abs(g.cy - g.box.cy));
      g2.setLineDash([]);
    }
    drawCursorCross(g.cx + 0.5, g.cy + 0.5);
    const hint = { zbox: g.box ? 'ZBox: move to the other corner, ENTER' : 'ZBox: move to a corner, ENTER', zin: 'Zoom In: move to the centre, ENTER', zout: 'Zoom Out: move to the centre, ENTER' }[g.mode];
    if (hint) graphText(hint, 4, GY0 + 10, '#1f5fd8');
    if (state.fmt.coords || g.mode !== 'free') {
      graphText(`X=${fmt(x, 8)}`, 4, bottom);
      graphText(`Y=${fmt(y, 8)}`, W - 4, bottom, '#111', 'right');
    }
  }
}

function renderTable() {
  const fns = activeFns();
  const t = ui.table;
  const colW = 8; // characters per column
  const visible = [null, ...fns];
  const firstCol = Math.max(0, Math.min(t.col - 2, visible.length - 3));
  const shown = visible.slice(firstCol, firstCol + 3);
  setFont(20);
  // Header
  shown.forEach((f, k) => {
    const name = f == null ? 'X' : `Y${f === 9 ? 0 : f + 1}`;
    const x = 4 + k * (colW + 1) * CW;
    g2.fillStyle = f == null ? '#111' : Y_COLORS[f];
    g2.textBaseline = 'middle';
    g2.fillText(name.padStart(Math.ceil((colW + name.length) / 2)), x, TOP + ROW_H / 2);
  });
  g2.fillStyle = '#9aa3ad';
  g2.fillRect(0, TOP + ROW_H - 1, W, 1);
  for (let k = 1; k < 3; k++) g2.fillRect(4 + k * (colW + 1) * CW - CW / 2, TOP, 1, ROW_H * (TABLE_ROWS + 1));
  for (let r = 0; r < TABLE_ROWS; r++) {
    const x = state.tbl.start + (t.top + r) * state.tbl.step;
    shown.forEach((f, k) => {
      const v = f == null ? x : yFn(f).fn(x);
      const text = short(v, colW);
      const selected = r === t.row && firstCol + k === t.col;
      const left = 4 + k * (colW + 1) * CW;
      const top = TOP + (r + 1) * ROW_H;
      if (selected) {
        g2.fillStyle = '#c9dbf5';
        g2.fillRect(left - 2, top, colW * CW + 4, ROW_H - 1);
      }
      g2.fillStyle = '#111';
      g2.fillText(text.padStart(colW), left, top + ROW_H / 2 + 1);
    });
  }
  // Full value of the selected cell.
  const x = state.tbl.start + (t.top + t.row) * state.tbl.step;
  const f = visible[t.col];
  const v = f == null ? x : yFn(f).fn(x);
  const name = f == null ? 'X' : `Y${f === 9 ? 0 : f + 1}`;
  drawRow(ROWS - 1, [{ text: `${name}=${Number.isFinite(v) ? fmt(v) : 'ERROR'}` }]);
}

function renderFlash() {
  if (!ui.flash) return;
  setFont(13, '600');
  const w = Math.min(W - 20, g2.measureText(ui.flash).width + 20);
  const x = (W - w) / 2, y = H / 2 - 16;
  g2.fillStyle = '#222';
  g2.fillRect(x, y, w, 32);
  g2.fillStyle = '#fff';
  g2.textBaseline = 'middle';
  g2.textAlign = 'center';
  g2.fillText(ui.flash, W / 2, y + 16, W - 30);
  g2.textAlign = 'left';
}

function render() {
  g2.setTransform(scale, 0, 0, scale, 0, 0);
  if (ui.screen === 'off') {
    g2.fillStyle = '#2b2f2b';
    g2.fillRect(0, 0, W, H);
    return;
  }
  g2.fillStyle = '#fff';
  g2.fillRect(0, 0, W, H);
  statusBar();
  switch (ui.screen) {
    case 'home': renderHome(); break;
    case 'menu': renderMenu(); break;
    case 'yeq': renderYeq(); break;
    case 'window': renderFields('WINDOW'); break;
    case 'tblset': renderFields('TABLE SETUP'); break;
    case 'mode': case 'format': renderOptions(); break;
    case 'graph': renderGraph(); break;
    case 'table': renderTable(); break;
  }
  renderFlash();
}

function announce(text) {
  $('announce').textContent = text.replace(/⁻/g, 'minus ');
}

// ---- Physical keyboard ---------------------------------------------------------------------------------

const KEYBOARD = {
  Enter: 'enter', '=': 'enter', Backspace: ':backspace', Delete: 'del', Escape: 'clear',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '^': 'pow', '(': 'lp', ')': 'rp', ',': 'comma', '.': 'dot',
  x: 'xt', X: 'xt',
};
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  let id = KEYBOARD[e.key];
  if (!id && /^[0-9]$/.test(e.key)) id = e.key;
  if (!id && e.key === '!') { dispatch('!'); render(); e.preventDefault(); return; }
  if (!id && /^[a-zA-Z]$/.test(e.key)) { dispatch(e.key.toUpperCase()); render(); e.preventDefault(); return; }
  if (!id) return;
  e.preventDefault();
  if (id.startsWith(':')) { dispatch(id); render(); return; }
  const btn = document.querySelector(`[data-key="${id}"]`);
  btn?.classList.add('pressed');
  setTimeout(() => btn?.classList.remove('pressed'), 90);
  press(id);
});

// ---- Start ------------------------------------------------------------------------------------------------

// Exposed for automated tests and debugging in the browser console.
window.calc84 = { state, ui };

buildKeys();
measure();
new ResizeObserver(resize).observe(canvas);
setInterval(() => { ui.blink = !ui.blink; render(); }, 500);
render();
