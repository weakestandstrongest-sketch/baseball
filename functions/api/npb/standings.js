import { npbStandings } from '../../../lib/npb/index.js';
import { json, errorJSON, jstToday } from '../../../lib/http.js';

export async function onRequestGet() {
  try {
    const year = jstToday().slice(0, 4);
    return json(await npbStandings(year), { maxAge: 300 });
  } catch (e) {
    return errorJSON(e);
  }
}
