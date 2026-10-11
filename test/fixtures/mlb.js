// MLB Stats API のレスポンスを模したテスト用データ (構造は実際の API に合わせている)

const DODGERS = { id: 119, name: 'Los Angeles Dodgers', abbreviation: 'LAD', teamName: 'Dodgers' };
const PHILLIES = { id: 143, name: 'Philadelphia Phillies', abbreviation: 'PHI', teamName: 'Phillies' };
const YANKEES = { id: 147, name: 'New York Yankees', abbreviation: 'NYY', teamName: 'Yankees' };
const JAYS = { id: 141, name: 'Toronto Blue Jays', abbreviation: 'TOR', teamName: 'Blue Jays' };

export const schedule = {
  dates: [
    {
      date: '2026-10-10',
      games: [
        {
          gamePk: 813001,
          gameType: 'D',
          gameDate: '2026-10-10T22:08:00Z', // JST 10/11 07:08
          status: { abstractGameState: 'Live', codedGameState: 'I', detailedState: 'In Progress' },
          teams: {
            away: { team: DODGERS, score: 3, leagueRecord: { wins: 1, losses: 1 } },
            home: { team: PHILLIES, score: 2, leagueRecord: { wins: 1, losses: 1 } },
          },
          linescore: { currentInning: 6, isTopInning: false, inningState: 'Bottom', outs: 1, teams: { away: { runs: 3 }, home: { runs: 2 } } },
          venue: { name: 'Citizens Bank Park' },
          seriesDescription: 'Division Series',
          seriesGameNumber: 3,
          seriesStatus: { result: 'Series tied 1-1' },
        },
        {
          gamePk: 813000,
          gameType: 'D',
          gameDate: '2026-10-10T00:08:00Z', // JST 10/10 09:08 → 対象外
          status: { abstractGameState: 'Final', codedGameState: 'F', detailedState: 'Final' },
          teams: { away: { team: YANKEES, score: 1 }, home: { team: JAYS, score: 4 } },
          venue: { name: 'Rogers Centre' },
        },
      ],
    },
    {
      date: '2026-10-11',
      games: [
        {
          gamePk: 813002,
          gameType: 'D',
          gameDate: '2026-10-11T08:00:00Z', // JST 10/11 17:00
          status: { abstractGameState: 'Final', codedGameState: 'F', detailedState: 'Final' },
          teams: { away: { team: YANKEES, score: 5 }, home: { team: JAYS, score: 6 } },
          decisions: { winner: { id: 5, fullName: 'Jeff Hoffman' }, loser: { id: 6, fullName: 'Luke Weaver' } },
          venue: { name: 'Rogers Centre' },
          seriesDescription: 'Division Series',
          seriesGameNumber: 4,
        },
        {
          gamePk: 813003,
          gameType: 'D',
          gameDate: '2026-10-11T23:38:00Z', // JST 10/12 → 対象外
          status: { abstractGameState: 'Preview', codedGameState: 'S', detailedState: 'Scheduled' },
          teams: { away: { team: DODGERS }, home: { team: PHILLIES } },
          venue: { name: 'Citizens Bank Park' },
        },
      ],
    },
  ],
};

const person = (id, fullName) => ({ id, fullName });
const OHTANI = person(660271, 'Shohei Ohtani');
const BETTS = person(605141, 'Mookie Betts');
const FREEMAN = person(518692, 'Freddie Freeman');
const YAMAMOTO = person(808967, 'Yoshinobu Yamamoto');
const SCHWARBER = person(656941, 'Kyle Schwarber');
const HARPER = person(547180, 'Bryce Harper');
const WHEELER = person(554430, 'Zack Wheeler');

const pitch = (n, code, callCode, isBall, isStrike, speed, px, pz, balls, strikes, extra = {}) => ({
  isPitch: true,
  type: 'pitch',
  pitchNumber: n,
  details: {
    call: { code: callCode, description: callCode },
    type: { code, description: code },
    isBall, isStrike, isInPlay: callCode === 'X' || callCode === 'D' || callCode === 'E',
  },
  count: { balls, strikes, outs: 0 },
  pitchData: { startSpeed: speed, coordinates: { pX: px, pZ: pz }, strikeZoneTop: 3.4, strikeZoneBottom: 1.6 },
  ...extra,
});

