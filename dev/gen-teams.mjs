// lib/ のチーム定義からフロントエンド用の public/teams.js を生成する
// 使い方: node dev/gen-teams.mjs
import { writeFileSync } from 'node:fs';
import { NPB_TEAMS } from '../lib/npb/teams.js';
import { MLB_TEAMS } from '../lib/mlb.js';

const npb = NPB_TEAMS.map(({ code, league, name, color }) => ({ code, league, name, color }));
const mlb = Object.entries(MLB_TEAMS).map(([id, t]) => ({ id: Number(id), name: t.ja, color: t.color, league: t.lg }))
  .sort((a, b) => a.league.localeCompare(b.league) || a.name.localeCompare(b.name, 'ja'));
writeFileSync(new URL('../public/teams.js', import.meta.url),
  `// 自動生成: node dev/gen-teams.mjs\nexport const NPB_TEAM_LIST = ${JSON.stringify(npb, null, 1)};\nexport const MLB_TEAM_LIST = ${JSON.stringify(mlb, null, 1)};\n`);
