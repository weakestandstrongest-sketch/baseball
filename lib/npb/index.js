// NPB データ取得の入口。Yahoo! を優先し、失敗したら npb.jp を使う。
import { parseHTML, tables } from '../html.js';
import { yahooSchedule, yahooGame, yahooStandings } from './yahoo.js';
import { npbjpSchedule, npbjpGame, npbjpStandings } from './npbjp.js';
import { teamFromText, teamInfo } from './teams.js';

export async function npbSchedule(date) {
  const errors = [];
  try {
    const games = await yahooSchedule(date);
    if (games.length) return { source: 'yahoo', games };
  } catch (e) { errors.push(String(e.message || e)); }
  try {
    const games = await npbjpSchedule(date);
    return { source: 'npb.jp', games, errors };
  } catch (e) { errors.push(String(e.message || e)); }
  if (errors.length >= 2) throw new Error(errors.join(' / '));
  return { source: 'yahoo', games: [], errors };
}

export async function npbGame(id, hint) {
  if (/^y\d+$/.test(id)) return yahooGame(id.slice(1), hint);
  if (/^n\d{8}-/.test(id)) return npbjpGame(id, hint);
  throw new Error('invalid id');
}

export async function npbStandings(year) {
  let htmls = [];
  try { htmls = [await yahooStandings()]; } catch { /* fallthrough */ }
  let res = parseStandings(htmls);
  if (!res.C || !res.P) {
    try { res = { ...parseStandings(await npbjpStandings(year)), ...stripEmpty(res) }; } catch { /* ignore */ }
  }
  return res;
}

const stripEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

export function parseStandings(htmls) {
  const out = { C: null, P: null };
  for (const html of htmls) {
    for (const { rows } of tables(parseHTML(html))) {
      const hi = rows.findIndex((r) => r.some((c) => /勝率/.test(c)) && r.some((c) => /^(勝|勝利)$/.test(c)));
      if (hi < 0) continue;
      const headers = rows[hi];
      const teamCol = headers.findIndex((c) => /チーム|球団/.test(c));
      const body = rows.slice(hi + 1).filter((r) => r.length >= headers.length - 1);
      const parsed = body.map((r) => {
        const cell = teamCol >= 0 ? r[teamCol] : r.find((c) => teamFromText(c));
        return { team: teamFromText(cell || ''), cells: r };
      }).filter((x) => x.team);
      if (parsed.length < 6) continue;
      const lg = parsed[0].team.league;
      if (out[lg] || !parsed.every((x) => x.team.league === lg)) continue;
      out[lg] = {
        headers,
        rows: parsed.map((x) => ({ team: teamInfo(x.team), cells: x.cells })),
      };
    }
  }
  return out;
}
