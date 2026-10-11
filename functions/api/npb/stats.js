import { npbLeaders, npbStatsList } from '../../../lib/npb/stats.js';
import { json, errorJSON } from '../../../lib/http.js';
import { KEYS } from '../../../lib/npb/index.js';

// GET /api/npb/stats            … リーダーボード (セ・パ・交流戦・オープン戦)
// GET /api/npb/stats?list=<url> … 「◯◯成績一覧」の詳しい表
export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const list = q.get('list');
  const lg = q.get('lg');
  try {
    return json(list ? await npbStatsList(list) : await npbLeaders(KEYS.includes(lg) ? lg : null), { maxAge: 600 });
  } catch (e) {
    return errorJSON(e, /invalid/.test(e.message) ? 400 : 502);
  }
}
