// 日付を選ぶカレンダー (画面の下から出るシート)
import { icon, jstToday, addDays, addMonths } from './util.js';

const HEAD = ['月', '火', '水', '木', '金', '土', '日'];

/**
 * @param selected 選択中の日付 (YYYY-MM-DD)
 * @param onPick   日付を選んだときに呼ばれる
 */
export function openDatePicker(selected, onPick) {
  closeDatePicker();
  const today = jstToday();
  let month = (selected || today).slice(0, 7);

  const el = document.createElement('div');
  el.id = 'date-sheet';
  el.className = 'sheet-wrap';
  document.body.appendChild(el);
  document.body.classList.add('sheet-open');

  const render = () => {
    const first = `${month}-01`;
    const offset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7; // 月曜始まり
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const [y, m] = month.split('-');
    el.innerHTML = `
      <div class="sheet-bg" data-close></div>
      <div class="sheet" role="dialog" aria-label="日付を選ぶ">
        <div class="sheet-grip"></div>
        <div class="dp-head">
          <button class="icon-btn" data-mv="-1" aria-label="前の月">${icon('back', 20)}</button>
          <b>${y}年${Number(m)}月</b>
          <button class="icon-btn" data-mv="1" aria-label="次の月">${icon('next', 20)}</button>
        </div>
        <div class="dp-grid">
          ${HEAD.map((h, i) => `<span class="dp-wd ${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${h}</span>`).join('')}
          ${cells.map((d) => {
            if (!d) return '<span></span>';
            const w = new Date(d + 'T00:00:00Z').getUTCDay();
            const cls = ['dp-day', d === selected ? 'on' : '', d === today ? 'today' : '', w === 6 ? 'sat' : '', w === 0 ? 'sun' : ''].join(' ');
            return `<button class="${cls}" data-d="${d}">${Number(d.slice(8))}</button>`;
          }).join('')}
        </div>
        <div class="dp-foot">
          <button class="dp-btn" data-d="${today}">今日</button>
          <button class="dp-btn ghost" data-close>閉じる</button>
        </div>
      </div>`;
    requestAnimationFrame(() => el.classList.add('show'));
  };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-d],[data-mv],[data-close]');
    if (!t) return;
    if (t.dataset.mv) { month = addMonths(month, Number(t.dataset.mv)); render(); return; }
    if (t.dataset.d) { const d = t.dataset.d; closeDatePicker(); onPick(d); return; }
    closeDatePicker();
  });
  // 横スワイプで月を移動
  let sx = null;
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) > 60) { month = addMonths(month, dx < 0 ? 1 : -1); render(); }
  });
  render();
}

export function closeDatePicker() {
  const el = document.getElementById('date-sheet');
  if (el) el.remove();
  document.body.classList.remove('sheet-open');
}

window.addEventListener('hashchange', closeDatePicker);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDatePicker(); });
