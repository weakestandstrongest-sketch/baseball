// 実際のスポーツナビ / NPB.jp のページ (2026/10/11 に保存) を使ったテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYahooSchedule } from '../lib/npb/yahoo.js';
import { buildGame } from '../lib/npb/build.js';
import { slimYahoo } from '../lib/npb/yahooGame.js';
import { parseStandingsPage } from '../lib/npb/index.js';
import { parseLeaderPage, parseStatsList } from '../lib/npb/stats.js';
import { parseNpbjpGames } from '../lib/npb/npbjp.js';

const R = (f) => readFileSync(new URL('./fixtures/real/' + f, import.meta.url), 'utf8');

test('実ページ: 日程 (CS の 2 試合)', () => {
  const g = parseYahooSchedule(R('yahoo-schedule.html'), '2026-10-11');
  assert.equal(g.length, 2);
  assert.equal(g[0].home.code, 'g');
  assert.equal(g[0].away.code, 'db');
  assert.deepEqual([g[0].home.score, g[0].away.score], [1, 4]);
  assert.equal(g[0].status, 'final');
  assert.equal(g[0].leagueGroup, 'CS');
  assert.equal(g[0].series, 'CSセ・ファーストステージ');
  assert.equal(g[0].venue, '東京ドーム');
  assert.deepEqual(g[0].notes, ['勝 石田裕', '敗 竹丸', 'S レイノルズ']);
});

const game = (parts = ['top', 'box', 'text']) => buildGame({
  id: 'y2021039475', source: 'yahoo', url: '',
  pages: Object.fromEntries(parts.map((k) => [k, slimYahoo(k, R({ top: 'yahoo-game1-top.html', box: 'yahoo-game1-stats.html', text: 'yahoo-game1-text.html' }[k]))])),
});

test('実ページ: 試合 (チーム・スコア・状況・スコアボード)', () => {
  const g = game();
  assert.equal(g.away.code, 'db');
  assert.equal(g.home.code, 'g');
  assert.deepEqual([g.away.score, g.away.hits, g.away.errors], [4, 9, 0]);
  assert.deepEqual([g.home.score, g.home.hits, g.home.errors], [1, 5, 0]);
  assert.equal(g.status, 'final');
  assert.equal(g.series, 'CSセ・ファーストステージ 2回戦');
  assert.equal(g.date, '2026-10-11');
  assert.equal(g.startTime, '14:00');
  assert.equal(g.venue, '東京ドーム');
  assert.deepEqual(g.linescore.innings.map((i) => i.away).join(''), '200000110');
  assert.deepEqual(g.linescore.innings.map((i) => i.home).join(''), '000100000');
});

test('実ページ: 責任投手・本塁打・戦評・スコアプレー・バッテリー・スタメン・試合情報', () => {
  const g = game(['top']);
  assert.deepEqual(g.decisions.win, { name: '石田裕', record: '1勝0敗0S', team: 'db' });
  assert.equal(g.decisions.loss.name, '竹丸');
  assert.equal(g.decisions.save.name, 'レイノルズ');
  assert.deepEqual(g.homeRuns.map((h) => [h.side, h.name, h.number, h.detail]), [
    ['away', '度会', 2, '1回表ソロ'], ['away', '牧', 2, '8回表ソロ'], ['home', 'ダルベック', 1, '4回裏ソロ'],
  ]);
  assert.match(g.summary, /^DeNAがファイナルステージ進出を決めた/);
  assert.equal(g.scoringPlays.length, 5);
  assert.equal(g.scoringPlays[3].text, 'ランナー三塁の2-2からレフトへのタイムリーヒット 巨 1-3 デ 一塁');
  assert.ok(g.scoringPlays.every((p) => !/GIANTS TV|投手交代/.test(p.text)));
  assert.equal(g.batteries[0].side, 'away');
  assert.equal(g.lineups.home.length, 10);
  assert.deepEqual(g.lineups.away[1], { order: '1', pos: '左', name: '度会 隆輝', cond: '普通' });
  assert.ok(g.info.some(([k, v]) => k === '観客数' && v === '42,248人'));
  assert.ok(g.highlights.some((h) => /エキサイティング/.test(h.title)));
});

