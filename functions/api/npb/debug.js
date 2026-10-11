// パーサー調整用: 取得元ページを「行」と「表」に分解して返す。
// 例: /api/npb/debug?url=https://baseball.yahoo.co.jp/npb/game/2021029839/top
import { parseHTML, lines, tables, links } from '../../../lib/html.js';
import { mainContent } from '../../../lib/npb/common.js';
import { fetchText, json, errorJSON } from '../../../lib/http.js';

const ALLOWED = ['baseball.yahoo.co.jp', 'npb.jp'];

export async function onRequestGet({ request }) {
  const target = new URL(request.url).searchParams.get('url') || '';
  let u;
  try { u = new URL(target); } catch { return errorJSON('invalid url', 400); }
  if (u.protocol !== 'https:' || !ALLOWED.includes(u.hostname)) return errorJSON('host not allowed', 400);
  try {
    const root = mainContent(parseHTML(await fetchText(u.toString(), { ttl: 5 })));
    return json({
      url: u.toString(),
      lines: lines(root),
      tables: tables(root).map((t) => t.rows),
      links: links(root).map((l) => [l.text, l.href]).slice(0, 300),
    }, { maxAge: 0 });
  } catch (e) {
    return errorJSON(e);
  }
}
