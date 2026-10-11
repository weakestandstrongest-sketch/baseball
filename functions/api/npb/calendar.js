import { npbCalendar } from '../../../lib/npb/index.js';
import { json, errorJSON, jstToday } from '../../../lib/http.js';

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const month = q.get('month') || jstToday().slice(0, 7);
  try {
    return json(await npbCalendar(q.get('team') || '', month), { maxAge: 60 });
  } catch (e) {
    return errorJSON(e, /invalid/.test(e.message) ? 400 : 502);
  }
}
