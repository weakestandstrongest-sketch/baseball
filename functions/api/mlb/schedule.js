import { mlbSchedule } from '../../../lib/mlb.js';
import { json, errorJSON, parseDate } from '../../../lib/http.js';

export async function onRequestGet({ request }) {
  const date = parseDate(new URL(request.url).searchParams.get('date'));
  try {
    return json({ date, source: 'mlb', games: await mlbSchedule(date) }, { maxAge: 10 });
  } catch (e) {
    return errorJSON(e);
  }
}
