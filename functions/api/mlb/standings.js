import { mlbStandings } from '../../../lib/mlb.js';
import { json, errorJSON, jstToday } from '../../../lib/http.js';

export async function onRequestGet({ request }) {
  const season = new URL(request.url).searchParams.get('season') || jstToday().slice(0, 4);
  try {
    return json(await mlbStandings(season), { maxAge: 300 });
  } catch (e) {
    return errorJSON(e);
  }
}
