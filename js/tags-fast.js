// 取り込みを速くするための、MP3の高速な読み取り
//  ・ジャケット画像: ID3v2タグから、画像部分だけを直接取り出す(jsmediatagsで画像まで解析すると、1曲あたり数倍かかる)
//  ・曲の長さ: MP3のヘッダから計算する(audio要素で読み込むより、はるかに速い)
// どちらも、読めない形式のときは null を返す → 呼び出し側が、今までの方法に切り替える
const FastTags = (() => {
  const syncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
  const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const isId3 = (h) => h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33;

  async function readHead(file) {
    return new Uint8Array(await file.slice(0, 10).arrayBuffer());
  }

  // ID3v2 のジャケット画像を { blob } で返す。画像が無ければ { blob: null }。仕組み上読めないとき(未同期化など)は null
  async function readPicture(file) {
    const head = await readHead(file);
    if (!isId3(head)) return null;
    const ver = head[3];
    const flags = head[5];
    if (ver < 2 || ver > 4 || (flags & 0x80)) return null; // 未同期化タグは、複雑なので従来の方法に任せる
    const total = 10 + syncsafe(head, 6);
    if (total > file.size) return null;
    const buf = new Uint8Array(await file.slice(0, total).arrayBuffer());
    let pos = 10;
    if (flags & 0x40) pos += ver === 4 ? syncsafe(buf, pos) : 4 + be32(buf, pos); // 拡張ヘッダ
    const idLen = ver === 2 ? 3 : 4;
    const hdrLen = ver === 2 ? 6 : 10;
    while (pos + hdrLen <= total) {
      if (buf[pos] === 0) break; // ここから先は空き(パディング)
      const id = String.fromCharCode(...buf.subarray(pos, pos + idLen));
      const size = ver === 2 ? (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5]
        : ver === 4 ? syncsafe(buf, pos + 4) : be32(buf, pos + 4);
      const fflags = ver === 2 ? 0 : (buf[pos + 8] << 8) | buf[pos + 9];
      let ds = pos + hdrLen;
      const end = ds + size;
      if (end > total || size <= 0) return null;
      if (id === 'APIC' || id === 'PIC') {
        if (ver === 4 && (fflags & 0x0d)) return null; // 圧縮・暗号化・未同期化されたフレームは扱わない
        if (ver === 3 && (fflags & 0x00e0)) return null;
        if (ver === 4 && (fflags & 0x01)) ds += 4; // データ長の指示子
        const enc = buf[ds];
        let p = ds + 1;
        let mime;
        if (ver === 2) {
          const fmt = String.fromCharCode(...buf.subarray(p, p + 3)).toUpperCase();
          mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
          p += 3;
        } else {
          const s = p;
          while (p < end && buf[p] !== 0) p++;
          mime = String.fromCharCode(...buf.subarray(s, p)) || 'image/jpeg';
          p++;
          if (mime === 'image/jpg') mime = 'image/jpeg';
        }
        p++; // 画像の種類(表紙など)
        if (enc === 1 || enc === 2) { while (p + 1 < end && !(buf[p] === 0 && buf[p + 1] === 0)) p += 2; p += 2; } // 説明文(UTF-16)
        else { while (p < end && buf[p] !== 0) p++; p++; } // 説明文
        if (p >= end) return { blob: null };
        return { blob: new Blob([buf.subarray(p, end)], { type: mime }) };
      }
      pos = end;
    }
    return { blob: null };
  }

  // ---- MP3の長さ ----
  const BITRATES = {
    '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  };
  const SAMPLE_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

  function parseFrameHeader(b, i) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
    const vBits = (b[i + 1] >> 3) & 3; // 3: MPEG1 / 2: MPEG2 / 0: MPEG2.5
    const layerBits = (b[i + 1] >> 1) & 3; // 1: Layer3 / 2: Layer2
    const brIdx = b[i + 2] >> 4;
    const srIdx = (b[i + 2] >> 2) & 3;
    if (vBits === 1 || (layerBits !== 1 && layerBits !== 2) || brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
    const mpeg = vBits === 3 ? 1 : vBits === 2 ? 2 : 25;
    const layer = layerBits === 1 ? 3 : 2;
    const bitrate = BITRATES[`${mpeg === 1 ? 1 : 2}-${layer}`][brIdx] * 1000;
    const sampleRate = SAMPLE_RATES[mpeg][srIdx];
    const padding = (b[i + 2] >> 1) & 1;
    const mono = (b[i + 3] >> 6) === 3;
    const spf = layer === 3 ? (mpeg === 1 ? 1152 : 576) : 1152;
    const frameLen = layer === 3 ? Math.floor(((mpeg === 1 ? 144 : 72) * bitrate) / sampleRate) + padding : Math.floor((144 * bitrate) / sampleRate) + padding;
    return { mpeg, layer, bitrate, sampleRate, mono, spf, frameLen };
  }

  // 秒数を返す。MP3として読めなければ null
  async function mp3Duration(file) {
    const head = await readHead(file);
    let start = 0;
    if (isId3(head)) start = 10 + syncsafe(head, 6) + ((head[5] & 0x10) ? 10 : 0);
    else if (!(head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return null; // MP3ではなさそう
    if (start >= file.size) return null;
    const b = new Uint8Array(await file.slice(start, start + 16384).arrayBuffer());
    for (let i = 0; i + 4 < b.length; i++) {
      const h = parseFrameHeader(b, i);
      if (!h) continue;
      const next = i + h.frameLen; // 次のフレームの先頭も、フレームの形をしているか(偶然の一致を除く)
      if (next + 4 < b.length && !parseFrameHeader(b, next)) continue;
      // VBR/Xing ヘッダがあれば、フレーム数から正確に求める
      const side = h.mpeg === 1 ? (h.mono ? 17 : 32) : (h.mono ? 9 : 17);
      const x = i + 4 + side;
      const tag = String.fromCharCode(...b.subarray(x, x + 4));
      let frames = 0;
      if ((tag === 'Xing' || tag === 'Info') && (b[x + 7] & 1)) frames = be32(b, x + 8);
      else if (String.fromCharCode(...b.subarray(i + 36, i + 40)) === 'VBRI') frames = be32(b, i + 14);
      let sec;
      if (frames > 0) sec = (frames * h.spf) / h.sampleRate;
      else sec = ((file.size - start - i) * 8) / h.bitrate; // 固定ビットレートとして、大きさから求める
      return sec > 0 && sec < 36000 ? sec : null;
    }
    return null;
  }

  return { readPicture, mp3Duration };
})();
