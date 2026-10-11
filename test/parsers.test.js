import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML, lines, tables, text } from '../lib/html.js';
import { parseYahooSchedule } from '../lib/npb/yahoo.js';
import { parseNpbjpSchedule } from '../lib/npb/npbjp.js';
import { buildGame } from '../lib/npb/build.js';
import { parseStandings } from '../lib/npb/index.js';
import { parsePlays, parseDecisions, parseHomeRuns, parseStatus } from '../lib/npb/common.js';
import { teamsInText, teamFromText } from '../lib/npb/teams.js';

const fx = (p) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');

test('HTML パーサー: 省略された終了タグと実体参照', () => {
  const root = parseHTML('<table><tr><td>1<td>2&amp;3<tr><td colspan=2>x</table><p>a<p>b<br>c &nbsp;d');
  assert.deepEqual(tables(root)[0].rows, [['1', '2&3'], ['x', '']]);
  assert.deepEqual(lines(root), ['1 2&3', 'x', 'a', 'b', 'c d']);
});

test('HTML パーサー: script 内の文字列はタグとして解釈しない', () => {
  const root = parseHTML('<div><script>var s="<li>1回表</li>";</script><span>ok</span></div>');
  assert.equal(text(root), 'ok');
});

test('チーム名の判定 (全角・略称・出現順)', () => {
  assert.equal(teamFromText('ＤｅＮＡ').code, 'db');
  assert.equal(teamFromText('日本ハム').code, 'f');
  assert.deepEqual(teamsInText('日本ハム 3 - 2 オリックス').map((t) => t.code), ['f', 'b']);
});

test('Yahoo 日程: 3 試合 (終了・試合中・試合前)', () => {
  const games = parseYahooSchedule(fx('yahoo/schedule.html'), '2026-10-10');
  assert.equal(games.length, 3);
  const [g1, g2, g3] = games;
  assert.equal(g1.id, 'y2021029839');
  assert.equal(g1.home.code, 'g');
  assert.equal(g1.away.code, 'db');
  assert.equal(g1.home.score, 1);
  assert.equal(g1.away.score, 2);
  assert.equal(g1.status, 'final');
  assert.equal(g1.venue, '東京ドーム');
  assert.deepEqual(g1.notes, ['勝 浜地', '敗 マルティネス', 'S レイノルズ']);
  assert.equal(g2.status, 'live');
  assert.equal(g2.statusText, '7回裏');
  assert.equal(g2.leagueGroup, 'P');
  assert.equal(g3.status, 'pre');
  assert.equal(g3.startTime, '18:00');
  assert.equal(g3.home.score, null);
});

test('npb.jp 日程: URL からホーム/ビジターを判定', () => {
  const games = parseNpbjpSchedule(fx('npbjp/schedule.html'), '2026-10-10');
  assert.equal(games.length, 2);
  assert.equal(games[0].id, 'n20261010-g-db-01');
  assert.equal(games[0].home.code, 'g');
  assert.equal(games[0].away.code, 'db');
  assert.equal(games[0].home.score, 1);
  assert.equal(games[0].status, 'final');
  assert.equal(games[1].status, 'pre');
});