const play = (inning, half, batter, pitcher, result, events, count, extra = {}) => ({
  result: { type: 'atBat', ...result },
  about: { inning, halfInning: half, isComplete: true, isScoringPlay: !!result.rbi, ...extra.about },
  count,
  matchup: { batter, pitcher, batSide: { code: 'L' }, pitchHand: { code: 'R' }, ...extra.matchup },
  playEvents: events,
});

const allPlays = [
  play(1, 'top', OHTANI, WHEELER,
    { event: 'Home Run', eventType: 'home_run', description: 'Shohei Ohtani homers (3) on a fly ball to right field.', rbi: 1, awayScore: 1, homeScore: 0 },
    [pitch(1, 'FF', 'B', true, false, 97.2, 0.9, 3.1, 1, 0), pitch(2, 'SL', 'C', false, true, 88.1, 0.2, 2.4, 1, 1),
      pitch(3, 'FF', 'X', false, false, 96.8, -0.1, 2.9, 1, 1, { hitData: { launchSpeed: 112.3, launchAngle: 27, totalDistance: 431 } })],
    { balls: 1, strikes: 1, outs: 0 }),
  play(1, 'top', BETTS, WHEELER,
    { event: 'Strikeout', eventType: 'strikeout', description: 'Mookie Betts called out on strikes.', isOut: true },
    [pitch(1, 'SI', 'C', false, true, 95.1, -0.5, 2.0, 0, 1), pitch(2, 'SL', 'S', false, true, 87.0, 0.8, 1.4, 0, 2), pitch(3, 'FF', 'C', false, true, 97.5, 0.6, 3.2, 0, 3)],
    { balls: 0, strikes: 3, outs: 1 }),
  play(1, 'bottom', SCHWARBER, YAMAMOTO,
    { event: 'Walk', eventType: 'walk', description: 'Kyle Schwarber walks.' },
    [pitch(1, 'FS', 'B', true, false, 90.0, 0.3, 0.9, 1, 0), pitch(2, 'FF', 'B', true, false, 96.0, 1.2, 3.0, 2, 0), pitch(3, 'CU', 'B', true, false, 76.0, -1.1, 1.0, 3, 0), pitch(4, 'FF', 'B', true, false, 96.5, 0.0, 4.0, 4, 0)],
    { balls: 4, strikes: 0, outs: 0 }, { matchup: { postOnFirst: SCHWARBER } }),
  play(1, 'bottom', HARPER, YAMAMOTO,
    { event: 'Grounded Into DP', eventType: 'grounded_into_double_play', description: 'Bryce Harper grounds into a double play.', isOut: true },
    [pitch(1, 'FS', 'X', false, false, 90.5, 0.1, 1.8, 0, 0)],
    { balls: 0, strikes: 0, outs: 2 }),
  {
    // 進行中の打席
    result: { type: 'atBat' },
    about: { inning: 6, halfInning: 'bottom', isComplete: false },
    count: { balls: 2, strikes: 1, outs: 1 },
    matchup: { batter: HARPER, pitcher: YAMAMOTO, batSide: { code: 'L' }, pitchHand: { code: 'R' } },
    playEvents: [
      pitch(1, 'FF', 'B', true, false, 97.0, 1.0, 3.6, 1, 0),
      pitch(2, 'FS', 'S', false, true, 91.0, 0.2, 1.3, 1, 1),
      { type: 'action', details: { description: 'Kyle Schwarber steals (1) 2nd base.', event: 'Stolen Base 2B' } },
      pitch(3, 'CU', '*B', true, false, 77.0, -0.4, 0.8, 2, 1),
    ],
  },
];

const bxPlayer = (p, pos, order, batting = {}, seasonBat = {}, pitching = null, seasonPit = null) => ({
  person: p,
  position: { abbreviation: pos },
  allPositions: [{ abbreviation: pos }],
  battingOrder: order,
  stats: { batting, pitching: pitching || {} },
  seasonStats: { batting: seasonBat, pitching: seasonPit || {} },
});

