import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMockFetch } from './mock-fetch.js';
import { npbLeaders, npbStatsList } from '../lib/npb/stats.js';
import { npbStandings } from '../lib/npb/index.js';
import { mlbLeaders, mlbStatsList, mlbStandings } from '../lib/mlb.js';

installMockFetch();

test('NPB 個人成績: リーグ別・打者/投手に分けたリーダーボード', async () => {
  const L = await npbLeaders();
  assert.deepEqual(L.C.batting.map((b) => b.title), ['打率', '本塁打']);
  assert.deepEqual(L.C.pitching.map((b) => b.title), ['防御率', 'セーブ']);
  assert.equal(L.C.batting[0].rows[0].name, '佐藤');
  assert.equal(L.C.batting[0].rows[0].team.code, 't');
  assert.equal(L.C.batting[0].more, 'https://baseball.yahoo.co.jp/npb/stats/batter?gameKindId=1&type=avg');
  assert.equal(L.P.pitching[0].rows[0].name, 'モイネロ');
});

test('NPB 成績一覧: 詳しい表とチーム判定 / 他サイトの URL は拒否', async () => {
  const d = await npbStatsList('https://baseball.yahoo.co.jp/npb/stats/batter?gameKindId=1&type=avg');
  assert.equal(d.title, 'セ・リーグ 打撃成績一覧');
  assert.equal(d.headers.length, 23);
  assert.equal(d.rows.length, 10);
  assert.equal(d.rows[3].team.code, 'g');
  await assert.rejects(npbStatsList('https://example.com/npb/stats/'), /invalid/);
});

test('NPB 順位表 (詳細ページ): 縦書き見出し・対戦成績・その他の表', async () => {
  const s = await npbStandings('2026');
  const [main, mx, hv] = s.C.tables;
  assert.equal(main.kind, 'standings');
  assert.ok(main.headers.includes('残試合'));
  assert.ok(main.headers.includes('防御率'));
  assert.equal(mx.kind, 'matrix');
  assert.match(mx.title, /対戦成績/);
  assert.match(mx.rows[0].cells[2], /^\d+ - \d+ \(\d\)$/);
  assert.equal(hv.title, 'ホーム・ビジター成績');
});

test('MLB 個人成績: リーダーと一覧', async () => {
  const L = await mlbLeaders('NL', 2026);
  assert.equal(L.batting[0].title, '打率');
  assert.equal(L.batting[0].rows[0].name, '大谷 翔平');
  assert.equal(L.batting[0].rows[0].jp, true);
  assert.equal(L.batting[0].more, 'mlb:NL:hitting:avg');
  const list = await mlbStatsList('NL', 'hitting', 'homeRuns', 2026);
  assert.equal(list.sort, 'homeRuns');
  assert.equal(list.rows[1].cells[1], '大谷 翔平');
  assert.equal(list.rows[1].cells[2], 'ドジャース');
  await assert.rejects(mlbStatsList('XX', 'hitting', 'avg', 2026), /invalid/);
});

test('MLB 順位表の詳細列', async () => {
  const s = await mlbStandings(2026);
  assert.equal(s.NL[0].detailHeaders.length, s.NL[0].rows[0].detail.length);
  assert.equal(s.NL[0].rows[0].detail[1], 'フィリーズ');
});
