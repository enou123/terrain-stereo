const steps = [
  { target: '#place-picker', title: '見たい場所を探す', text: '地図を動かして中央の＋を合わせるか、山の名前から選びます。選んだ範囲を「ここを立体表示」で読み込みます。', position: 'top' },
  { target: '#show-terrain', title: '場所を3Dで表示', text: '標高データを読み込むと、選んだ場所の尾根や谷が立体になります。最初は石鎚山周辺が表示されています。', position: 'top' },
  { target: '#terrain', title: '地形を自由に眺める', text: 'ドラッグで回転、ホイールやピンチでズーム。高さ強調を調整すると、なだらかな起伏も見つけやすくなります。', position: 'top' },
  { target: '#view-mode', title: '立体視でも楽しむ', text: '通常3Dに加えて、平行法・交差法・赤シアンの立体視に切り替えられます。立体感の強さも調整できます。', position: 'bottom' },
  { target: '#exaggeration', title: '起伏の見え方を調整', text: '高さ強調を上げると小さな尾根や谷が見やすくなります。1.0×は水平距離と高さが実際と同じ比率です。', position: 'bottom' },
  { target: '#surface', title: '地形の表情を切り替える', text: '標高の色や陰影のほか、地理院地図・航空写真・地質図を重ねて見比べられます。', position: 'bottom' },
  { target: '#contours', title: '等高線で高さを読む', text: 'チェックを入れると、実際の標高100 m間隔の線が地形に重なります。', position: 'bottom' },
  { target: '#profile-start', title: '地形を断面で見る', text: '「2点を選ぶ」を押して地形上の始点と終点を指定すると、その間の標高断面が表示されます。', position: 'top' },
  { target: '#flight-toggle', title: '地形の上を遊覧する', text: '「移動」から手動移動や約32秒の遊覧飛行を試せます。遊覧中もいつでも停止できます。', position: 'bottom' },
  { target: '#share-view', title: '見つけた景色を共有', text: '場所や視点、表示設定をリンクで共有できます。PNGで今の地形画像を保存することもできます。', position: 'bottom' },
];

export function setupAppTour() {
  const launch = document.querySelector('#start-app-tour');
  if (!launch) return;
  const scrim = document.createElement('div');
  scrim.className = 'app-tour-scrim';
  scrim.hidden = true;
  scrim.innerHTML = `<div class="app-tour-spotlight" aria-hidden="true"></div><section class="app-tour-card" role="dialog" aria-modal="true" aria-labelledby="app-tour-title" aria-describedby="app-tour-copy"><div class="app-tour-kicker"></div><button class="app-tour-close" type="button" aria-label="ツアーを閉じる">×</button><h2 id="app-tour-title"></h2><p id="app-tour-copy"></p><div class="app-tour-footer"><span class="app-tour-progress"></span><div><button class="app-tour-back" type="button">戻る</button><button class="app-tour-next" type="button">次へ</button></div></div></section>`;
  document.body.append(scrim);
  const spotlight = scrim.querySelector('.app-tour-spotlight');
  const card = scrim.querySelector('.app-tour-card');
  const title = scrim.querySelector('#app-tour-title');
  const copy = scrim.querySelector('#app-tour-copy');
  const kicker = scrim.querySelector('.app-tour-kicker');
  const progress = scrim.querySelector('.app-tour-progress');
  const back = scrim.querySelector('.app-tour-back');
  const next = scrim.querySelector('.app-tour-next');
  let index = 0, active = false, previousFocus, settingsWereClosed, flightWasClosed;

  function position() {
    if (!active) return;
    const target = document.querySelector(steps[index].target);
    if (!target || target.getClientRects().length === 0) return;
    const rect = target.getBoundingClientRect();
    const pad = 7;
    spotlight.style.left = `${Math.max(8, rect.left - pad)}px`;
    spotlight.style.top = `${Math.max(8, rect.top - pad)}px`;
    spotlight.style.width = `${Math.min(innerWidth - 16, rect.width + pad * 2)}px`;
    spotlight.style.height = `${Math.min(innerHeight - 16, rect.height + pad * 2)}px`;
    spotlight.style.borderRadius = getComputedStyle(target).borderRadius || '10px';
    card.classList.toggle('is-above', steps[index].position === 'top');
  }
  function render() {
    const step = steps[index];
    const target = document.querySelector(step.target);
    if (!target) return;
    step.before?.();
    if (step.target === '#flight-toggle' && document.querySelector('#flight-pad').hidden) document.querySelector('#flight-toggle').click();
    if (step.target === '#share-view' || step.target === '#surface' || step.target === '#contours' || step.target === '#profile-start' || step.target === '#view-mode' || step.target === '#exaggeration')
      if (document.querySelector('#view-settings').hidden) document.querySelector('#toggle-settings').click();
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
    title.textContent = step.title;
    copy.textContent = step.text;
    kicker.textContent = `地形探訪ガイド · ${String(index + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`;
    progress.textContent = `${index + 1} / ${steps.length}`;
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? '完了' : '次へ';
    card.setAttribute('aria-label', `${step.title}、${index + 1} / ${steps.length}`);
    requestAnimationFrame(position);
  }
  function close() {
    if (!active) return;
    active = false;
    scrim.hidden = true;
    document.body.classList.remove('app-tour-active');
    window.removeEventListener('scroll', position, true);
    window.removeEventListener('resize', position);
    if (settingsWereClosed && !document.querySelector('#view-settings').hidden) document.querySelector('#toggle-settings').click();
    if (flightWasClosed && !document.querySelector('#flight-pad').hidden) document.querySelector('#flight-toggle').click();
    previousFocus?.focus({ preventScroll: true });
  }
  function start() {
    if (active) return;
    active = true; index = 0; previousFocus = document.activeElement;
    settingsWereClosed = document.querySelector('#view-settings').hidden;
    flightWasClosed = document.querySelector('#flight-pad').hidden;
    scrim.hidden = false;
    document.body.classList.add('app-tour-active');
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    render();
    scrim.querySelector('.app-tour-close').focus();
  }
  launch.addEventListener('click', start);
  scrim.querySelector('.app-tour-close').addEventListener('click', close);
  back.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  next.addEventListener('click', () => { if (index === steps.length - 1) close(); else { index++; render(); } });
  scrim.addEventListener('click', event => { if (event.target === scrim) close(); });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'ArrowRight' && index < steps.length - 1) { index++; render(); }
    if (event.key === 'ArrowLeft' && index > 0) { index--; render(); }
    if (event.key === 'Tab') {
      const controls = [...card.querySelectorAll('button:not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}
