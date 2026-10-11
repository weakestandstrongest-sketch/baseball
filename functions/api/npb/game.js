import { npbGame } from '../../../lib/npb/index.js';
import { json, errorJSON } from '../../../lib/http.js';

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const id = q.get('id') || '';
  // parts=box,plays … 成績・経過のページも読む (未指定なら全部)
  const parts = q.has('parts') ? q.get('parts').split(',').filter((p) => ['box', 'plays'].includes(p)) : null;
  try {
    const game = await npbGame(id, undefined, parts);
    return json(game, { maxAge: game.status === 'final' ? 120 : 5 });
  } catch (e) {
    return errorJSON(e, /invalid id/.test(e.message) ? 400 : 502);
  }
}
