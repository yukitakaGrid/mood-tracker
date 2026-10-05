'use strict';
/* ムードトラッカー：iPhone の「心の状態」と同じ3ステップ。記録は GitHub の API で OWNER/REPO の DIR/ に1回1ファイルで置く。 */
const OWNER = 'yukitakaGrid';
const REPO = 'shima-inbox';
const DIR = 'mood';
const VIA = 'mood-app';

const WORDS = {
  neutral: ['充足', '冷静', '穏やか', '無関心', '疲弊'],
  pleasant: ['驚嘆', '興奮', '驚き', '情熱', '幸せ', '楽しい', '勇敢', '誇り', '自信', '希望', '愉快', '満足', '安心', '感謝', '充足', '冷静', '穏やか'],
  unpleasant: ['怒り', '不安', '恐怖', '重圧', '恥ずかしい', 'うんざり', '困惑', '不満', '憤慨', '嫉妬', 'ストレス', '心配', '罪悪感', '驚き', '絶望', 'いら立ち', '孤独', '消沈', '落胆', '疲弊', '悲しい'],
};
/* 覚醒度（高ぶり／落ち着き）の語。快・不快をまたいで並べる（ラッセルの感情円環モデル） */
const AROUSAL_WORDS = {
  high: ['興奮', 'ワクワク', '熱中', '集中', '緊張', '焦り', '苛立ち', '落ち着かない'],
  low: ['穏やか', 'くつろぎ', '静か', 'ぼんやり', '眠い', 'だるい', '無気力', '疲れ'],
};
/* 興奮・落ち着きに影響するもの：覚醒度は体の状態に引っ張られやすいので、体・環境の項目に薬を足す */
const AROUSAL_INFLUENCES = ['睡眠', 'カフェイン', '食事', '運動', '音', '光', '人混み', '気圧・天気', '締切', '画面を見ていた時間', '薬'];
/* 快・不快に影響するもの（iPhone の「心の状態」と同じ） */
const INFLUENCES = [
  ['健康', 'フィットネス', 'セルフケア', '趣味', 'アイデンティティ', 'スピリチュアル'],
  ['コミュニティ', '家族', '友達', 'パートナー', '交際'],
  ['タスク', '仕事', '教育', '旅行', '天気', '現在の出来事', 'お金'],
];

const $ = (id) => document.getElementById(id);
const state = { valence: 0, arousal: 0, labels: new Set(), influences: new Set(), arousalInfluences: new Set(), showAll: false, prev: 'step1' };

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

/* 色は快・不快（v）で決め、覚醒度（a）は「動き」と「密度」で見せる。色の彩度・明るさだけを少し動かす。 */
function tune(col, a) {
  const g = 0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2];
  if (a < 0) { // 落ち着き：彩度を落として、霧がかかったように暗めにする
    const c = -a;
    const fog = [150, 156, 162];
    const m = mix(col.slice(0, 3), fog, 0.5 * c).map((x) => x * (1 - 0.14 * c));
    return [m[0], m[1], m[2], col[3] * (1 - 0.1 * c)];
  }
  // 高ぶり：彩度とコントラストを上げる
  const m = col.slice(0, 3).map((x) => Math.max(0, Math.min(255, x + (x - g) * 0.55 * a)));
  return [m[0], m[1], m[2], col[3]];
}

