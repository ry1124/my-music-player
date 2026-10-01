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

  // ---- 音量をそろえた音声ファイルを作る(鳴らしながらではなく、事前に1回だけ波形を加工する) ----
  async function decode(blob) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) throw new Error('この端末では処理できません');
    const probe = new AC(1, 1, 44100); // decodeAudioDataのためだけに使う(実際の長さ・chはファイルの中身で決まる)
    return probe.decodeAudioData(await blob.arrayBuffer());
  }

  // Float32(-1〜1)の音をInt16のPCMに変換する(MP3エンコーダに渡す形式)
  function toInt16(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  const MP3_KBPS = 160;
  function encodeMp3(buf) {
    const ch = Math.min(2, buf.numberOfChannels);
    const encoder = new lamejs.Mp3Encoder(ch, buf.sampleRate, MP3_KBPS);
    const left = toInt16(buf.getChannelData(0));
    const right = ch > 1 ? toInt16(buf.getChannelData(1)) : null;
    const block = 1152; // lamejsが1回に受け取れる単位
    const chunks = [];
    for (let i = 0; i < left.length; i += block) {
      const l = left.subarray(i, i + block);
      const r = right ? right.subarray(i, i + block) : undefined;
      const part = right ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
      if (part.length > 0) chunks.push(part);
    }
    const end = encoder.flush();
    if (end.length > 0) chunks.push(end);
    return new Blob(chunks, { type: 'audio/mpeg' });
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

  return { analyze, detectLeadSilence, renderNormalized };
})();