test('実ページ: 成績 (打者・投手、チーム別)', () => {
  const g = game(['top', 'box']);
  assert.equal(g.box.away.batting[0].rows[0][1], '度会 隆輝');
  assert.equal(g.box.home.batting[0].rows[0][1], '吉川 尚輝');
  assert.deepEqual(g.box.away.pitching[0].headers, ['', '選手名', '回', '球', '安', '振', '四', '死', '失']);
  assert.deepEqual(g.box.away.pitching[0].rows[0].slice(0, 2), ['勝', '石田 裕太郎']);
  assert.equal(g.box.home.pitching[0].rows[0][1], '竹丸 和幸');
});

test('実ページ: 経過 (AI 解説や宣伝を含まない)', () => {
  const g = game(['top', 'text']);
  assert.equal(g.plays[0].label, '試合前情報');
  assert.equal(g.plays[1].label, '1回表 DeNAの攻撃');
  const ab = g.plays[1].atBats[0];
  assert.deepEqual([ab.order, ab.batter, ab.situation], [1, '度会 隆輝', '無死走者なし']);
  assert.ok(ab.scoring);
  const all = JSON.stringify(g.plays);
  assert.ok(!/スポナビ|アプリ|YouTube|ベースボールLIVE/.test(all));
});

test('実ページ: 順位表 (左右に分かれた表をつなぐ)・対戦成績', () => {
  const [main, mx] = parseStandingsPage(R('yahoo-standings-detail1.html'));
  assert.equal(main.kind, 'standings');
  assert.deepEqual(main.headers.slice(0, 7), ['順位', 'チーム名', '試合', '勝利', '敗戦', '引分', '勝率']);
  assert.ok(main.headers.includes('防御率'));
  assert.equal(main.rows[0].team.code, 't');
  assert.equal(main.rows[0].cells[6], '.560');
  assert.equal(mx.kind, 'matrix');
  assert.equal(mx.rows[0].cells[2], '16 - 8 (1)');
});

test('実ページ: 個人成績のリーダーと一覧', () => {
  const b = parseLeaderPage(R('yahoo-stats.html'));
  const avg = b.find((x) => x.title === '打率' && x.rows[0].team.league === 'C');
  assert.equal(avg.rows[0].name, '佐藤');
  assert.equal(avg.group, 'batting');
  assert.ok(b.some((x) => x.group === 'pitching' && x.title === '防御率'));
  const list = parseStatsList(R('yahoo-stats-list.html'));
  assert.deepEqual(list.headers, ['順位', '選手名', 'チーム名', '打率']);
  assert.ok(list.rows.length >= 15);
});

test('実ページ: npb.jp の月間日程', () => {
  const g = parseNpbjpGames(R('npbjp-schedule-month.html'), (y, md) => y === '2026' && md.startsWith('10'));
  const first = g.find((x) => x.date === '2026-10-01' && x.home.code === 't');
  assert.equal(first.away.code, 'g');
  assert.equal(first.status, 'final');
  assert.deepEqual([first.home.score, first.away.score], [2, 2]);
});

// 試合中のページ (2026/10/15 に保存。live/ は Actions が上書きするので live-1015/ に固定)。文字速報は新しい順に並び、/score も文字速報になる
const liveGame = (n) => buildGame({
  id: 'live' + n, source: 'yahoo', url: '',
  pages: Object.fromEntries(['top', 'text', 'score'].map((k) => [k === 'score' ? 'live' : k, slimYahoo(k === 'score' ? 'live' : k, R(`live-1015/live${n}-${k}.html`))])),
});