function orbMarkup(v, a) {
  const p = palette(v);
  const t = Math.min(1, Math.abs(v) * 1.2);
  const c = Math.max(0, -a), h = Math.max(0, a);
  const n = Math.round(5 - 2 * c + 8 * h);            // 輪の数：落ち着き＝少ない／高ぶり＝多い
  const k = v >= 0 ? 1 / (1 + 0.2 * t) : 1;          // 花の先が枠からはみ出さないように縮める
  const R0 = 96 * k, R1 = (26 + 6 * c) * k;           // 外側と内側の半径（輪が少ないほど間隔が広がる）
  const dPh = h > 0 ? 0.16 : 0.28;
  const alphaK = Math.min(1, 6.5 / n);
  const stroke = h > 0 ? `rgba(255,255,255,${(0.8 + 0.15 * h).toFixed(2)})` : `rgba(255,255,255,${(0.75 - 0.3 * c).toFixed(2)})`;
  const sw = (0.9 + 0.5 * h).toFixed(2);
  let out = '';
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0;
    const base = R0 - (R0 - R1) * f;
    let col = tune(mix(p.o1, p.o2, f), a);
    if (h > 0) col = col.map((x, j) => (j < 3 ? x * (1 - 0.22 * h * f) : x)); // 内側ほど濃く
    col[3] = Math.min(1, col[3] * alphaK + (h > 0 ? 0.04 : 0));
    const ph = i * dPh;
    const pts = [];
    for (let q = 0; q < 180; q++) {
      const th = (q / 180) * Math.PI * 2;
      let r;
      if (v >= 0) r = base * (1 + t * 0.2 * Math.cos(5 * th + ph));
      else {
        const aa = t * 0.38;
        r = base * (1 - aa + aa * Math.pow(Math.abs(Math.cos(4 * th + ph)), 2.6));
      }
      pts.push(`${(r * Math.cos(th)).toFixed(1)} ${(r * Math.sin(th)).toFixed(1)}`);
    }
    out += `<path style="--i:${i}" d="M${pts.join('L')}Z" fill="${rgba(col)}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  out += '<circle r="3.2" fill="rgba(255,255,255,.9)"/>';
  let motion = 'none';
  const vars = {};
  let blur = 0;
  if (c >= 0.1) { // 呼吸：ゆっくり膨らんで縮む。縁はぼける
    motion = 'calm';
    vars['--amp'] = (0.025 + 0.05 * c).toFixed(3);
    vars['--dur'] = `${(7 - 2 * c).toFixed(2)}s`;
    blur = 2.8 * c;
  } else if (h >= 0.1) { // 震え：細かく速い。縁はくっきり
    motion = 'aroused';
    vars['--j'] = (0.3 + 1.1 * h).toFixed(2);
    vars['--s'] = (0.004 + 0.012 * h).toFixed(4);
    vars['--dur'] = `${(0.26 - 0.19 * h).toFixed(3)}s`;
  }
  return { markup: out, motion, vars, blur };
}

function arousalWord(a) {
  const x = Math.abs(a);
  if (x < 0.12) return 'どちらとも言えない';
  if (a < 0) return x > 0.78 ? '非常に落ち着いている' : x > 0.45 ? '落ち着いている' : 'やや落ち着いている';
  return x > 0.78 ? '非常に高ぶっている' : x > 0.45 ? '高ぶっている' : 'やや高ぶっている';
}
function valenceWord(v) {
  const a = Math.abs(v);
  if (a < 0.12) return 'どちらとも言えない';
  if (v < 0) return a > 0.78 ? '非常に不快' : a > 0.45 ? '不快' : 'やや不快';
  return a > 0.78 ? '非常に快適' : a > 0.45 ? '快適' : 'やや快適';
}
function zone(v) { return Math.abs(v) < 0.12 ? 'neutral' : v < 0 ? 'unpleasant' : 'pleasant'; }

function applyOrb() {
  const v = state.valence / 100, a = state.arousal / 100;
  const p = palette(v);
  const r = document.documentElement.style;
  r.setProperty('--bg1', rgb(p.bg1));
  r.setProperty('--bg2', rgb(p.bg2));
  r.setProperty('--ink', rgb(p.ink));
  r.setProperty('--accent', rgb(p.accent));
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', rgb(p.bg1));
  const o = orbMarkup(v, a);
  ['orb', 'orb2', 'orb3'].forEach((id) => {
    const el = $(id);
    el.innerHTML = o.markup;
    el.setAttribute('data-motion', o.motion);
    ['--amp', '--dur', '--j', '--s'].forEach((k) => el.style.removeProperty(k));
    Object.keys(o.vars).forEach((k) => el.style.setProperty(k, o.vars[k]));
    el.style.filter = o.blur ? `blur(${o.blur.toFixed(1)}px)` : '';
  });
  const vw = valenceWord(v), aw = arousalWord(a);
  $('valence-label').textContent = vw;
  $('arousal-label').textContent = aw;
  const both = Math.abs(a) < 0.12 ? vw : `${vw}／${aw}`;
  $('valence-label2').textContent = both;
  $('valence-label3').textContent = both;
}

/* ---------- 振動 ----------
 * 高ぶりのスライダーを動かしている間、振動の間隔が覚醒度に合わせて短くなる（落ち着き＝ゆっくり／高ぶり＝速い）。
 * Android は navigator.vibrate。iPhone の Safari には Vibration API が無いので、スイッチ部品のタップ感を使う（iOS 17.4 以降）。
 * 2026-10-05 の初版はタイマーで鳴らして、iPhone で鳴らなかった。ユーザーの操作（押す・動かす）の中で鳴らす形に変えた。 */
const Haptic = {
  enabled: true,
  last: 0,
  label: null,
  setup() {
    this.enabled = store.get('mood.haptic', '1') !== '0';
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.body.appendChild(label);
    this.label = label;
  },
  interval() { // 落ち着き(-1)=900ms → 中央≒270ms → 高ぶり(+1)=80ms
    const a = state.arousal / 100;
    return Math.round(900 * Math.pow(80 / 900, (a + 1) / 2));
  },
  tick(force) {
    if (!this.enabled && !force) return;
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(Math.max(8, Math.min(30, this.interval() / 3)));
      else if (this.label) this.label.click();
    } catch (e) { /* 何もしない */ }
  },
  start() { this.last = performance.now(); this.tick(); },           // 押した瞬間（ユーザー操作の中）
  update() {                                                          // 動かしている間（間隔は覚醒度で変わる）
    const now = performance.now();
    if (now - this.last >= this.interval()) { this.last = now; this.tick(); }
  },
  stop() { /* 動かすときだけ鳴らすので、止める処理は要らない */ },
  test() {                                                            // 設定の「振動を試す」：1回、そのあと間隔を縮めながら
    this.tick(true);
    let t = 0;
    [700, 560, 420, 300, 210, 140, 100, 80, 80, 80].forEach((gap) => { t += gap; setTimeout(() => this.tick(true), t); });
  },
};

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
  const v = state.valence / 100, a = state.arousal / 100;
  const first = WORDS[zone(v)].slice();
  const second = Math.abs(a) < 0.12 ? [] : (a > 0 ? AROUSAL_WORDS.high : AROUSAL_WORDS.low).filter((w) => !first.includes(w));
  const groups = [first, second];
  if (state.showAll) {
    const seen = new Set(first.concat(second));
    const rest = [];
    [].concat(WORDS.pleasant, WORDS.neutral, WORDS.unpleasant, AROUSAL_WORDS.high, AROUSAL_WORDS.low).forEach((w) => {
      if (!seen.has(w)) { seen.add(w); rest.push(w); }
    });
    groups.push(rest);
  }
  groups.forEach((words, gi) => {
    if (!words.length) return;
    if (gi > 0 && box.children.length) { const br = document.createElement('div'); br.className = 'break'; box.appendChild(br); }
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
  });
  $('more').hidden = state.showAll;
}

function renderChipGroups(box, groups, set) {
  box.innerHTML = '';
  groups.forEach((g) => {
    const row = document.createElement('div');
    row.className = 'group';
    g.forEach((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = w;
      b.setAttribute('aria-pressed', set.has(w) ? 'true' : 'false');
      b.addEventListener('click', () => {
        if (set.has(w)) set.delete(w); else set.add(w);
        b.setAttribute('aria-pressed', set.has(w) ? 'true' : 'false');
      });
      row.appendChild(b);
    });
    box.appendChild(row);
  });
}
function renderInfluences() {
  renderChipGroups($('influences'), INFLUENCES, state.influences);
  renderChipGroups($('arousal-influences'), [AROUSAL_INFLUENCES], state.arousalInfluences);
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
      body: JSON.stringify({ message: `ムードトラッカー ${fname}`, content: b64(JSON.stringify(record, null, 2) + '\n') }),
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
    arousal: Math.round(state.arousal) / 100,
    labels: Array.from(state.labels),
    influences: Array.from(state.influences),
    arousal_influences: Array.from(state.arousalInfluences),
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
  state.valence = 0; state.arousal = 0; state.labels = new Set(); state.influences = new Set(); state.arousalInfluences = new Set(); state.showAll = false;
  $('valence').value = 0;
  $('arousal').value = 0;
  applyOrb();
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
  $('valence').addEventListener('input', (e) => { state.valence = Number(e.target.value); applyOrb(); });
  const ar = $('arousal');
  ar.addEventListener('input', (e) => { state.arousal = Number(e.target.value); applyOrb(); Haptic.update(); });
  ar.addEventListener('pointerdown', () => Haptic.start());
  ['pointerup', 'pointercancel', 'blur', 'change'].forEach((ev) => ar.addEventListener(ev, () => Haptic.stop()));
  $('haptic-test').addEventListener('click', () => Haptic.test());
  $('haptic').addEventListener('change', (e) => { Haptic.enabled = e.target.checked; store.set('mood.haptic', e.target.checked ? '1' : '0'); });
  $('next1').addEventListener('click', () => { state.labels = new Set(); state.influences = new Set(); state.arousalInfluences = new Set(); state.showAll = false; renderLabels(); show('step2'); });
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
  Haptic.setup();
  $('haptic').checked = Haptic.enabled;
  applyOrb();
  show('step1');
  if (getPending().length) flush();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
