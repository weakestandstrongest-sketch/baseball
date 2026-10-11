import { npbStandings, KEYS } from '../../../lib/npb/index.js';
import { json, errorJSON, jstToday } from '../../../lib/http.js';

export async function onRequestGet({ request }) {
  const lg = new URL(request.url).searchParams.get('lg');
  try {
    const year = jstToday().slice(0, 4);
    return json(await npbStandings(year, KEYS.includes(lg) ? lg : null), { maxAge: 300 });
  } catch (e) {
    return errorJSON(e);
  }
}
