// 取得・レスポンス用の共通処理

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export class FetchError extends Error {
  constructor(url, status, message) {
    super(message || `HTTP ${status} ${url}`);
    this.url = url;
    this.status = status;
  }
}

/**
 * HTML/JSON を取得する。Cloudflare 上ではエッジキャッシュ (cf.cacheTtl) を使い、
 * 同じページへのアクセスが集中しても取得元に負荷をかけない。
 */
export async function fetchRaw(url, { ttl = 15, timeout = 10000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8', ...headers },
      signal: ctrl.signal,
      cf: { cacheTtl: ttl, cacheEverything: true },
    });
    if (!res.ok) throw new FetchError(url, res.status);
    return res;
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw new FetchError(url, 0, `${e.name === 'AbortError' ? 'timeout' : e.message} ${url}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, opts) {
  const res = await fetchRaw(url, opts);
  const buf = await res.arrayBuffer();
  const ct = res.headers.get('content-type') || '';
  let charset = (/charset=([\w-]+)/i.exec(ct) || [])[1];
  if (!charset) {
    const head = new TextDecoder('utf-8').decode(buf.slice(0, 2048));
    charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  charset = (charset || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

export async function fetchJSON(url, opts) {
  const res = await fetchRaw(url, { ...opts, headers: { Accept: 'application/json', ...(opts?.headers || {}) } });
  return res.json();
}

export function json(data, { maxAge = 10, status = 200 } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function errorJSON(e, status = 502) {
  return json({ error: String(e && e.message ? e.message : e) }, { maxAge: 0, status });
}

/** YYYY-MM-DD を検証して返す。未指定なら日本時間の今日。 */
export function parseDate(s) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return jstToday();
}

export function jstToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO 時刻 → 日本時間の { date: 'YYYY-MM-DD', time: 'HH:MM' } */
export function toJST(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}
