// lib/ のチーム定義からフロントエンド用の public/js/teams.js を生成する
// 使い方: node dev/gen-teams.mjs
import { writeFileSync } from 'node:fs';
import { NPB_TEAMS } from '../lib/npb/teams.js';
import { MLB_TEAMS } from '../lib/mlb.js';

const npb = NPB_TEAMS.map(({ code, league, name, abbr, color, fg }) => ({ code, league, name, short: abbr, color, fg }));
const mlb = Object.entries(MLB_TEAMS).map(([id, t]) => ({ id: Number(id), name: t.ja, short: t.ab, color: t.color, fg: t.fg || '#fff', league: t.lg }))
  .sort((a, b) => a.league.localeCompare(b.league) || a.name.localeCompare(b.name, 'ja'));
writeFileSync(new URL('../public/js/teams.js', import.meta.url),
  `// 自動生成: node dev/gen-teams.mjs\nexport const NPB_TEAM_LIST = ${JSON.stringify(npb)};\nexport const MLB_TEAM_LIST = ${JSON.stringify(mlb)};\n`);
