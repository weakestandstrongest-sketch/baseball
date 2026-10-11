// 設定
import { $app, esc, badge, settings, saveSettings } from './util.js';
import { state } from './state.js';
import { NPB_TEAM_LIST, MLB_TEAM_LIST } from './teams.js';

export function settingsView() {
  state.view = { name: 'settings' };
  const chip = (league, t) => {
    const key = league === 'MLB' ? `mlb:${t.id}` : `npb:${t.code}`;
    const on = settings.favorites.includes(key);
    return `<button class="fchip ${on ? 'on' : ''}" data-fav="${key}" style="--c:${esc(t.color)}">${badge(t, 'xs')}${esc(t.name)}</button>`;
  };
  const toggle = (k, label) => `<label class="li sw-row"><span>${label}</span><input type="checkbox" class="sw" data-lg="${k}" ${settings.leagues[k] ? 'checked' : ''}></label>`;

  const render = () => {
    $app.innerHTML = `
      <header class="lt"><div class="lt-row"><h1>設定</h1></div></header>
      <main class="list settings">
        <h3 class="sec-title">お気に入りチーム</h3>
        <div class="card pad">
          <p class="hint">選んだチームの試合は一覧の一番上に表示され、カレンダーの初期チームになります。</p>
          <div class="fl">セ・リーグ</div><div class="fgrid">${NPB_TEAM_LIST.filter((t) => t.league === 'C').map((t) => chip('NPB', t)).join('')}</div>
          <div class="fl">パ・リーグ</div><div class="fgrid">${NPB_TEAM_LIST.filter((t) => t.league === 'P').map((t) => chip('NPB', t)).join('')}</div>
          <div class="fl">MLB ア・リーグ</div><div class="fgrid">${MLB_TEAM_LIST.filter((t) => t.league === 'AL').map((t) => chip('MLB', t)).join('')}</div>
          <div class="fl">MLB ナ・リーグ</div><div class="fgrid">${MLB_TEAM_LIST.filter((t) => t.league === 'NL').map((t) => chip('MLB', t)).join('')}</div>
        </div>

        <h3 class="sec-title">試合一覧に表示するリーグ</h3>
        <div class="card list-card">${toggle('C', 'セ・リーグ')}${toggle('P', 'パ・リーグ')}${toggle('MLB', 'MLB')}</div>

        <h3 class="sec-title">試合中の自動更新</h3>
        <div class="card pad"><div class="seg">${[10, 15, 30, 60].map((s) => `<button class="${settings.refresh === s ? 'on' : ''}" data-rf="${s}">${s}秒</button>`).join('')}</div></div>

        <h3 class="sec-title">このアプリについて</h3>
        <div class="card list-card">
          <div class="li kv"><span>NPB</span><b>スポーツナビ / NPB.jp</b></div>
          <div class="li kv"><span>MLB</span><b>MLB 公式 Stats API</b></div>
          <div class="li"><small>ホーム画面に追加: Safari の共有ボタン →「ホーム画面に追加」。個人で楽しむためのアプリです。</small></div>
        </div>
      </main>`;
    $app.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.fav;
      settings.favorites = settings.favorites.includes(k) ? settings.favorites.filter((x) => x !== k) : [...settings.favorites, k];
      saveSettings();
      render();
    }));
    $app.querySelectorAll('[data-lg]').forEach((c) => c.addEventListener('change', () => { settings.leagues[c.dataset.lg] = c.checked; saveSettings(); }));
    $app.querySelectorAll('[data-rf]').forEach((b) => b.addEventListener('click', () => { settings.refresh = Number(b.dataset.rf); saveSettings(); render(); }));
  };
  render();
}
