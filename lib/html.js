// 依存ライブラリなしの小さな HTML パーサー。
// スクレイピング対象サイトのマークアップ変更に強くするため、
// クラス名ではなく「テキスト」と「表の見出し」で情報を探す前提のユーティリティを提供する。

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'noscript']);
// 開始タグが来たら自動で閉じる要素 (HTML の省略可能な終了タグ)
const AUTO_CLOSE = {
  td: ['td', 'th'],
  th: ['td', 'th'],
  tr: ['tr', 'td', 'th'],
  thead: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'],
  tbody: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'],
  tfoot: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'],
  li: ['li'],
  dt: ['dt', 'dd'],
  dd: ['dt', 'dd'],
  option: ['option'],
  p: ['p'],
};
// 自動クローズを探すときに越えない境界
const SCOPE_STOP = new Set(['table', 'ul', 'ol', 'dl', 'select', 'div', 'section', 'body', 'html']);
const AUTO_CLOSE_SCOPE = {
  td: ['tr', 'table'], th: ['tr', 'table'],
  tr: ['tbody', 'thead', 'tfoot', 'table'],
  thead: ['table'], tbody: ['table'], tfoot: ['table'],
  li: ['ul', 'ol'], dt: ['dl'], dd: ['dl'], option: ['select'],
};

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'caption', 'dd', 'div', 'dl', 'dt',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'thead',
  'tfoot', 'tr', 'ul', 'h', 'option',
]);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®',
  times: '×', middot: '・', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»',
  yen: '¥', bull: '•', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
};

export function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[name] = decodeEntities(val);
  }
  return attrs;
}

class Node {
  constructor(tag, attrs, parent) {
    this.tag = tag;
    this.attrs = attrs || {};
    this.children = [];
    this.parent = parent || null;
  }
  get id() { return this.attrs.id || ''; }
  get className() { return this.attrs.class || ''; }
  hasClass(c) { return (' ' + this.className + ' ').includes(' ' + c + ' '); }
  classMatches(re) { return re.test(this.className); }
}

export function parseHTML(html) {
  const root = new Node('#root', {}, null);
  const stack = [root];
  const cur = () => stack[stack.length - 1];
  const len = html.length;
  let i = 0;

  const pushText = (t) => {
    if (!t) return;
    cur().children.push({ text: decodeEntities(t), parent: cur() });
  };

  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { pushText(html.slice(i)); break; }
    if (lt > i) pushText(html.slice(i, lt));
    i = lt;

    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? len : end + 3;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') {
      const end = html.indexOf('>', i);
      i = end < 0 ? len : end + 1;
      continue;
    }
    if (html[i + 1] === '/') {
      const end = html.indexOf('>', i);
      const name = html.slice(i + 2, end < 0 ? len : end).trim().toLowerCase();
      i = end < 0 ? len : end + 1;
      // 対応する開始タグまで閉じる (なければ無視)
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === name) { stack.length = k; break; }
      }
      continue;
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(i, i + 64));
    if (!m) { pushText('<'); i++; continue; }
    const name = m[1].toLowerCase();
    // タグの終わりを探す (属性値内の > を考慮)
    let j = i + m[0].length;
    let quote = null;
    for (; j < len; j++) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    const rawAttrs = html.slice(i + m[0].length, j);
    i = j + 1;
    const selfClosing = rawAttrs.trimEnd().endsWith('/');

    const closes = AUTO_CLOSE[name];
    if (closes) {
      for (let k = stack.length - 1; k > 0; k--) {
        const t = stack[k].tag;
        if (closes.includes(t)) { stack.length = k; break; }
        if ((AUTO_CLOSE_SCOPE[name] || []).includes(t) || SCOPE_STOP.has(t)) break;
      }
    }

    const node = new Node(name, parseAttrs(rawAttrs), cur());
    cur().children.push(node);
    if (VOID.has(name) || selfClosing) continue;
    if (RAW_TEXT.has(name)) {
      const endRe = new RegExp('</' + name + '\\s*>', 'ig');
      endRe.lastIndex = i;
      const em = endRe.exec(html);
      const end = em ? em.index : len;
      node.children.push({ text: html.slice(i, end), parent: node, raw: true });
      i = em ? em.index + em[0].length : len;
      continue;
    }
    stack.push(node);
  }
  return root;
}

// ---- 走査ユーティリティ ----

export function walk(node, fn) {
  if (!node.children) return;
  for (const c of node.children) {
    if (fn(c) === false) continue;
    if (c.children) walk(c, fn);
  }
}

export function findAll(node, pred) {
  const out = [];
  walk(node, (n) => { if (n.tag && pred(n)) out.push(n); });
  return out;
}

export function find(node, pred) {
  let found = null;
  const rec = (n) => {
    if (!n.children) return;
    for (const c of n.children) {
      if (found) return;
      if (c.tag && pred(c)) { found = c; return; }
      rec(c);
    }
  };
  rec(node);
  return found;
}

export const byTag = (tag) => (n) => n.tag === tag;
export const byId = (id) => (n) => n.attrs.id === id;
export const byIdRe = (re) => (n) => !!n.attrs.id && re.test(n.attrs.id);
export const byClassRe = (re) => (n) => !!n.attrs.class && re.test(n.attrs.class);