export const feed = {
  gameData: {
    game: { pk: 813001, type: 'D', seriesDescription: 'Division Series', seriesGameNumber: 3 },
    datetime: { dateTime: '2026-10-10T22:08:00Z' },
    status: { abstractGameState: 'Live', codedGameState: 'I', detailedState: 'In Progress' },
    teams: { away: { ...DODGERS, record: { wins: 98, losses: 64 } }, home: { ...PHILLIES, record: { wins: 95, losses: 67 } } },
    venue: { name: 'Citizens Bank Park' },
    weather: { condition: 'Clear', temp: '68' },
    probablePitchers: { away: YAMAMOTO, home: WHEELER },
  },
  liveData: {
    linescore: {
      currentInning: 6, isTopInning: false, inningState: 'Bottom', balls: 2, strikes: 1, outs: 1,
      innings: [
        { num: 1, away: { runs: 1 }, home: { runs: 0 } },
        { num: 2, away: { runs: 0 }, home: { runs: 0 } },
        { num: 3, away: { runs: 2 }, home: { runs: 0 } },
        { num: 4, away: { runs: 0 }, home: { runs: 1 } },
        { num: 5, away: { runs: 0 }, home: { runs: 1 } },
        { num: 6, away: { runs: 0 }, home: {} },
      ],
      teams: { away: { runs: 3, hits: 6, errors: 0, leftOnBase: 4 }, home: { runs: 2, hits: 4, errors: 1, leftOnBase: 3 } },
      offense: { batter: HARPER, onDeck: person(1, 'Alec Bohm'), second: SCHWARBER },
      defense: { pitcher: YAMAMOTO, catcher: person(2, 'Will Smith'), first: FREEMAN, second: person(3, 'Tommy Edman'), third: person(4, 'Max Muncy'), shortstop: BETTS, left: person(7, 'Michael Conforto'), center: person(8, 'Andy Pages'), right: person(9, 'Teoscar Hernández') },
    },
    decisions: undefined,
    plays: { allPlays, currentPlay: allPlays[allPlays.length - 1] },
    boxscore: {
      teams: {
        away: {
          players: {
            ID660271: bxPlayer(OHTANI, 'DH', '100', { atBats: 3, runs: 1, hits: 1, rbi: 1, homeRuns: 1, baseOnBalls: 0, strikeOuts: 1, stolenBases: 0 }, { avg: '.282', homeRuns: 55, ops: '1.014' }),
            ID605141: bxPlayer(BETTS, 'SS', '200', { atBats: 3, runs: 0, hits: 0, rbi: 0 }, { avg: '.258' }),
            ID518692: bxPlayer(FREEMAN, '1B', '300', { atBats: 2, runs: 1, hits: 1 }, { avg: '.295' }),
            ID808967: bxPlayer(YAMAMOTO, 'P', undefined, {}, {}, { inningsPitched: '5.1', battersFaced: 21, numberOfPitches: 82, hits: 4, homeRuns: 0, baseOnBalls: 2, strikeOuts: 7, runs: 2, earnedRuns: 2 }, { era: '2.49', wins: 12, losses: 8, saves: 0 }),
          },
          batters: [660271, 605141, 518692],
          pitchers: [808967],
          teamStats: { batting: { atBats: 8, runs: 2, hits: 2, rbi: 1, homeRuns: 1, baseOnBalls: 0, strikeOuts: 1, stolenBases: 0 } },
        },
        home: {
          players: {
            ID656941: bxPlayer(SCHWARBER, 'DH', '100', { atBats: 2, runs: 0, hits: 0, baseOnBalls: 1, stolenBases: 1 }, { avg: '.240', homeRuns: 56, ops: '.920' }),
            ID547180: bxPlayer(HARPER, '1B', '200', { atBats: 2, hits: 1 }, { avg: '.275', homeRuns: 27, ops: '.850' }),
            ID554430: bxPlayer(WHEELER, 'P', undefined, {}, {}, { inningsPitched: '5.0', battersFaced: 20, numberOfPitches: 88, hits: 6, homeRuns: 1, baseOnBalls: 1, strikeOuts: 8, runs: 3, earnedRuns: 3, note: '' }, { era: '2.71' }),
          },
          batters: [656941, 547180],
          pitchers: [554430],
        },
      },
    },
  },
};

export const standings = {
  records: [
    {
      division: { id: 204 },
      teamRecords: [
        { team: PHILLIES, wins: 95, losses: 67, winningPercentage: '.586', gamesBack: '-', wildCardGamesBack: '-', streak: { streakCode: 'W2' }, runDifferential: 112, clinchIndicator: 'z', records: { splitRecords: [{ type: 'lastTen', wins: 6, losses: 4 }] } },
      ],
    },
    {
      division: { id: 203 },
      teamRecords: [
        { team: DODGERS, wins: 98, losses: 64, winningPercentage: '.605', gamesBack: '-', wildCardGamesBack: '-', streak: { streakCode: 'L1' }, runDifferential: 150, records: { splitRecords: [{ type: 'lastTen', wins: 7, losses: 3 }] } },
      ],
    },
  ],
};
