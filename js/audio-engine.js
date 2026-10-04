// 音声の特別な処理: 音量の自動そろえ / ギャップレス / クロスフェード
// 注意: 生のAudioContextに通して「鳴らしながら」加工する方式は、iPhoneでロック画面にすると
// AudioContextごと止められて無音になってしまう(PWAの既知の制限)。そのため、音量の自動そろえは
// 曲を読み込むときに1回だけ波形そのものを加工したファイルを作って保存し、鳴らすときは普通の
// <audio>のまま再生する(ロック中も途切れない)。クロスフェードのフェードも、AudioContextの
// GainNodeではなく、<audio>のvolumeを直接動かして作る(app.js側)
const AudioEngine = (() => {
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

  // ---- 音が鳴っている区間を大まかに検出する(歌詞のタイミング自動推定に使う) ----
  // 時刻付きの歌詞が無い曲で、音量の変化からイントロ・間奏などの無音/静かな区間を飛ばして
  // 歌詞を割り振るための目安。「歌っている」までは判定できず、あくまで「音が鳴っているか」だけを見る
  async function detectActiveSegments(blob) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) throw new Error('この端末では検出できません');
    const off = new AC(1, 1, 11025);
    const buf = await off.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const hop = Math.max(1, Math.round(sr * 0.1)); // 0.1秒ごとの区間で音量を測る
    const n = Math.floor(data.length / hop);
    if (n === 0) return [];
    const db = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      const start = i * hop;
      for (let j = start; j < start + hop; j++) sum += data[j] * data[j];
      db[i] = 10 * Math.log10(sum / hop || 1e-12);
    }
    // 曲全体の音量の中央値から一定以上静かな区間を、無音/間奏とみなす
    const sorted = db.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const threshold = median - 18;
    const active = db.map(v => v > threshold);
    // 短い切り替わり(0.3秒未満)は、ノイズとして前の状態に均す
    const minRun = 3;
    for (let i = 0; i < active.length;) {
      let j = i;
      while (j < active.length && active[j] === active[i]) j++;
      if (j - i < minRun && i > 0) for (let k = i; k < j; k++) active[k] = active[i - 1];
      i = j;
    }
    const segments = [];
    let segStart = null;
    for (let i = 0; i < active.length; i++) {
      if (active[i] && segStart === null) segStart = i;
      else if (!active[i] && segStart !== null) { segments.push({ start: (segStart * hop) / sr, end: (i * hop) / sr }); segStart = null; }
    }
    if (segStart !== null) segments.push({ start: (segStart * hop) / sr, end: (active.length * hop) / sr });
    return segments;
  }

  // ---- 音量をそろえた音声ファイルを作る(鳴らしながらではなく、事前に1回だけ波形を加工する) ----
  async function decode(blob) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) throw new Error('この端末では処理できません');
    const probe = new AC(1, 1, 44100); // decodeAudioDataのためだけに使う(実際の長さ・chはファイルの中身で決まる)
    return probe.decodeAudioData(await blob.arrayBuffer());
  }

  // MP3への変換(重いので、画面が固まらないよう別スレッド(Worker)にやらせる)
  let mp3Worker = null;
  let mp3ReqId = 0;
  const mp3Pending = new Map(); // リクエストid → { resolve, reject }
  function getMp3Worker() {
    if (!mp3Worker) {
      mp3Worker = new Worker('js/mp3-worker.js');
      mp3Worker.onmessage = (e) => {
        const { id, buffer, error } = e.data;
        const p = mp3Pending.get(id);
        if (!p) return;
        mp3Pending.delete(id);
        if (error) p.reject(new Error(error));
        else p.resolve(new Blob([buffer], { type: 'audio/mpeg' }));
      };
      mp3Worker.onerror = () => {
        mp3Pending.forEach(p => p.reject(new Error('MP3への変換に失敗しました')));
        mp3Pending.clear();
        mp3Worker = null; // 次回また作り直す
      };
    }
    return mp3Worker;
  }
  function encodeMp3(buf) {
    return new Promise((resolve, reject) => {
      const w = getMp3Worker();
      const id = ++mp3ReqId;
      mp3Pending.set(id, { resolve, reject });
      const ch = Math.min(2, buf.numberOfChannels);
      const left = buf.getChannelData(0).slice(); // コピーしてから渡す(転送すると元のAudioBufferを壊すため)
      const right = ch > 1 ? buf.getChannelData(1).slice() : null;
      const transfer = right ? [left.buffer, right.buffer] : [left.buffer];
      w.postMessage({ id, left, right, sampleRate: buf.sampleRate }, transfer);
    });
  }

  // gainDb(dB)を波形に実際にかけた、新しい音声ファイル(MP3)を作って返す
  async function renderNormalized(blob, gainDb) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) throw new Error('この端末では処理できません');
    const src = await decode(blob);
    const off = new AC(src.numberOfChannels, src.length, src.sampleRate);
    const node = off.createBufferSource();
    node.buffer = src;
    const gain = off.createGain();
    gain.gain.value = Math.pow(10, (gainDb || 0) / 20);
    node.connect(gain);
    gain.connect(off.destination);
    node.start(0);
    const rendered = await off.startRendering();
    return encodeMp3(rendered);
  }

  return { analyze, detectLeadSilence, detectActiveSegments, renderNormalized };
})();
