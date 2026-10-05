'use strict';
/* 心の記録（仮）：iPhone の「心の状態」と同じ3ステップ。記録は GitHub の API で OWNER/REPO の DIR/ に1回1ファイルで置く。 */
const OWNER = 'yukitakaGrid';
const REPO = 'shima-inbox';
const DIR = 'mood';
const VIA = 'mood-app';

const WORDS = {
  neutral: ['充足', '冷静', '穏やか', '無関心', '疲弊'],
  pleasant: ['驚嘆', '興奮', '驚き', '情熱', '幸せ', '楽しい', '勇敢', '誇り', '自信', '希望', '愉快', '満足', '安心', '感謝', '充足', '冷静', '穏やか'],
  unpleasant: ['怒り', '不安', '恐怖', '重圧', '恥ずかしい', 'うんざり', '困惑', '不満', '憤慨', '嫉妬', 'ストレス', '心配', '罪悪感', '驚き', '絶望', 'いら立ち', '孤独', '消沈', '落胆', '疲弊', '悲しい'],
};
const INFLUENCES = [
  ['健康', 'フィットネス', 'セルフケア', '趣味', 'アイデンティティ', 'スピリチュアル'],
  ['コミュニティ', '家族', '友達', 'パートナー', '交際'],
  ['タスク', '仕事', '教育', '旅行', '天気', '現在の出来事', 'お金'],
];

const $ = (id) => document.getElementById(id);
const state = { valence: 0, labels: new Set(), influence: null, showAll: false, prev: 'step1' };

/* ---------- 色と円 ---------- */
const PAL = {
  neutral: { bg1: [220, 228, 228], bg2: [238, 242, 242], ink: [52, 70, 75], accent: [85, 153, 176],
    o1: [235, 248, 250, .5], o2: [120, 190, 220, .85] },
  pleasant: { bg1: [251, 230, 214], bg2: [242, 196, 133], ink: [74, 42, 18], accent: [229, 122, 63],
    o1: [255, 244, 214, .6], o2: [240, 150, 80, .9] },
  unpleasant: { bg1: [211, 205, 240], bg2: [169, 160, 200], ink: [26, 18, 56], accent: [35, 20, 102],
    o1: [236, 232, 250, .6], o2: [120, 90, 210, .9] },
};
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const rgb = (c) => `rgb(${c.slice(0, 3).map(Math.round).join(',')})`;
const rgba = (c) => `rgba(${c.slice(0, 3).map(Math.round).join(',')},${c[3].toFixed(2)})`;

function palette(v) {
  const t = Math.min(1, Math.abs(v) * 1.2);
  const to = v >= 0 ? PAL.pleasant : PAL.unpleasant;
  const out = {};
  for (const k of Object.keys(PAL.neutral)) out[k] = mix(PAL.neutral[k], to[k], t);
  return out;
}

function orbMarkup(v) {
  const p = palette(v);
  const t = Math.min(1, Math.abs(v) * 1.2);
  const k = v >= 0 ? 1 / (1 + 0.2 * t) : 1; // 花の先が枠からはみ出さないように縮める
  const bases = [96, 78, 60, 43, 27].map((x) => x * k);
  let out = '';
  bases.forEach((base, i) => {
    const f = i / (bases.length - 1);
    const col = mix(p.o1, p.o2, f);
    const ph = i * 0.28;
    const pts = [];
    for (let k = 0; k < 180; k++) {
      const th = (k / 180) * Math.PI * 2;
      let r;
      if (v >= 0) r = base * (1 + t * 0.2 * Math.cos(5 * th + ph));
      else {
        const a = t * 0.38;
        r = base * (1 - a + a * Math.pow(Math.abs(Math.cos(4 * th + ph)), 2.6));
      }
      pts.push(`${(r * Math.cos(th)).toFixed(1)} ${(r * Math.sin(th)).toFixed(1)}`);
    }
    out += `<path d="M${pts.join('L')}Z" fill="${rgba(col)}" stroke="rgba(255,255,255,.75)" stroke-width="1"/>`;
  });
  out += '<circle r="3.2" fill="rgba(255,255,255,.9)"/>';
  return out;
}

