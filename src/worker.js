// Cloudflare Workers の入口。
// 画面 (public/) は静的アセットとして配信し、/api/* は functions/ のハンドラーに渡す。
import * as npbSchedule from '../functions/api/npb/schedule.js';
import * as npbGame from '../functions/api/npb/game.js';
import * as npbStandings from '../functions/api/npb/standings.js';
import * as npbCalendar from '../functions/api/npb/calendar.js';
import * as npbStats from '../functions/api/npb/stats.js';
import * as npbDebug from '../functions/api/npb/debug.js';
import * as mlbSchedule from '../functions/api/mlb/schedule.js';
import * as mlbGame from '../functions/api/mlb/game.js';
import * as mlbStandings from '../functions/api/mlb/standings.js';
import * as mlbCalendar from '../functions/api/mlb/calendar.js';
import * as mlbStats from '../functions/api/mlb/stats.js';

const ROUTES = {
  '/api/npb/schedule': npbSchedule,
  '/api/npb/game': npbGame,
  '/api/npb/standings': npbStandings,
  '/api/npb/calendar': npbCalendar,
  '/api/npb/stats': npbStats,
  '/api/npb/debug': npbDebug,
  '/api/mlb/schedule': mlbSchedule,
  '/api/mlb/game': mlbGame,
  '/api/mlb/standings': mlbStandings,
  '/api/mlb/calendar': mlbCalendar,
  '/api/mlb/stats': mlbStats,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const mod = ROUTES[url.pathname.replace(/\/$/, '')];
    if (!mod) {
      if (url.pathname.startsWith('/api/')) return new Response('{"error":"not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });

    // 同じ API への連続アクセスは、解析し直さずにキャッシュから返す (無料枠の CPU 時間を節約)
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const key = new Request(url.toString(), { method: 'GET' });
    if (cache && url.pathname !== '/api/npb/debug') {
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    const res = await mod.onRequestGet({ request, env, ctx });
    if (cache && res.ok && /max-age=[1-9]/.test(res.headers.get('Cache-Control') || '')) {
      ctx.waitUntil(cache.put(key, res.clone()));
    }
    return res;
  },
};
