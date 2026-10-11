import { npbLeaders, npbStatsList } from '../../../lib/npb/stats.js';
import { json, errorJSON } from '../../../lib/http.js';

// GET /api/npb/stats            … リーダーボード (セ・パ・交流戦・オープン戦)
// GET /api/npb/stats?list=<url> … 「◯◯成績一覧」の詳しい表
export async function onRequestGet({ request }) {
  const list = new URL(request.url).searchParams.get('list');
  try {
    return json(list ? await npbStatsList(list) : await npbLeaders(), { maxAge: 600 });
  } catch (e) {
    return errorJSON(e, /invalid/.test(e.message) ? 400 : 502);
  }
}