function valenceWord(v) {
  const a = Math.abs(v);
  if (a < 0.12) return 'どちらとも言えない';
  if (v < 0) return a > 0.78 ? '非常に不快' : a > 0.45 ? '不快' : 'やや不快';
  return a > 0.78 ? '非常に快適' : a > 0.45 ? '快適' : 'やや快適';
}
function zone(v) { return Math.abs(v) < 0.12 ? 'neutral' : v < 0 ? 'unpleasant' : 'pleasant'; }

function applyValence() {
  const v = state.valence / 100;
  const p = palette(v);
  const r = document.documentElement.style;
  r.setProperty('--bg1', rgb(p.bg1));
  r.setProperty('--bg2', rgb(p.bg2));
  r.setProperty('--ink', rgb(p.ink));
  r.setProperty('--accent', rgb(p.accent));
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', rgb(p.bg1));
  const markup = orbMarkup(v);
  ['orb', 'orb2', 'orb3'].forEach((id) => { $(id).innerHTML = markup; });
  const w = valenceWord(v);
  ['valence-label', 'valence-label2', 'valence-label3'].forEach((id) => { $(id).textContent = w; });
}

/* ---------- 画面 ---------- */
function show(id) {
  ['step1', 'step2', 'step3', 'result', 'settings'].forEach((s) => { $(s).hidden = s !== id; });
  $('title').textContent = id === 'settings' ? '設定' : id === 'result' ? '記録' : '感情';
  $('back').hidden = !(id === 'step2' || id === 'step3' || id === 'settings');
  state.cur = id;
  window.scrollTo(0, 0);
}

function renderLabels() {
  const box = $('labels');
  box.innerHTML = '';
  const z = zone(state.valence / 100);
  let words = WORDS[z].slice();
  if (state.showAll) {
    const all = [].concat(WORDS.pleasant, WORDS.neutral, WORDS.unpleasant);
    all.forEach((w) => { if (!words.includes(w)) words.push(w); });
  }
  words.forEach((w) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = w;
    b.setAttribute('aria-pressed', state.labels.has(w) ? 'true' : 'false');
    b.addEventListener('click', () => {
      if (state.labels.has(w)) state.labels.delete(w); else state.labels.add(w);
      b.setAttribute('aria-pressed', state.labels.has(w) ? 'true' : 'false');
    });
    box.appendChild(b);
  });
  $('more').hidden = state.showAll;
}

function renderInfluences() {
  const box = $('influences');
  box.innerHTML = '';
  INFLUENCES.forEach((g) => {
    const row = document.createElement('div');
    row.className = 'group';
    g.forEach((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = w;
      b.setAttribute('aria-pressed', state.influence === w ? 'true' : 'false');
      b.addEventListener('click', () => {
        state.influence = state.influence === w ? null : w;
        box.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c.textContent === state.influence ? 'true' : 'false'));
      });
      row.appendChild(b);
    });
    box.appendChild(row);
  });
}

/* ---------- 時刻と保存 ---------- */
const pad = (n, w = 2) => String(n).padStart(w, '0');
function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function isoLocal(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* 何もしない */ } },
};
const getToken = () => store.get('mood.token', '');
const getPending = () => { try { return JSON.parse(store.get('mood.pending', '[]')); } catch (e) { return []; } };
const setPending = (a) => store.set('mood.pending', JSON.stringify(a));

