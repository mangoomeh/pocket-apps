import { keepUnreadable } from '../shared/store.js';
import {
  CHAINS, makeRpc, isAddress, normAddress, tokenInfo, earlyBuyers, groupInToken, walletFlows, formatAmount, percentOf,
} from '../src/onchain.js';
import {
  SOLANA, isSolanaAddress, solRpcFor, solTokenInfo, solEarlyBuyers, solGroupInToken, solWalletFlows,
} from '../src/solana.js';
import { searchTokens, money, age } from '../src/tokensearch.js';
import { $, esc, switchTab, toast } from '../shared/ui.js';

const STORAGE_KEY = 'wallets-v1';
const chain = CHAINS.robinhood;
const isSol = () => state.chain === 'solana';

// ---- Saved settings and groups -------------------------------------------------------------

function load() {
  const defaults = { chain: 'robinhood', rpc: chain.rpc, blockscoutKey: '', heliusKey: '', groups: [], inputs: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return { ...defaults, ...saved };
  } catch { /* storage unavailable: start fresh */ }
  return defaults;
}
keepUnreadable(STORAGE_KEY, () => true);
const state = load();
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* not remembered */ }
}

// ---- Small helpers ---------------------------------------------------------------------------------

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const explorer = (kind, id) => (isSol() ? `${SOLANA.explorer}/${kind === 'address' ? 'account' : kind}/${id}` : `${chain.explorer}/${kind}/${id}`);
const timeText = (ts) => (ts == null ? '' : new Date(ts * 1000).toLocaleString('en-SG', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}));
const pctText = (p) => (p >= 0.01 ? `${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}%` : p > 0 ? '<0.01%' : '0%');
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function copy(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast(text));
}

// The RPC for the chosen chain. Solana uses Helius when a key is set, else the free public node.
function rpcFor(signal) {
  if (isSol()) return solRpcFor({ heliusKey: state.heliusKey, signal });
  return makeRpc(state.rpc || chain.rpc, { signal });
}
const solKind = () => (state.heliusKey ? 'helius' : 'public');

// ---- Time windows --------------------------------------------------------------------------------
// Each search has a from/to pair of datetime inputs (in the phone's time zone) and quick presets.

const PRESETS = {
  b: [['Last 15 min', 15 * 60], ['Last hour', 3600], ['Last 24 h', 86400]],
  c: [['Last 24 h', 86400], ['Last 7 days', 7 * 86400], ['Last 30 days', 30 * 86400]],
  w: [['Last hour', 3600], ['Last 24 h', 86400], ['Last 3 days', 3 * 86400]],
};
const DEFAULT_SPAN = { b: 3600, c: 7 * 86400, w: 86400 };