test('実ページ: 試合中の速報 (打席の順番・投手)', () => {
  const g = liveGame(1);
  assert.equal(g.status, 'live');
  const halves = g.plays.filter((h) => h.half !== 'pre');
  assert.deepEqual([halves[0].inning, halves[0].half], [1, 'top']);
  assert.deepEqual([halves.at(-1).inning, halves.at(-1).half], [7, 'top']);
  assert.equal(halves[0].atBats[0].batter, '度会 隆輝');
  const abs = halves.flatMap((h) => h.atBats);
  assert.equal(abs.at(-1).batter, '蝦名 達夫');
  // 先発と投手交代
  assert.equal(abs[0].pitcher, '髙橋 遥人');
  assert.equal(halves[1].atBats[0].pitcher, '尾形 崇斗');
  const b5 = halves.find((h) => h.inning === 5 && h.half === 'bottom');
  assert.equal(b5.atBats[0].pitcher, '吉野');
  const b6 = halves.find((h) => h.inning === 6 && h.half === 'bottom');
  assert.equal(b6.atBats[0].pitcher, 'ルイーズ');
  assert.equal(g.current.batter.name, '蝦名 達夫');
  assert.equal(g.current.pitcher.name, '髙橋 遥人');
  assert.ok(g.current.lastPlay.includes('蝦名'));
  // 試合前の情報は先頭のまま、元の順番で
  assert.match(g.plays[0].events[0].text, /^先発ピッチャー/);

  const g2 = liveGame(2);
  assert.equal(g2.current.batter.name, '近藤 健介');
  assert.equal(g2.current.pitcher.name, '北山 亘基');
});

test('実ページ: 試合後の文字速報は古い順のまま', () => {
  const g = game();
  const halves = g.plays.filter((h) => h.half !== 'pre');
  assert.deepEqual([halves[0].inning, halves[0].half], [1, 'top']);
  assert.ok(halves[0].atBats[0].pitcher);
});

test('実ページ: 試合中は文字速報から走者・アウト・守備位置を出す', () => {
  const g = liveGame(1);
  // 7回表は阪神が守備。先発オーダー + 「守備交代:レフト 前川 守備変更: 髙寺 レフト→ライト」
  assert.equal(g.current.defense.left, '前川');
  assert.equal(g.current.defense.right, '髙寺');
  assert.equal(g.current.defense.catcher, '伏見 寅威');
  assert.equal(g.current.defense.pitcher, g.current.pitcher.name);
});

test('打席の状況「一死一二塁」と結果「ショートゴロ 2アウト二塁」から走者とアウト', async () => {
  const { inferStateFromPlays } = await import('../lib/npb/common.js');
  const P = (situation, evs) => [{ inning: 9, half: 'bottom', events: [], atBats: [{ batter: 'X', situation, events: evs.map((text) => ({ text })) }] }];
  assert.deepEqual(inferStateFromPlays(P('二死二塁', [])).runners, { second: true });
  assert.equal(inferStateFromPlays(P('二死二塁', [])).outs, 2);
  const s = inferStateFromPlays(P('一死一二塁', ['ショートゴロ 2アウト二塁']));
  assert.deepEqual([s.outs, s.runners], [2, { second: true }]);
  assert.deepEqual(inferStateFromPlays(P('無死満塁', [])).runners, { first: true, second: true, third: true });
  assert.deepEqual(inferStateFromPlays(P('二死一三塁', ['セカンドゴロ 3アウト'])).runners, {});
});

test('実ページ: 走者の名前を経過から追いかける', async () => {
  const { trackRunners } = await import('../lib/npb/common.js');
  const g = liveGame(1);
  const h5 = g.plays.find((h) => h.inning === 5 && h.half === 'top');
  // 宮﨑ヒット → 松尾 → 成瀬 送りバント失敗 → 蝦名ヒットで満塁
  const upTo = (name) => ({ ...h5, atBats: h5.atBats.slice(0, h5.atBats.findIndex((ab) => ab.batter === name) + 1) });
  assert.deepEqual(trackRunners(upTo('蝦名 達夫')), { 1: '蝦名 達夫', 2: '成瀬 脩人', 3: '宮﨑' });
  // 代走
  const pr = { atBats: [{ batter: 'A', situation: '無死走者なし', events: [{ text: '四球を選ぶ 一塁', result: true }] },
    { batter: 'B', situation: '無死一塁', events: [{ text: '一塁走者 A →代走: C' }] }] };
  assert.deepEqual(trackRunners(pr), { 1: 'C' });
});
