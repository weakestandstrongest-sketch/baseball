// NPB 12 球団 (1軍)。code は npb.jp の URL で使われる略号。
export const NPB_TEAMS = [
  { code: 'g', league: 'C', name: '巨人', full: '読売ジャイアンツ', abbr: '巨', color: '#F97709', fg: '#000', aliases: ['巨人', '読売', 'ジャイアンツ'] },
  { code: 't', league: 'C', name: '阪神', full: '阪神タイガース', abbr: '神', color: '#FFE201', fg: '#000', aliases: ['阪神', 'タイガース'] },
  { code: 'db', league: 'C', name: 'DeNA', full: '横浜DeNAベイスターズ', abbr: 'デ', color: '#0055A5', fg: '#fff', aliases: ['DeNA', 'ディー・エヌ・エー', 'ベイスターズ', '横浜'] },
  { code: 'c', league: 'C', name: '広島', full: '広島東洋カープ', abbr: '広', color: '#E60012', fg: '#fff', aliases: ['広島', 'カープ'] },
  { code: 's', league: 'C', name: 'ヤクルト', full: '東京ヤクルトスワローズ', abbr: 'ヤ', color: '#0A8D4D', fg: '#fff', aliases: ['ヤクルト', 'スワローズ'] },
  { code: 'd', league: 'C', name: '中日', full: '中日ドラゴンズ', abbr: '中', color: '#00428E', fg: '#fff', aliases: ['中日', 'ドラゴンズ'] },
  { code: 'h', league: 'P', name: 'ソフトバンク', full: '福岡ソフトバンクホークス', abbr: 'ソ', color: '#F5C700', fg: '#000', aliases: ['ソフトバンク', 'ホークス', 'SB'] },
  { code: 'f', league: 'P', name: '日本ハム', full: '北海道日本ハムファイターズ', abbr: '日', color: '#006298', fg: '#fff', aliases: ['日本ハム', '日ハム', 'ファイターズ'] },
  { code: 'm', league: 'P', name: 'ロッテ', full: '千葉ロッテマリーンズ', abbr: 'ロ', color: '#2B2B2B', fg: '#fff', aliases: ['ロッテ', 'マリーンズ'] },
  { code: 'e', league: 'P', name: '楽天', full: '東北楽天ゴールデンイーグルス', abbr: '楽', color: '#860010', fg: '#fff', aliases: ['楽天', 'イーグルス'] },
  { code: 'b', league: 'P', name: 'オリックス', full: 'オリックス・バファローズ', abbr: 'オ', color: '#B08A3E', fg: '#000', aliases: ['オリックス', 'バファローズ'] },
  { code: 'l', league: 'P', name: '西武', full: '埼玉西武ライオンズ', abbr: '西', color: '#1F366A', fg: '#fff', aliases: ['西武', 'ライオンズ'] },
];

const byCode = new Map(NPB_TEAMS.map((t) => [t.code, t]));

// 長い別名から先にマッチさせる (「日本ハム」が「日」に負けないように)
const ALIASES = NPB_TEAMS.flatMap((t) => t.aliases.map((a) => [a, t])).sort((a, b) => b[0].length - a[0].length);

export function teamByCode(code) {
  return byCode.get(code) || null;
}

/** テキストの先頭 (または全体) からチームを見つける */
export function teamFromText(s, { anywhere = true } = {}) {
  if (!s) return null;
  const t = s.normalize('NFKC');
  for (const [a, team] of ALIASES) {
    if (anywhere ? t.includes(a) : t.startsWith(a)) return team;
  }
  if (t.length <= 2) {
    const one = NPB_TEAMS.find((x) => x.abbr === t.trim());
    if (one) return one;
  }
  return null;
}

/** テキスト中に出現するチームを出現順に (重複なし) */
export function teamsInText(s) {
  const t = (s || '').normalize('NFKC');
  const hits = [];
  for (const [a, team] of ALIASES) {
    let idx = t.indexOf(a);
    while (idx >= 0) {
      // より長い別名で既にカバーされた位置は無視
      if (!hits.some((h) => idx >= h.idx && idx < h.idx + h.len)) hits.push({ idx, len: a.length, team });
      idx = t.indexOf(a, idx + 1);
    }
  }
  hits.sort((a, b) => a.idx - b.idx);
  const out = [];
  for (const h of hits) if (!out.includes(h.team)) out.push(h.team);
  return out;
}

export function teamInfo(team, fallbackName) {
  if (!team) return { name: fallbackName || '?', short: (fallbackName || '?').slice(0, 1), code: null, color: '#555', fg: '#fff' };
  return { name: team.name, full: team.full, short: team.abbr, code: team.code, league: team.league, color: team.color, fg: team.fg };
}
