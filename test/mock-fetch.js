// fetch を差し替えて、外部サイトの代わりに test/fixtures を返す
import { readFileSync } from 'node:fs';
import * as mlb from './fixtures/mlb.js';

const fx = (p) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');

function finalFeed(pk) {
  const f = structuredClone(mlb.feed);
  f.gameData.game.pk = pk;
  f.gameData.status = { abstractGameState: 'Final', codedGameState: 'F', detailedState: 'Final' };
  f.liveData.plays.allPlays = f.liveData.plays.allPlays.filter((p) => p.about.isComplete);
  f.liveData.decisions = { winner: { id: 808967, fullName: 'Yoshinobu Yamamoto' }, loser: { id: 554430, fullName: 'Zack Wheeler' } };
  return f;
}

const ROUTES = [
  [/statsapi\.mlb\.com\/api\/v1\/schedule/, () => mlb.schedule],
  [/statsapi\.mlb\.com\/api\/v1\.1\/game\/813001\/feed\/live/, () => mlb.feed],
  [/statsapi\.mlb\.com\/api\/v1\.1\/game\/(\d+)\/feed\/live/, (m) => finalFeed(Number(m[1]))],
  [/statsapi\.mlb\.com\/api\/v1\/standings.*wildCard/, () => mlb.wildcard],
  [/statsapi\.mlb\.com\/api\/v1\/standings/, () => mlb.standings],
  [/baseball\.yahoo\.co\.jp\/npb\/schedule/, () => fx('yahoo/schedule.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/standings\/1\//, () => fx('yahoo/standings-c.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/standings\/2\//, () => fx('yahoo/standings-p.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/standings\/interleague/, () => fx('yahoo/standings-il.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/standings\/open/, () => fx('yahoo/standings-op.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/game\/2021029839\/top/, () => fx('yahoo/top-final.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/game\/\d+\/top/, () => fx('yahoo/top-live.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/game\/\d+\/stats/, () => fx('yahoo/stats.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/game\/\d+\/text/, () => fx('yahoo/text.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/game\/\d+\/score/, () => fx('yahoo/score-live.html')],
  [/baseball\.yahoo\.co\.jp\/npb\/standings/, () => fx('yahoo/standings.html')],
  [/npb\.jp\/games\/\d+\/schedule_10_detail/, () => fx('npbjp/schedule-10.html')],
  [/npb\.jp\/games\/\d+\/schedule_\d+_detail/, () => fx('npbjp/schedule.html')],
  [/npb\.jp\/cs\/\d+\/schedule_detail/, () => fx('npbjp/cs.html')],
];

export function installMockFetch() {
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    for (const [re, fn] of ROUTES) {
      const m = re.exec(url);
      if (!m) continue;
      const body = fn(m);
      const isText = typeof body === 'string';
      return new Response(isText ? body : JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': isText ? 'text/html; charset=UTF-8' : 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };
}