test('試合詳細 (終了): スコアボード・責任投手・本塁打・戦評・経過・成績', () => {
  const g = buildGame({ id: 'y1', source: 'yahoo', url: '', pages: { top: fx('yahoo/top-final.html'), box: fx('yahoo/stats.html'), text: fx('yahoo/text.html') } });
  assert.equal(g.status, 'final');
  assert.equal(g.away.code, 'db');
  assert.equal(g.home.code, 'g');
  assert.equal(g.away.score, 2);
  assert.equal(g.home.hits, 6);
  assert.equal(g.linescore.innings.length, 9);
  assert.equal(g.linescore.innings[8].away, '1');
  assert.equal(g.date, '2026-10-10');
  assert.equal(g.startTime, '14:00');
  assert.equal(g.venue, '東京ドーム');
  assert.deepEqual(g.decisions.win, { name: '浜地 真澄', record: '1勝0敗0S' });
  assert.equal(g.decisions.save.name, 'レイノルズ');
  assert.deepEqual(g.homeRuns.map((h) => [h.side, h.name, h.number, h.detail]), [
    ['away', '牧 秀悟', 1, '1回表ソロ'], ['away', '度会 隆輝', 1, '9回表ソロ'],
  ]);
  assert.match(g.summary, /王手/);
  assert.equal(g.plays[0].label, '試合前情報');
  assert.equal(g.plays[1].label, '1回表 DeNAの攻撃');
  assert.equal(g.plays[1].atBats[0].batter, '度会 隆輝');
  assert.equal(g.plays[1].atBats[0].events[0].pitch, 4);
  assert.ok(g.plays[1].atBats[1].events[0].scoring);
  assert.equal(g.plays[3].events[0].change, true); // ピッチャー交代
  assert.equal(g.box.away.batting[0].rows[0][1], '度会 隆輝');
  assert.equal(g.box.home.batting[0].rows[0][1], '吉川 尚輝');
  assert.equal(g.box.away.pitching[0].rows[0][1], '東 克樹');
  assert.equal(g.box.home.pitching[0].rows[1][0], '敗');
});

test('試合詳細 (試合中): カウント・走者・打者/投手・投球', () => {
  const g = buildGame({ id: 'y2', source: 'yahoo', url: '', pages: { top: fx('yahoo/top-live.html'), live: fx('yahoo/score-live.html'), text: fx('yahoo/text.html') } });
  assert.equal(g.status, 'live');
  assert.equal(g.statusText, '7回裏');
  assert.equal(g.linescore.innings[7].away, null);
  const c = g.current;
  assert.equal(c.inning, 7);
  assert.equal(c.half, 'bottom');
  assert.equal(c.balls, 2);
  assert.equal(c.strikes, 1);
  assert.equal(c.outs, 1);
  assert.deepEqual(c.runners, { first: '万波', third: '清宮' });
  assert.equal(c.batter.name, '郡司 裕也');
  assert.equal(c.pitcher.name, '宮城 大弥');
  assert.equal(c.pitches.length, 3);
  assert.deepEqual(c.pitches[1], { num: 2, type: 'スライダー', speed: '131', result: '見逃し' });
  assert.deepEqual(g.homeRuns.map((h) => [h.side, h.name, h.number]), [['home', 'レイエス', 25]]);
});

test('責任投手・本塁打・状態の別表記', () => {
  assert.deepEqual(parseDecisions(['勝利投手 山本 由伸', '敗戦投手 戸郷 翔征']), { win: { name: '山本 由伸', record: '' }, loss: { name: '戸郷 翔征', record: '' } });
  assert.equal(parseHomeRuns(['本塁打', '巨 岡本 和真 30号(3回裏2ラン)'], { away: { code: 't' }, home: { code: 'g' } })[0].side, 'home');
  assert.equal(parseStatus(['ノーゲーム']).status, 'postponed');
  assert.equal(parseStatus(['試合前', '予告先発']).status, 'pre');
  assert.equal(parseStatus(['5回表']).text, '5回表');
});

test('経過: 数字だけの行・交代・得点', () => {
  const p = parsePlays(['3回裏 阪神の攻撃', '1', '7番：木浪 聖也 二死二塁', '3 ライトへのタイムリーヒット! 1点', '代打：糸原']);
  assert.equal(p[0].inning, 3);
  assert.equal(p[0].half, 'bottom');
  assert.equal(p[0].atBats[0].situation, '二死二塁');
  assert.equal(p[0].atBats[0].events[0].scoring, true);
  assert.equal(p[0].atBats[0].events[1].change, true);
});

test('順位表: セ・パを判定', () => {
  const s = parseStandings([fx('yahoo/standings.html')]);
  assert.equal(s.C.rows.length, 6);
  assert.equal(s.C.rows[0].team.code, 't');
  assert.equal(s.P.rows[0].team.code, 'h');
});
