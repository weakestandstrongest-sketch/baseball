import { mlbGame } from '../../../lib/mlb.js';
import { json, errorJSON } from '../../../lib/http.js';

export async function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^\d+$/.test(id)) return errorJSON('invalid id', 400);
  try {
    const game = await mlbGame(id);
    return json(game, { maxAge: game.status === 'final' ? 120 : 5 });
  } catch (e) {
    return errorJSON(e);
  }
}
