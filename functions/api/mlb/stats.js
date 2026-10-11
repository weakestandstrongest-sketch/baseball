import { mlbLeaders, mlbStatsList } from '../../../lib/mlb.js';
import { json, errorJSON, jstToday } from '../../../lib/http.js';

// GET /api/mlb/stats?lg=AL                               … リーダーボード
// GET /api/mlb/stats?lg=AL&group=hitting&sort=homeRuns   … 詳しい一覧
export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const season = q.get('season') || jstToday().slice(0, 4);
  const lg = q.get('lg') || 'AL';
  try {
    const data = q.get('group') ? await mlbStatsList(lg, q.get('group'), q.get('sort') || '', season) : await mlbLeaders(lg, season);
    return json(data, { maxAge: 600 });
  } catch (e) {
    return errorJSON(e, /invalid/.test(e.message) ? 400 : 502);
  }
}
