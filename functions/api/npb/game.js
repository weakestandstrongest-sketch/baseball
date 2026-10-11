import { npbGame } from '../../../lib/npb/index.js';
import { json, errorJSON } from '../../../lib/http.js';

export async function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  try {
    const game = await npbGame(id);
    return json(game, { maxAge: game.status === 'final' ? 120 : 5 });
  } catch (e) {
    return errorJSON(e, /invalid id/.test(e.message) ? 400 : 502);
  }
}