function toLocalInput(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildWindows() {
  document.querySelectorAll('[data-window]').forEach((box) => {
    const key = box.dataset.window;
    box.innerHTML = `
      <div class="window-row">
        <label class="field"><span>From</span><input type="datetime-local" step="1" id="${key}-from"></label>
        <label class="field"><span>To</span><input type="datetime-local" step="1" id="${key}-to"></label>
      </div>
      <div class="presets"></div>
      <p class="hint">Times are in your time zone (${esc(zone)}).</p>`;
    const presets = box.querySelector('.presets');
    for (const [label, secs] of PRESETS[key]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'secondary small';
      b.textContent = label;
      b.addEventListener('click', () => setWindow(key, Date.now() - secs * 1000, Date.now()));
      presets.append(b);
    }
    const saved = state.inputs[key];
    if (saved?.from && saved?.to) {
      $(`${key}-from`).value = saved.from;
      $(`${key}-to`).value = saved.to;
    } else {
      setWindow(key, Date.now() - DEFAULT_SPAN[key] * 1000, Date.now());
    }
  });
}

function setWindow(key, fromMs, toMs) {
  $(`${key}-from`).value = toLocalInput(fromMs);
  $(`${key}-to`).value = toLocalInput(toMs);
}

function readWindow(key) {
  const from = $(`${key}-from`).value, to = $(`${key}-to`).value;
  const start = Math.floor(new Date(from).getTime() / 1000);
  const end = Math.floor(new Date(to).getTime() / 1000);
  if (!from || !to || Number.isNaN(start) || Number.isNaN(end)) throw new Error('Pick a start and end time.');
  if (end <= start) throw new Error('The end time must be after the start time.');
  state.inputs[key] = { from, to };
  return { start, end };
}

// ---- Running a search -------------------------------------------------------------------------------
// One search at a time per tab; the button turns into Cancel while it runs.

const running = {};

async function runSearch(key, task) {
  const btn = $(`${key}-run`);
  const progress = $(`${key}-progress`);
  if (running[key]) { running[key].abort(); return; }
  const controller = new AbortController();
  running[key] = controller;
  const label = btn.textContent;
  btn.textContent = 'Cancel';
  btn.classList.replace('primary', 'secondary');
  progress.hidden = false;
  progress.className = 'progress';
  progress.textContent = 'Starting…';
  try {
    await task(rpcFor(controller.signal), (msg) => { progress.textContent = msg; });
    progress.hidden = true;
    save();
  } catch (err) {
    progress.className = 'progress error';
    progress.textContent = controller.signal.aborted ? 'Cancelled.' : (err.message || 'Something went wrong.');
  } finally {
    running[key] = null;
    btn.textContent = label;
    btn.classList.replace('secondary', 'primary');
  }
}

const validAddress = (a) => (isSol() ? isSolanaAddress(a) : isAddress(a));
const normalise = (a) => (isSol() ? a.trim() : normAddress(a));

function requireAddress(value, what) {
  if (!validAddress(value)) {
    throw new Error(isSol()
      ? `That doesn’t look like a Solana ${what} address (32–44 letters and numbers).`
      : `That doesn’t look like a ${what} address (0x followed by 40 characters).`);
  }
  return normalise(value);
}

// ---- 1. Early buyers ------------------------------------------------------------------------------------

let lastBuyers = null;

async function findBuyers() {
  await runSearch('b', async (rpc, step) => {
    if (!validAddress($('b-token').value)) throw new Error('Pick a token from the search results, or paste its address.');
    const token = requireAddress($('b-token').value, 'token');
    const { start, end } = readWindow('b');
    const byUsd = buyersBy() === 'usd';
    const min = byUsd ? Math.max(1, Number($('b-min').value) || 1000) : Math.max(0.01, Number($('b-min').value) || 1);
    state.inputs.bToken = token;
    state.inputs[byUsd ? 'bMinUsd' : 'bMin'] = min;
    state.inputs.bBy = buyersBy();
    const opts = {
      token, start, end, countTransfersIn: $('b-transfers').checked, onStep: step,
      ...(byUsd ? { minUsd: min, quotes: chain.quotes } : { minPct: min }),
    };
    const result = isSol() ? await solEarlyBuyers(rpc, { ...opts, rpcKind: solKind() }) : await earlyBuyers(rpc, opts);
    lastBuyers = { ...result, token, start, end, minPct: byUsd ? null : min, minUsd: byUsd ? min : null };
    renderBuyers();
  });
}

const buyersBy = () => document.querySelector('input[name="b-by"]:checked').value;
const usdText = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e4 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v).toLocaleString('en-US')}`);
const levelText = (l, byUsd) => (byUsd ? `≥$${l.level >= 1000 ? `${l.level / 1000}K` : l.level}` : `≥${pctText(l.level)}`);

// The threshold box changes meaning (and remembered value) with the % / $ choice.
function showBuyersBy() {
  const byUsd = buyersBy() === 'usd';
  $('b-min-label').textContent = byUsd ? 'Show wallets that spent at least this many US dollars' : 'Show wallets that got at least this % of the supply';
  $('b-min').min = byUsd ? '1' : '0.01';
  $('b-min').step = byUsd ? '100' : '0.1';
  $('b-min').value = byUsd ? state.inputs.bMinUsd || 1000 : state.inputs.bMin || 1;
  $('b-by-hint').hidden = !byUsd;
}

function badge(text, tone = '') {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

function renderBuyers() {
  const r = lastBuyers;
  const box = $('b-results');
  box.hidden = false;
  const { info } = r;
  const more = r.matched - r.wallets.length;
  const byUsd = r.minUsd != null;
  const rows = r.wallets.map((w, i) => {
    const holdsPct = w.holds != null ? percentOf(w.holds, info.totalSupply) : null;
    const badges = [
      w.bundledWith.length ? badge(isSol() ? `same block as ${w.bundledWith.length} other buyer${w.bundledWith.length === 1 ? '' : 's'}` : `bundle with ${w.bundledWith.length}`, 'warn') : '',
      w.isContract ? badge('contract') : '',
      w.sold > 0n ? badge(`sold ${formatAmount(w.sold, info.decimals)} in window`) : '',
      w.buys >= 20 ? badge(`${w.buys} buys: likely a trading bot`, 'warn') : '',
      w.received > 0n && r.wallets && $('b-transfers').checked ? badge(`got ${formatAmount(w.received, info.decimals)} by transfer`) : '',
    ].join('');
    return `
      <li>
        <button type="button" class="wallet-row" data-i="${i}">
          <span class="rank">${i + 1}</span>
          <span class="who">
            <span class="mono">${short(w.address)}</span>
            <small>first in ${esc(timeText(w.firstTs))} · ${w.buys} buy${w.buys === 1 ? '' : 's'}</small>
            <span class="badges">${badges}</span>
          </span>
          <span class="nums">
            ${r.minUsd != null ? `<strong>${usdText(w.spentUsd)}</strong><small>${pctText(w.pct)} of supply</small>` : `<strong>${pctText(w.pct)}</strong>${w.spentUsd != null ? `<small>spent ${usdText(w.spentUsd)}</small>` : ''}`}
            <small>${formatAmount(w.inAmount, info.decimals)} ${esc(info.symbol)}</small>
            ${w.sold > 0n ? `<small>net ${w.inAmount >= w.sold ? '+' : '−'}${pctText(percentOf(w.inAmount >= w.sold ? w.inAmount - w.sold : w.sold - w.inAmount, info.totalSupply))}</small>` : ''}
            <small>${holdsPct == null ? '' : `holds ${pctText(holdsPct)} now`}</small>
          </span>
        </button>
      </li>`;
  }).join('');
  box.innerHTML = `
    <h2>${esc(info.symbol)} ${info.name ? `<small>${esc(info.name)}</small>` : ''}</h2>
    ${info.suspicious ? '<p class="progress error">⚠ This token’s name contains hidden characters, a trick used by fake look-alike tokens.</p>' : ''}
    <div class="buyers-headline">
      <p class="big-count">${r.matched.toLocaleString()}</p>
      <p>wallet${r.matched === 1 ? '' : 's'} ${byUsd ? `spent at least ${usdText(r.minUsd)}` : `got at least ${pctText(r.minPct)} of the supply`} between ${esc(timeText(r.start))} and ${esc(timeText(r.end))}${byUsd && r.matched ? `, ${usdText(r.spentTotal)} in all` : ''}.</p>
    </div>
    <p class="summary-line">${r.transfers.toLocaleString()} ${isSol() ? 'transactions' : 'transfers'} · ${r.buyers.toLocaleString()} wallets got tokens</p>
    ${r.levels?.length ? `<p class="levels">${r.levels.map((l) => `<span><b>${l.count.toLocaleString()}</b> ${levelText(l, byUsd)}</span>`).join('')}</p>` : ''}
    ${byUsd && r.unpriced ? `<p class="hint">${r.unpriced.toLocaleString()} buyer${r.unpriced === 1 ? '' : 's'} paid from another address (a smart account, or a bundle bought by someone else), so what they spent can't be seen; they aren't counted.</p>` : ''}
    ${r.wallets.length ? `<ol class="wallets">${rows}</ol>` : `<p class="hint">No wallet reached that ${byUsd ? 'amount' : 'share'} in this window. Try a lower ${byUsd ? 'amount' : '%'} or a different window.</p>`}
    ${more > 0 ? `<p class="hint">Showing the top ${r.wallets.length}. ${more.toLocaleString()} more matched; raise the ${byUsd ? 'amount' : '%'} to narrow it down.</p>` : ''}
    ${r.wallets.length ? `<div class="actions">
      <button class="secondary" type="button" id="b-save">Save as group</button>
      <button class="secondary" type="button" id="b-csv">Export CSV</button>
    </div>` : ''}`;
  box.querySelectorAll('.wallet-row').forEach((b) => b.addEventListener('click', () => openSheet(r.wallets[Number(b.dataset.i)].address)));
  $('b-save')?.addEventListener('click', saveGroup);
  $('b-csv')?.addEventListener('click', exportCsv);
}

function saveGroup() {
  const r = lastBuyers;
  const name = prompt('Name this group', `${r.info.symbol} ${r.minUsd != null ? `≥${usdText(r.minUsd)}` : `≥${r.minPct}%`} · ${timeText(r.start)}`);
  if (!name) return;
  state.groups.unshift({
    id: Date.now().toString(36),
    chain: state.chain,
    name,
    token: r.token,
    symbol: r.info.symbol,
    wallets: r.wallets.map((w) => ({ address: w.address, pct: w.pct })),
  });
  save();
  renderGroups();
  toast(`Saved “${name}” (${r.wallets.length} wallets)`);
}

function exportCsv() {
  const r = lastBuyers;
  const d = r.info.decimals;
  const amount = (v) => {
    const s = (v < 0n ? -v : v).toString().padStart(d + 1, '0');
    return d ? `${s.slice(0, -d)}.${s.slice(-d)}` : s;
  };
  const lines = [['wallet', 'percent_of_supply', 'amount', 'spent_usd', 'buys', 'first_in_local_time', 'first_tx', 'sold_in_window', 'holds_now', 'bundled_with', 'is_contract']];
  for (const w of r.wallets) {
    lines.push([w.address, w.pct, amount(w.inAmount), w.spentUsd == null ? '' : w.spentUsd.toFixed(2), w.buys, timeText(w.firstTs), w.firstTx, amount(w.sold), w.holds == null ? '' : amount(w.holds), w.bundledWith.length, w.isContract ? 'yes' : 'no']);
  }
  const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${r.info.symbol}-buyers.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- 2. Compare ---------------------------------------------------------------------------------------------

function renderGroups() {
  const sel = $('c-group');
  const current = sel.value;
  const forChain = state.groups.filter((g) => (g.chain || 'robinhood') === state.chain);
  sel.innerHTML = '<option value="">— none —</option>' + forChain
    .map((g) => `<option value="${g.id}">${esc(g.name)} (${g.wallets.length})</option>`).join('');
  if (state.groups.some((g) => g.id === current)) sel.value = current;

  $('s-groups-empty').hidden = state.groups.length > 0;
  $('s-groups').innerHTML = state.groups.map((g) => `
    <li><span><b>${esc(g.name)}</b><small>${g.wallets.length} wallets · ${esc(g.symbol)} · ${g.chain === 'solana' ? 'Solana' : 'Robinhood Chain'}</small></span>
      <button type="button" class="icon-btn" data-id="${g.id}" aria-label="Delete group">✕</button></li>`).join('');
  $('s-groups').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Delete this group?')) return;
    state.groups = state.groups.filter((g) => g.id !== b.dataset.id);
    save();
    renderGroups();
  }));
}

function compareWallets() {
  const fromGroup = state.groups.find((g) => g.id === $('c-group').value);
  const pasted = $('c-wallets').value.split(/[\s,]+/).filter(Boolean);
  const bad = pasted.filter((a) => !validAddress(a));
  if (bad.length) throw new Error(`Not a wallet address: ${bad[0]}`);
  const wallets = [...new Set([...(fromGroup?.wallets.map((w) => w.address) || []), ...pasted.map(normalise)])];
  if (!wallets.length) throw new Error('Pick a saved group or paste some wallet addresses.');
  if (wallets.length > 100) throw new Error('Compare up to 100 wallets at a time.');
  return wallets;
}

async function runCompare() {
  await runSearch('c', async (rpc, step) => {
    const wallets = compareWallets();
    if (!validAddress($('c-token').value)) throw new Error('Pick the other token from the search results, or paste its address.');
    const token = requireAddress($('c-token').value, 'token');
    const { start, end } = readWindow('c');
    state.inputs.cToken = token;
    const r = isSol() ? await solGroupInToken(rpc, { token, wallets, start, end, onStep: step }) : await groupInToken(rpc, { token, wallets, start, end, onStep: step });
    const found = r.rows.filter((x) => x.found).sort((a, b) => (a.firstTs ?? Infinity) - (b.firstTs ?? Infinity));
    const missing = r.rows.filter((x) => !x.found);
    const { info } = r;
    const row = (x) => `
      <li>
        <button type="button" class="wallet-row" data-a="${x.address}">
          <span class="who">
            <span class="mono">${short(x.address)}</span>
            <small>${x.firstTs ? `first in ${esc(timeText(x.firstTs))}` : ''}</small>
            <span class="badges">${x.bought > 0n ? badge('bought', 'ok') : ''}${x.received > 0n ? badge('got by transfer', 'warn') : ''}</span>
          </span>
          <span class="nums">
            <strong>${pctText(x.pct)}</strong>
            <small>${formatAmount(x.bought + x.received, info.decimals)} ${esc(info.symbol)}</small>
            <small>${x.holds == null ? '' : `holds ${pctText(percentOf(x.holds, info.totalSupply))} now`}</small>
          </span>
        </button>
      </li>`;
    const box = $('c-results');
    box.hidden = false;
    box.innerHTML = `
      <h2>${esc(info.symbol)} ${info.name ? `<small>${esc(info.name)}</small>` : ''}</h2>
      <p class="summary-line"><b>${found.length} of ${wallets.length} wallets</b> bought or received ${esc(info.symbol)} in this window.</p>
      ${found.length ? `<ol class="wallets">${found.map(row).join('')}</ol>` : ''}
      ${missing.length ? `<details><summary class="hint">${missing.length} wallet${missing.length === 1 ? '' : 's'} didn’t</summary>
        <p class="mono small-list">${missing.map((x) => short(x.address)).join(' · ')}</p></details>` : ''}`;
    box.querySelectorAll('.wallet-row').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.a)));
  });
}

// ---- 3. Wallet flows ----------------------------------------------------------------------------------------

async function runWallet() {
  await runSearch('w', async (rpc, step) => {
    const wallet = requireAddress($('w-address').value, 'wallet');
    const { start, end } = readWindow('w');
    const direction = document.querySelector('input[name="w-dir"]:checked').value;
    state.inputs.wAddress = wallet;
    if (isSol()) {
      // On Solana, SOL transfers come with the transactions, so no extra key is needed.
      const r = await solWalletFlows(rpc, { wallet, start, end, direction, rpcKind: solKind(), onStep: step });
      renderWallet(wallet, direction, r, 'included');
      return;
    }
    const r = await walletFlows(rpc, { wallet, start, end, direction, onStep: step });
    const native = state.blockscoutKey ? await nativeFlows(wallet, r.fromBlock, r.toBlock, direction).catch((e) => ({ error: e.message })) : null;
    renderWallet(wallet, direction, r, native);
  });
}

// ETH transfers aren't token events, so they come from Blockscout's indexer (free key).
async function nativeFlows(wallet, fromBlock, toBlock, direction) {
  const url = `https://api.blockscout.com/api?chain_id=${chain.id}&chainid=${chain.id}&module=account&action=txlist`
    + `&address=${wallet}&startblock=${fromBlock}&endblock=${toBlock}&sort=asc&apikey=${encodeURIComponent(state.blockscoutKey)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !Array.isArray(data.result)) throw new Error(data?.message || data?.error || `Blockscout error ${res.status}`);
  const groups = new Map();
  for (const tx of data.result) {
    const from = tx.from?.toLowerCase(), to = tx.to?.toLowerCase();
    const value = BigInt(tx.value || 0);
    if (value === 0n || tx.isError === '1') continue;
    const other = direction === 'out' ? (from === wallet ? to : null) : (to === wallet ? from : null);
    if (!other) continue;
    const g = groups.get(other) || { address: other, count: 0, value: 0n, firstTs: Number(tx.timeStamp) };
    g.count++;
    g.value += value;
    groups.set(other, g);
  }
  return { groups: [...groups.values()].sort((a, b) => a.firstTs - b.firstTs) };
}

function renderWallet(wallet, direction, r, native) {
  const verb = isSol() ? (direction === 'out' ? 'sent SOL or tokens to' : 'received SOL or tokens from') : (direction === 'out' ? 'sent tokens to' : 'received tokens from');
  const people = r.groups.filter((g) => !g.isContract);
  const tokenText = (g) => [...g.byToken.entries()]
    .map(([t, v]) => `${formatAmount(v, r.tokens.get(t)?.decimals ?? 18)} ${r.tokens.get(t)?.symbol ?? '?'}${r.tokens.get(t)?.suspicious ? ' ⚠' : ''}`).join(', ');
  // Address poisoning: scammers make addresses that start and end like a real one.
  const lookalike = (g) => r.groups.some((o) => o.address !== g.address && short(o.address) === short(g.address));
  const row = (g) => `
    <li>
      <button type="button" class="wallet-row" data-a="${g.address}">
        <span class="who">
          <span class="mono">${short(g.address)}</span>
          <small>${esc(timeText(g.firstTs))}${g.lastTs !== g.firstTs ? ` → ${esc(timeText(g.lastTs))}` : ''}</small>
          <span class="badges">${g.isContract ? badge('contract') : ''}${lookalike(g) ? badge('look-alike address: possible scam', 'warn') : ''}</span>
        </span>
        <span class="nums"><strong>${g.count}×</strong><small>${esc(tokenText(g))}</small></span>
      </button>
    </li>`;
  let nativeHtml = '';
  if (native === 'included') nativeHtml = '';
  else if (native?.error) nativeHtml = `<p class="progress error">ETH transfers: ${esc(native.error)}</p>`;
  else if (native) {
    nativeHtml = `<h3>ETH ${direction === 'out' ? 'sent to' : 'received from'} ${native.groups.length} address${native.groups.length === 1 ? '' : 'es'}</h3>
      <ol class="wallets">${native.groups.map((g) => `<li><button type="button" class="wallet-row" data-a="${g.address}">
        <span class="who"><span class="mono">${short(g.address)}</span><small>${esc(timeText(g.firstTs))}</small></span>
        <span class="nums"><strong>${g.count}×</strong><small>${formatAmount(g.value, 18)} ETH</small></span></button></li>`).join('')}</ol>`;
  } else {
    nativeHtml = '<p class="hint">ETH transfers (how wallets are usually funded) need a free Blockscout key: add it in Settings.</p>';
  }
  const box = $('w-results');
  box.hidden = false;
  box.innerHTML = `
    <h2 class="mono">${short(wallet)}</h2>
    <p class="summary-line"><b>${verb} ${people.length} wallet${people.length === 1 ? '' : 's'}</b>
      ${r.groups.length > people.length ? `and ${r.groups.length - people.length} contract${r.groups.length - people.length === 1 ? '' : 's'}` : ''}
      (${r.transfers.toLocaleString()} transfers)</p>
    ${people.length ? `<ol class="wallets">${people.map(row).join('')}</ol>` : `<p class="hint">No transfers ${direction === 'out' ? 'to' : 'from'} other wallets in this window.</p>`}
    ${r.groups.length > people.length ? `<details class="programs"><summary>${r.groups.length - people.length} contract${r.groups.length - people.length === 1 ? '' : 's'} (pools, apps)</summary>
      <ol class="wallets">${r.groups.filter((g) => g.isContract).map(row).join('')}</ol></details>` : ''}
    ${nativeHtml}`;
  box.querySelectorAll('.wallet-row').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.a)));
}

// ---- Wallet actions sheet ---------------------------------------------------------------------------------

function openSheet(address) {
  $('sheet-title').textContent = address;
  const actions = $('sheet-actions');
  actions.innerHTML = '';
  const add = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'secondary';
    b.textContent = label;
    b.addEventListener('click', () => { $('sheet').close(); fn(); });
    actions.append(b);
  };
  add('Who did it send to?', () => { $('w-address').value = address; document.querySelector('input[name="w-dir"][value="out"]').checked = true; switchTab('wallet'); });
  add('Who funded it?', () => { $('w-address').value = address; document.querySelector('input[name="w-dir"][value="in"]').checked = true; switchTab('wallet'); });
  add('Open in explorer ↗', () => window.open(explorer('address', address), '_blank', 'noopener'));
  add('Copy address', () => copy(address));
  $('sheet').showModal();
}

// ---- Tabs, settings and start-up -------------------------------------------------------------------------

async function showTokenInfo() {
  const el = $('b-token-info');
  const value = $('b-token').value.trim();
  if (!validAddress(value)) { el.textContent = ''; return; }
  el.textContent = 'Looking up token…';
  try {
    const info = isSol() ? await solTokenInfo(rpcFor(), value.trim()) : await tokenInfo(rpcFor(), value);
    el.textContent = `${info.symbol}${info.name ? ` · ${info.name}` : ''} · supply ${formatAmount(info.totalSupply, info.decimals)}${info.suspicious ? ' · ⚠ name has hidden characters (possible fake)' : ''}`;
  } catch (err) {
    el.textContent = err.message;
  }
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('b-run').addEventListener('click', findBuyers);
$('c-run').addEventListener('click', runCompare);
$('w-run').addEventListener('click', runWallet);
$('b-token').addEventListener('change', showTokenInfo);
for (const [id, key] of [['s-rpc', 'rpc'], ['s-blockscout', 'blockscoutKey'], ['s-helius', 'heliusKey']]) {
  $(id).value = state[key] || '';
  $(id).addEventListener('change', () => {
    state[key] = $(id).value.trim() || (key === 'rpc' ? chain.rpc : '');
    $(id).value = state[key];
    save();
    if (key === 'heliusKey') applyChain();
  });
}
$('b-token').value = state.inputs.bToken || '';
document.querySelector(`input[name="b-by"][value="${state.inputs.bBy === 'usd' ? 'usd' : 'pct'}"]`).checked = true;
showBuyersBy();
document.querySelectorAll('input[name="b-by"]').forEach((r) => r.addEventListener('change', showBuyersBy));
$('c-token').value = state.inputs.cToken || '';
$('w-address').value = state.inputs.wAddress || '';

// ---- Search by name -------------------------------------------------------------------------------------
// Typing a name in a token field lists matching tokens on the chosen chain (via DexScreener).

function attachSearch(inputId, boxId, onPick) {
  const input = $(inputId);
  const box = $(boxId);
  let timer, controller;
  const run = async () => {
    const q = input.value.trim();
    if (validAddress(q) || q.length < 2) { box.hidden = true; return; }
    controller?.abort();
    controller = new AbortController();
    box.hidden = false;
    box.innerHTML = '<p class="hint">Searching…</p>';
    try {
      const results = (await searchTokens(q, state.chain, { signal: controller.signal })).slice(0, 8);
      if (!results.length) {
        box.innerHTML = `<p class="hint">No ${isSol() ? 'Solana' : 'Robinhood Chain'} tokens found for “${esc(q)}”. Try the exact symbol, or paste the address.</p>`;
        return;
      }
      box.innerHTML = `<ul>${results.map((t, i) => `
        <li><button type="button" data-i="${i}">
          <span class="who">
            <span><b>${esc(t.symbol)}</b> <small>${esc(t.name)}</small></span>
            <small class="mono">${esc(short(t.address))}</small>
            ${t.possibleCopycat || t.oddLiquidity ? `<span class="badges">${t.possibleCopycat ? '<span class="badge warn">same name, far less trading: possible copycat</span>' : ''}${t.oddLiquidity ? '<span class="badge warn">big liquidity, almost no trading: suspicious</span>' : ''}</span>` : ''}
          </span>
          <span class="nums"><small>liquidity ${money(t.liquidityUsd)}</small><small>24h vol ${money(t.volume24h)}</small><small>${age(t.createdAt)}</small></span>
        </button></li>`).join('')}</ul>
        <p class="hint">Search by DexScreener, most traded first: the real token usually has the most trading.</p>`;
      box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        input.value = results[Number(b.dataset.i)].address;
        box.hidden = true;
        onPick?.(results[Number(b.dataset.i)]);
      }));
    } catch (err) {
      if (err.name !== 'AbortError') box.innerHTML = `<p class="progress error">${esc(err.message || 'Search failed.')}</p>`;
    }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 450); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); run(); } });
}

function applyChain() {
  $('chain').value = state.chain;
  const sol = isSol();
  document.querySelectorAll('input.mono').forEach((i) => { i.placeholder = i.id.endsWith('-token') ? `e.g. Paper, or ${sol ? 'a Solana address' : '0x…'}` : (sol ? 'Solana address…' : '0x…'); });
  $('b-search').hidden = true;
  $('c-search').hidden = true;
  const note = $('speed-note');
  note.hidden = !sol;
  note.innerHTML = sol && !state.heliusKey
    ? 'Solana uses PublicNode’s free node (no key needed). Busy tokens over long windows can take a few minutes: short windows are quickest.'
    : sol ? 'Solana uses your Helius key.' : '';
  $('b-token-info').textContent = '';
}
$('chain').addEventListener('change', () => {
  state.chain = $('chain').value;
  // Results belong to the chain they came from.
  for (const k of ['b', 'c', 'w']) { $(`${k}-results`).hidden = true; $(`${k}-progress`).hidden = true; running[k]?.abort(); }
  lastBuyers = null;
  save();
  applyChain();
  renderGroups();
  if ($('b-token').value) showTokenInfo();
});

// A token picked from the search knows when its first pool opened, so offer its first hour.
function showLaunch(createdAt) {
  document.getElementById('b-launch')?.remove();
  if (!createdAt) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'b-launch';
  b.className = 'secondary small';
  b.textContent = 'First hour after launch';
  b.title = `Trading started ${timeText(Math.floor(createdAt / 1000))}`;
  b.addEventListener('click', () => setWindow('b', createdAt, createdAt + 3600 * 1000));
  document.querySelector('[data-window="b"] .presets').prepend(b);
}
$('b-token').addEventListener('input', () => showLaunch(null));
attachSearch('b-token', 'b-search', (t) => { showTokenInfo(); showLaunch(t.createdAt); });
attachSearch('c-token', 'c-search');

buildWindows();
renderGroups();
applyChain();
if ($('b-token').value) showTokenInfo();

// Exposed for automated tests.
window.radar = { state };
