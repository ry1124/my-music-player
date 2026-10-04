// 設定(この端末に保存)と、見た目(ライト/ダーク)の適用。画面の読み込み前に動かして、白い画面が一瞬光るのを防ぐ
const Settings = (() => {
  const KEY = 'mmSettings';
  const defaults = {
    theme: 'auto',       // 'auto'(端末に合わせる) / 'light' / 'dark'
    joint: 'off',        // 曲のつなぎ方: 'off'(通常) / 'gapless'(ギャップレス) / 'crossfade'(クロスフェード)
    crossfadeSec: 4,     // クロスフェードの長さ(秒)
    soundCheck: false,   // 音量の自動そろえ
    playbackSpeed: 1,    // 再生速度
  };
  let values = { ...defaults };
  try { Object.assign(values, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* 保存できない環境では既定値のまま */ }

  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const dark = values.theme === 'dark' || (values.theme === 'auto' && media && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#000000' : '#ffffff');
  }
  if (media && media.addEventListener) media.addEventListener('change', applyTheme);
  applyTheme();

  return {
    get: (k) => values[k],
    getAll: () => JSON.parse(JSON.stringify(values)), // バックアップ用
    setAll(obj) { // 復元用: 既定値に、渡された値を重ねて保存する
      values = { ...defaults, ...obj };
      try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* 保存できなければ、今回だけ有効 */ }
      applyTheme();
    },
    set(k, v) {
      values[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* 保存できなくても、今回の起動中は有効 */ }
      if (k === 'theme') applyTheme();
    },
  };
})();
