// 音量を調整したMP3への変換(重い処理)を、画面が固まらないよう別スレッドでやる
importScripts('lamejs.min.js');

function toInt16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

self.onmessage = (e) => {
  const { id, left, right, sampleRate } = e.data;
  try {
    const ch = right ? 2 : 1;
    const encoder = new lamejs.Mp3Encoder(ch, sampleRate, 160);
    const l16 = toInt16(left);
    const r16 = right ? toInt16(right) : null;
    const block = 1152; // lamejsが1回に受け取れる単位
    const chunks = [];
    for (let i = 0; i < l16.length; i += block) {
      const lc = l16.subarray(i, i + block);
      const rc = r16 ? r16.subarray(i, i + block) : undefined;
      const part = r16 ? encoder.encodeBuffer(lc, rc) : encoder.encodeBuffer(lc);
      if (part.length > 0) chunks.push(part);
    }
    const end = encoder.flush();
    if (end.length > 0) chunks.push(end);
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    self.postMessage({ id, buffer: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
