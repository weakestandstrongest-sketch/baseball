import { npbSchedule } from '../../../lib/npb/index.js';
import { json, errorJSON, parseDate } from '../../../lib/http.js';

export async function onRequestGet({ request }) {
  const date = parseDate(new URL(request.url).searchParams.get('date'));
  try {
    const res = await npbSchedule(date);
    return json({ date, ...res }, { maxAge: 10 });
  } catch (e) {
    return errorJSON(e);
  }
}
