// 音声の特別な処理(設定でオンにしたときだけ使う): 音量の自動そろえ / ギャップレス / クロスフェード
// 「audio要素 → 曲ごとの音量 → 重ね具合(フェード) → 全体 → スピーカー」の順につなぐ。
// オフのときは何もつながないので、今までどおりの再生のまま
const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  const chains = new Map(); // audio要素 → { trackGain, fadeGain }

  const needed = () => !!Settings.get('soundCheck') || Settings.get('joint') !== 'off';

  // 使えるようにする。できなければ false
  function ensure(elements) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.connect(ctx.destination);
      }
      elements.forEach((el) => {
        if (chains.has(el)) return;
        const src = ctx.createMediaElementSource(el);
        const trackGain = ctx.createGain();
        const fadeGain = ctx.createGain();
        src.connect(trackGain);
        trackGain.connect(fadeGain);
        fadeGain.connect(master);
        chains.set(el, { trackGain, fadeGain });
      });
    } catch (e) {
      console.error('音声処理の準備に失敗:', e);
      return false;
    }
    return true;
  }

  // 端末によっては、画面を触った直後でないと、音声処理が動き出さない(ロックや電話のあとも止まることがある)
  function resume() {
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  const ready = (el) => chains.has(el);

  // 曲ごとの音量(dB)。音量の自動そろえがオフなら 0
  function setTrackGainDb(el, db) {
    const c = chains.get(el);
    if (c) c.trackGain.gain.value = Math.pow(10, (db || 0) / 20);
  }

  // フェードの曲線: 音の大きさが落ち込まないよう、等パワー(sin / cos)にする
  function curve(up) {
    const n = 64;
    const arr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      arr[i] = up ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2);
    }
    return arr;
  }
  function fade(el, up, sec) {
    const c = chains.get(el);
    if (!c) return;
    const g = c.fadeGain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    if (sec <= 0.001) { g.setValueAtTime(up ? 1 : 0, now); return; }
    g.setValueAtTime(up ? 0 : 1, now);
    g.setValueCurveAtTime(curve(up), now, sec);
  }
  function setFade(el, value) {
    const c = chains.get(el);
    if (!c) return;
    c.fadeGain.gain.cancelScheduledValues(ctx.currentTime);
    c.fadeGain.gain.setValueAtTime(value, ctx.currentTime);
  }

  // ---- 音量の解析(耳で感じる音量に近い値を、曲ごとに1回だけ求めて保存する) ----
  const TARGET_DB = -16; // そろえる先の音量(RMS, dBFS)
  async function analyze(blob) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) throw new Error('解析に対応していません');
    const off = new AC(1, 22050, 22050); // 22.05kHzに落として読み込む(メモリを抑える)
    const buf = await off.decodeAudioData(await blob.arrayBuffer());
    const chs = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    const block = Math.max(1, Math.floor(buf.sampleRate * 0.4)); // 0.4秒ごとに区切って、音量を測る
    const energies = [];
    let peak = 0;
    for (let start = 0; start < buf.length; start += block) {
      const end = Math.min(buf.length, start + block);
      let sum = 0;
      for (const ch of chs) {
        for (let i = start; i < end; i++) {
          const v = ch[i];
          sum += v * v;
          const a = v < 0 ? -v : v;
          if (a > peak) peak = a;
        }
      }
      energies.push(sum / ((end - start) * chs.length));
    }
    // ほぼ無音の区間を除き、さらに平均より10dB以上小さい区間(曲の静かな部分)も除いた平均で、曲の音量とする
    const toDb = (e) => 10 * Math.log10(e || 1e-12);
    let kept = energies.filter(e => toDb(e) > -60);
    if (kept.length === 0) return { gainDb: 0 };
    let mean = kept.reduce((a, b) => a + b, 0) / kept.length;
    kept = kept.filter(e => toDb(e) > toDb(mean) - 10);
    if (kept.length > 0) mean = kept.reduce((a, b) => a + b, 0) / kept.length;
    let gain = TARGET_DB - toDb(mean);
    gain = Math.max(-15, Math.min(9, gain));
    const peakDb = 20 * Math.log10(peak || 1e-6);
    gain = Math.min(gain, -peakDb - 0.5); // 音が割れないよう、ピークが0dBを超える上げ方はしない
    return { gainDb: Math.round(gain * 10) / 10 };
  }

  // ---- 曲の頭の無音の長さ(秒)を検出する。歌詞のタイミング調整の目安に使う ----
  // 無音かどうかは、曲全体の音量から相対的に決める(曲によって元の音量がまちまちなため)
  async function detectLeadSilence(blob, maxSeconds = 30) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) throw new Error('この端末では検出できません');
    const off = new AC(1, 1, 11025); // 長さは使わない(decodeAudioDataは全体を読み込む)。サンプルレートは検出に十分な粗さに落とす
    const buf = await off.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const hop = Math.max(1, Math.round(sr * 0.02)); // 20msごとの区間
    const limit = Math.min(data.length, Math.round(sr * maxSeconds));
    const db = [];
    for (let i = 0; i + hop <= limit; i += hop) {
      let sum = 0;
      for (let j = i; j < i + hop; j++) sum += data[j] * data[j];
      db.push(20 * Math.log10(Math.sqrt(sum / hop) || 1e-8));
    }
    if (db.length === 0) return 0;
    // 「無音」の基準の音量は、曲のいちばん最初(約0.3秒)から決める。曲全体に対する割合では決めない
    // (曲全体の何割かで決めると、無音の長さが、たまたまその割合に近いときに、正しく検出できないため)
    const calibN = Math.min(db.length, 15);
    const calib = db.slice(0, calibN).slice().sort((a, b) => a - b);
    const floor = calib[Math.floor(calib.length / 2)]; // 最初の約0.3秒の、中央値
    const threshold = floor + 12; // そこから12dB大きい音が鳴ったら「始まった」とみなす
    const sustain = 4; // 4区間(約80ms)続けて超えたときだけ採用する(ノイズやクリック音を除く)
    for (let i = 0; i + sustain <= db.length; i++) {
      if (db.slice(i, i + sustain).every(v => v > threshold)) return (i * hop) / sr;
    }
    return 0;
  }

  return { needed, ensure, resume, ready, setTrackGainDb, fade, setFade, analyze, detectLeadSilence };
})();
