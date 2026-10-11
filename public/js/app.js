// 野球速報 — 自分専用の広告なし速報アプリ (PWA)
import { $app, icon } from './util.js';
import { state, stopTimer } from './state.js';
import { gamesView } from './games.js';
import { gameView } from './game.js';
import { calendarView } from './calendar.js';
import { standingsView } from './standings.js';
import { settingsView } from './settings.js';

const TABS = [
  ['games', '#/', '試合', 'ball'],
  ['calendar', '#/calendar', 'カレンダー', 'calendar'],
  ['standings', '#/standings', '順位', 'trophy'],
  ['settings', '#/settings', '設定', 'gear'],
];

const tabbar = document.getElementById('tabbar');
tabbar.innerHTML = TABS.map(([k, href, label, ic]) => `<a href="${href}" data-nav="${k}">${icon(ic, 25)}<span>${label}</span></a>`).join('');

function route() {
  stopTimer();
  if (state.view && state.view.cleanup) state.view.cleanup();
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = hash.split('?');
  const q = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const nav = parts[0] === 'game' ? null : parts[0] || 'games';
  tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
  document.body.classList.toggle('in-game', parts[0] === 'game');
  $app.classList.remove('enter');
  void $app.offsetWidth; // アニメーションを毎回やり直す
  $app.classList.add('enter');
  if (parts[0] === 'game') return gameView(parts[1], decodeURIComponent(parts[2] || ''), parts[3] || 'top');
  if (parts[0] === 'calendar') return calendarView(q);
  if (parts[0] === 'standings') return standingsView(q);
  if (parts[0] === 'settings') return settingsView();
  return gamesView(q);
}

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.view && state.view.refresh) state.view.refresh();
});

route();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