export function closest(node, pred) {
  let n = node.parent;
  while (n) { if (n.tag && pred(n)) return n; n = n.parent; }
  return null;
}

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe']);

/** 正規化済みテキスト (全角英数→半角、連続空白→1つ) */
export function norm(s) {
  return (s || '').normalize('NFKC').replace(/[\s　]+/g, ' ').trim();
}

export function text(node) {
  if (!node) return '';
  if (node.text !== undefined) return node.raw ? '' : node.text;
  let s = '';
  const rec = (n) => {
    for (const c of n.children) {
      if (c.text !== undefined) { if (!c.raw) s += c.text; }
      else if (!SKIP.has(c.tag)) {
        if (c.tag === 'br') s += ' ';
        else if (c.tag === 'img' && c.attrs.alt) s += c.attrs.alt;
        else { rec(c); if (c.tag === 'td' || c.tag === 'th' || BLOCK.has(c.tag)) s += ' '; }
      }
    }
  };
  rec(node);
  return norm(s);
}

/** ブロック要素の境界で区切ったテキスト行の配列 */
export function lines(node, { skipTags = ['nav', 'aside', 'form'] } = {}) {
  const out = [];
  let buf = '';
  const flush = () => { const t = norm(buf); if (t) out.push(t); buf = ''; };
  const skip = new Set([...SKIP, ...skipTags]);
  const rec = (n) => {
    for (const c of n.children) {
      if (c.text !== undefined) { if (!c.raw) buf += c.text; continue; }
      if (skip.has(c.tag)) continue;
      if (c.tag === 'img' && c.attrs.alt) { buf += c.attrs.alt; continue; }
      const block = BLOCK.has(c.tag);
      if (block) flush();
      const before = buf.length;
      rec(c);
      if (c.tag === 'td' || c.tag === 'th') buf += ' ';
      // <span>4</span>見逃し三振 のような「数字だけの要素」は後ろに区切りを入れる
      else if (!block && /^\s*\d+\s*$/.test(buf.slice(before))) buf += ' ';
      if (block) flush();
    }
  };
  rec(node);
  flush();
  return out;
}

/** <table> を [[セル文字列]] に変換 (rowspan/colspan は横方向のみ展開) */
export function tableRows(table) {
  const rows = [];
  for (const tr of findAll(table, byTag('tr'))) {
    // 入れ子のテーブルの行は除外
    if (closest(tr, byTag('table')) !== table) continue;
    const cells = [];
    for (const c of tr.children) {
      if (c.tag !== 'td' && c.tag !== 'th') continue;
      const t = text(c);
      const span = Math.min(parseInt(c.attrs.colspan || '1', 10) || 1, 20);
      cells.push(t);
      for (let k = 1; k < span; k++) cells.push('');
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** ページ内の全テーブル (入れ子の外側を含む) */
export function tables(root) {
  return findAll(root, byTag('table')).map((node) => ({ node, rows: tableRows(node) }));
}

/** テーブルの直前にある見出しっぽいテキスト (チーム名の判定などに使う) */
export function precedingText(node, maxChars = 200) {
  let s = '';
  let n = node;
  while (n && n.parent && s.length < maxChars) {
    const siblings = n.parent.children;
    const idx = siblings.indexOf(n);
    for (let k = idx - 1; k >= 0 && s.length < maxChars; k--) {
      const sib = siblings[k];
      // 別の表まで来たら、そこから先は別の見出しの範囲
      if (sib.tag === 'table' || (sib.children && find(sib, byTag('table')))) return norm(s);
      const t = text(sib);
      if (t) s = t + ' ' + s;
    }
    n = n.parent;
  }
  return norm(s);
}

export function links(root) {
  return findAll(root, (n) => n.tag === 'a' && n.attrs.href).map((a) => ({ node: a, href: a.attrs.href, text: text(a) }));
}

const HEADING = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** 要素の直前にある見出し (h1〜h6) のテキスト */
export function precedingHeading(node, maxSteps = 40) {
  let n = node;
  let steps = 0;
  while (n && n.parent && steps < maxSteps) {
    const siblings = n.parent.children;
    for (let k = siblings.indexOf(n) - 1; k >= 0 && steps < maxSteps; k--, steps++) {
      const sib = siblings[k];
      if (!sib.tag) continue;
      if (HEADING.has(sib.tag)) return text(sib);
      const hs = findAll(sib, (x) => HEADING.has(x.tag));
      if (hs.length) return text(hs[hs.length - 1]);
    }
    n = n.parent;
  }
  return '';
}

/** 要素の後ろ (同じ親〜数階層上まで) にある、文字が re に一致する最初のリンク */
export function followingLink(node, re, levels = 3) {
  let n = node;
  for (let l = 0; l < levels && n && n.parent; l++) {
    const siblings = n.parent.children;
    for (let k = siblings.indexOf(n) + 1; k < siblings.length; k++) {
      const sib = siblings[k];
      if (!sib.tag) continue;
      if (sib.tag === 'table' || find(sib, byTag('table'))) return null; // 次の表の範囲に入ったら終わり
      const a = sib.tag === 'a' ? sib : find(sib, (x) => x.tag === 'a' && re.test(text(x)));
      if (a && a.attrs.href && re.test(text(a))) return { href: a.attrs.href, text: text(a) };
    }
    n = n.parent;
  }
  return null;
}
