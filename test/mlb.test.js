import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMockFetch } from './mock-fetch.js';
import { mlbSchedule, mlbGame, mlbStandings, mlbCalendar, convertFeed, shortResult } from '../lib/mlb.js';
import * as fx from './fixtures/mlb.js';

installMockFetch();

test('日程: 日本時間の日付で絞り込む', async () => {
  const games = await mlbSchedule('2026-10-11');
  assert.deepEqual(games.map((g) => g.id), ['813001', '813002']);
  const [live, fin] = games;
  assert.equal(live.startTime, '07:08');
  assert.equal(live.status, 'live');
  assert.equal(live.statusText, '6回裏');
  assert.equal(live.away.name, 'ドジャース');
  assert.equal(live.leagueGroup, 'PS');
  assert.equal(live.series, '地区シリーズ 第3戦');
  assert.equal(fin.status, 'final');
  assert.deepEqual(fin.notes, ['勝 Jeff Hoffman', '敗 Luke Weaver']);
});

test('試合詳細 (試合中)', () => {
  const g = convertFeed(fx.feed);
  assert.equal(g.status, 'live');
  assert.equal(g.title, 'ドジャース vs フィリーズ');
  assert.equal(g.away.score, 3);
  assert.equal(g.linescore.innings.length, 9);
  assert.equal(g.linescore.innings[5].home, null);
  const c = g.current;
  assert.equal(c.balls, 2);
  assert.equal(c.outs, 1);
  assert.equal(c.runners.second, 'Kyle Schwarber');
  assert.equal(c.runners.first, null);
  assert.equal(c.pitcher.name, '山本 由伸');
  assert.equal(c.pitcher.jp, true);
  assert.equal(c.pitches.length, 3);
  assert.equal(c.pitches[2].call, 'ボール');
  assert.equal(c.defense.shortstop, 'Mookie Betts');
  // 本塁打
  assert.deepEqual(g.homeRuns[0], { side: 'away', name: '大谷 翔平', jp: true, number: 3, detail: '1回表ソロ 131m' });
  // 経過
  const top1 = g.plays[0];
  assert.equal(top1.label, '1回表 ドジャースの攻撃');
  assert.equal(top1.atBats[0].order, 1);
  assert.equal(top1.atBats[0].situation, '無死走者なし');
  assert.equal(top1.atBats[1].result, '見逃し三振');
  assert.equal(top1.atBats[1].situation, '無死走者なし');
  const bot1 = g.plays[1];
  assert.equal(bot1.atBats[1].situation, '無死一塁');
  assert.equal(bot1.atBats[1].result, '併殺打');
  assert.equal(top1.atBats[0].pitches[2].speed, 156);
  // 成績
  const bat = g.box.away.batting[0];
  assert.deepEqual(bat.rows[0].slice(0, 4), ['(指)', '大谷 翔平', '.282', '3']);
  assert.equal(bat.rows[bat.rows.length - 1][1], '合計');
  assert.equal(bat.rows.length, 11); // 9人 + 代打 + 合計
  assert.equal(bat.headers[11], '1回');
  assert.equal(bat.rows[0][11], '右本');
  assert.equal(bat.rows[1][11], '見三振');
  assert.equal(g.box.home.batting[0].rows[1][11], '二併殺');
  assert.equal(g.box.away.pitching[0].rows[0][1], '山本 由伸');
});

test('試合詳細 (終了): 責任投手', async () => {
  const g = await mlbGame(813002);
  assert.equal(g.status, 'final');
  assert.equal(g.current, null);
  assert.deepEqual(g.decisions.win, { name: '山本 由伸', record: '12勝8敗0S' });
});

test('順位表: 地区とワイルドカード', async () => {
  const s = await mlbStandings(2026);
  assert.deepEqual(s.NL.map((d) => d.name), ['ナ・リーグ東地区', 'ナ・リーグ西地区']);
  assert.equal(s.NL[0].rows[0].cells[1], 'フィリーズ');
  assert.equal(s.NL[0].rows[0].cells[9], '+112');
  assert.equal(s.NL[0].rows[0].cells[8], '2連勝');
  assert.equal(s.WC[0].name, 'ナ・リーグ ワイルドカード');
  assert.equal(s.WC[0].rows[1].cells[1], 'パドレス');
});

test('カレンダー: 日本時間の月で絞り、勝敗を付ける', async () => {
  const c = await mlbCalendar(119, '2026-10');
  assert.equal(c.team.short, 'LAD');
  const live = c.games.find((g) => g.id === '813001');
  assert.equal(live.side, 'away');
  assert.equal(live.result, null);
  assert.ok(c.games.every((g) => g.date.startsWith('2026-10')));
});

test('打席結果の短い表記', () => {
  const p = (eventType, event, extra = {}) => ({ result: { eventType, event }, matchup: { batter: { id: 1 } }, playEvents: [], ...extra });
  assert.equal(shortResult(p('single', 'Single'), { location: '7' }), '左安');
  assert.equal(shortResult(p('field_out', 'Groundout'), { location: '6' }), '遊ゴ');
  assert.equal(shortResult(p('field_out', 'Flyout'), { location: '8' }), '中飛');
  assert.equal(shortResult(p('home_run', 'Home Run'), { location: '9' }), '右本');
  assert.equal(shortResult(p('walk', 'Walk')), '四球');
  assert.equal(shortResult(p('strikeout', 'Strikeout', { playEvents: [{ isPitch: true, details: { call: { code: 'S' } } }] })), '空三振');
  assert.equal(shortResult(p('grounded_into_double_play', 'GIDP', { runners: [{ details: { runner: { id: 1 } }, credits: [{ position: { code: '4' } }] }] })), '二併殺');
});
