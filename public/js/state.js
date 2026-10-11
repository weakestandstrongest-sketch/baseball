// 画面間で共有する状態
export const state = {
  view: null, // 表示中の画面 { name, refresh? }
  timer: null, // 自動更新タイマー
  cardCache: new Map(), // 試合一覧のカード (詳細画面の補完用)
  listDate: null, // 一覧で選んでいた日付 (戻ったとき用)
  listFilter: null,
};

export function stopTimer() {
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
}

export function schedule(fn, sec) {
  stopTimer();
  state.timer = setTimeout(() => { if (!document.hidden) fn(); }, sec * 1000);
}
