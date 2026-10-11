// 実際のページを保存して、パーサーの調整に使う (GitHub Actions から実行)
//   node dev/capture.mjs [YYYY-MM-DD]
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../test/fixtures/real/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const date = process.argv[2] || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const manifest = { date, captured: new Date().toISOString(), files: {} };

async function save(name, url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, redirect: 'follow' });
    const body = await res.text();
    writeFileSync(new URL(name, OUT), body);
    manifest.files[name] = { url, status: res.status, finalUrl: res.url, bytes: body.length };
    console.log(res.status, name, url, body.length);
    return body;
  } catch (e) {
    manifest.files[name] = { url, error: String(e) };
    console.log('ERR', name, url, e.message);
    return '';
  }
}

const Y = 'https://baseball.yahoo.co.jp';
const sched = await save('yahoo-schedule.html', `${Y}/npb/schedule/?date=${date}`);
const ids = [...new Set([...sched.matchAll(/\/npb\/game\/(\d{6,14})/g)].map((m) => m[1]))].slice(0, 2);
for (const [i, id] of ids.entries()) {
  for (const p of ['top', 'index', 'stats', 'text', 'score']) await save(`yahoo-game${i + 1}-${p}.html`, `${Y}/npb/game/${id}/${p}`);
}
await save('yahoo-standings.html', `${Y}/npb/standings/`);
await save('yahoo-standings-detail1.html', `${Y}/npb/standings/detail/1`);
const stats = await save('yahoo-stats.html', `${Y}/npb/stats/`);
const list = [...stats.matchAll(/href="([^"]*\/npb\/stats\/[^"]+)"[^>]*>[^<]*一覧/g)].map((m) => m[1])[0];
if (list) await save('yahoo-stats-list.html', new URL(list.replace(/&amp;/g, '&'), `${Y}/npb/stats/`).toString());
const [y, m] = date.split('-');
await save('npbjp-schedule-month.html', `https://npb.jp/games/${y}/schedule_${m}_detail.html`);
await save('npbjp-cs.html', `https://npb.jp/cs/${y}/schedule_detail.html`);
writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2));