async function putFile(name, record, token) {
  for (let i = 0; i < 5; i++) {
    const fname = i === 0 ? name : `${name}_${i + 1}`;
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DIR}/${fname}.json`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: `心の記録 ${fname}`, content: b64(JSON.stringify(record, null, 2) + '\n') }),
    });
    if (res.status === 200 || res.status === 201) return { ok: true };
    if (res.status === 422) continue; // 同じ名前がある → 名前を変えて再挑戦
    return { ok: false, status: res.status };
  }
  return { ok: false, status: 422 };
}

/* 未送信を順に送る。戻り値：{sent, left, reason} reason は 'token' | 'offline' | 'auth' | null */
async function flush() {
  const token = getToken();
  let pending = getPending();
  if (!pending.length) return { sent: 0, left: 0, reason: null };
  if (!token) return { sent: 0, left: pending.length, reason: 'token' };
  let sent = 0;
  while (pending.length) {
    let r;
    try { r = await putFile(pending[0].name, pending[0].record, token); }
    catch (e) { return { sent, left: pending.length, reason: 'offline' }; }
    if (!r.ok) return { sent, left: pending.length, reason: (r.status === 401 || r.status === 403 || r.status === 404) ? 'auth' : 'offline' };
    pending.shift();
    sent++;
    setPending(pending);
  }
  return { sent, left: 0, reason: null };
}

const REASON = {
  token: 'トークンが未設定です。右上の設定で貼ると送れます。',
  offline: '通信できなかったので、あとで送ります。',
  auth: 'トークンが無効か、権限が足りません。設定を確かめてください。',
};

async function finish() {
  const d = new Date();
  const record = {
    at: isoLocal(d),
    valence: Math.round(state.valence) / 100,
    labels: Array.from(state.labels),
    influence: state.influence,
    via: VIA,
  };
  const pending = getPending();
  pending.push({ name: stamp(d), record });
  if (!setPending(pending)) { $('result-title').textContent = '保存できませんでした'; $('result-detail').textContent = 'この端末の保存領域が使えません。'; show('result'); return; }
  $('done').disabled = true;
  const r = await flush();
  $('done').disabled = false;
  if (r.left === 0) {
    $('result-title').textContent = '保存しました';
    $('result-detail').textContent = `${record.at.slice(0, 16).replace('T', ' ')} の記録を送りました。`;
  } else {
    $('result-title').textContent = '保存待ちです';
    $('result-detail').textContent = `${REASON[r.reason] || ''}（未送信 ${r.left} 件）`;
  }
  show('result');
}

function reset() {
  state.valence = 0; state.labels = new Set(); state.influence = null; state.showAll = false;
  $('valence').value = 0;
  applyValence();
  show('step1');
}

/* ---------- 設定 ---------- */
function renderSettings() {
  $('dest').textContent = `${OWNER}/${REPO}（非公開）の ${DIR}/`;
  $('token-state').textContent = getToken() ? 'トークン：設定済み（中身は表示しません）' : 'トークン：未設定';
  const n = getPending().length;
  $('pending-state').textContent = n ? `未送信：${n} 件` : '未送信：なし';
}

/* ---------- 起動 ---------- */
function init() {
  $('valence').addEventListener('input', (e) => { state.valence = Number(e.target.value); applyValence(); });
  $('next1').addEventListener('click', () => { state.labels = new Set(); state.showAll = false; renderLabels(); show('step2'); });
  $('more').addEventListener('click', () => { state.showAll = true; renderLabels(); });
  $('next2').addEventListener('click', () => { renderInfluences(); show('step3'); });
  $('done').addEventListener('click', finish);
  $('again').addEventListener('click', reset);
  $('back').addEventListener('click', () => {
    if (state.cur === 'step3') show('step2');
    else if (state.cur === 'step2') show('step1');
    else show(state.prev);
  });
  $('gear').addEventListener('click', () => { if (state.cur !== 'settings') state.prev = state.cur; renderSettings(); show('settings'); });
  $('close-settings').addEventListener('click', () => show(state.prev === 'settings' ? 'step1' : state.prev));
  $('save-token').addEventListener('click', async () => {
    const v = $('token').value.trim();
    if (v) { store.set('mood.token', v); $('token').value = ''; }
    renderSettings();
    await flush(); renderSettings();
  });
  $('clear-token').addEventListener('click', () => { store.del('mood.token'); renderSettings(); });
  $('flush').addEventListener('click', async () => { $('pending-state').textContent = '送っています…'; await flush(); renderSettings(); });
  window.addEventListener('online', () => { flush(); });
  applyValence();
  show('step1');
  if (getPending().length) flush();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
