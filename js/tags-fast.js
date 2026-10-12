// 取り込みを速くするための、MP3の高速な読み取り(jsmediatagsを使わず、ID3v2タグを自前で1回だけ読む)
//  ・文字の情報(曲名・アーティスト・アルバム・ジャンル・年・並び替え用の読み・歌詞): フレームを直接デコードする
//  ・ジャケット画像: ID3v2タグから、画像部分だけを直接取り出す
//  ・曲の長さ: MP3のヘッダから計算する(audio要素で読み込むより、はるかに速い)
// 読めない形式(未同期化タグ・ID3v2以外など)のときは null を返す → 呼び出し側が、jsmediatags/audio要素に切り替える
const FastTags = (() => {
  const syncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
  const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const isId3 = (h) => h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33;
  // WAV: "RIFF"(4) + ファイル全体のサイズ(4) + "WAVE"(4) で始まる
  const isRiffWave = (h) => h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46
    && h[8] === 0x57 && h[9] === 0x41 && h[10] === 0x56 && h[11] === 0x45;

  async function readHead(file) {
    return new Uint8Array(await file.slice(0, 10).arrayBuffer());
  }

  // 文字コードの変換(対応していない端末では、コンストラクタが例外を投げるので、呼び出し側でtry/catchする)
  const DECODERS = {
    latin1: new TextDecoder('iso-8859-1'),
    utf16le: new TextDecoder('utf-16le'),
    utf16be: new TextDecoder('utf-16be'),
    utf8: new TextDecoder('utf-8'),
  };
  // テキストフレームの中身(エンコーディングバイトの次から)を文字列にする。NUL区切り以降(2つ目の値など)は捨てる
  function decodeText(buf, start, end, enc) {
    if (start >= end) return '';
    let s;
    if (enc === 1) { // UTF-16(BOM付き)
      if (end - start >= 2 && buf[start] === 0xff && buf[start + 1] === 0xfe) s = DECODERS.utf16le.decode(buf.subarray(start + 2, end));
      else if (end - start >= 2 && buf[start] === 0xfe && buf[start + 1] === 0xff) s = DECODERS.utf16be.decode(buf.subarray(start + 2, end));
      else s = DECODERS.utf16le.decode(buf.subarray(start, end)); // BOMが無ければLEとみなす
    } else if (enc === 2) s = DECODERS.utf16be.decode(buf.subarray(start, end)); // UTF-16BE(BOM無し、v2.4のみ)
    else if (enc === 3) s = DECODERS.utf8.decode(buf.subarray(start, end)); // UTF-8(v2.4のみ)
    else s = DECODERS.latin1.decode(buf.subarray(start, end)); // 0: ISO-8859-1
    return s.split('\u0000')[0]; // 末尾のNUL・複数値の区切り以降を切り捨てる
  }

  // ID3v2タグ(ヘッダ10バイト+本体)を直接渡して、フレームを1件ずつ渡す。読めない形式(未同期化タグなど)なら null を返す。
  // ファイル先頭のID3v2(walkFrames経由)と、WAVに埋め込まれたid3チャンクの中身(readAllWav経由)の、どちらからも使う
  function parseId3Buffer(buf, onFrame) {
    if (!isId3(buf)) return null;
    const ver = buf[3];
    const flags = buf[5];
    if (ver < 2 || ver > 4 || (flags & 0x80)) return null; // 未同期化タグは、複雑なので従来の方法に任せる
    const total = Math.min(10 + syncsafe(buf, 6), buf.length);
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
      const ds = pos + hdrLen;
      const end = ds + size;
      if (end > total || size <= 0) break; // サイズがおかしければ、それ以上は読めないので打ち切る
      // 圧縮・暗号化のフレームは扱わない。グループ化の識別子・データ長の指示子(付いていれば)は、このあと読み飛ばす。
      // v2.4のフレーム単位の非同期化(付いていれば)は、このあと解除する ― これを解除しないと、画像(JPEG等は0xFFを多用する)が壊れて見えることがある
      const unsupported = ver === 4 ? (fflags & 0x0c) : ver === 3 ? (fflags & 0xc0) : false;
      if (!unsupported) {
        let body = buf.subarray(ds, end);
        if (ver === 4 && (fflags & 0x02)) body = deUnsyncFrame(body);
        let bs = 0;
        if (ver === 4 && (fflags & 0x40)) bs += 1; // グループ化の識別子(1バイト)
        if (ver === 3 && (fflags & 0x20)) bs += 1; // グループ化の識別子(1バイト、v2.3)
        if (ver === 4 && (fflags & 0x01)) bs += 4; // データ長の指示子(4バイト)
        onFrame(id, body, bs, body.length, ver);
      }
      pos = end;
    }
    return buf;
  }

  // ファイル先頭のID3v2ヘッダ+タグ本体を読み込む版(MP3など)。読めない形式なら null を返す
  async function walkFrames(file, onFrame) {
    const head = await readHead(file);
    if (!isId3(head)) return null;
    const total = 10 + syncsafe(head, 6);
    if (total > file.size) return null;
    const buf = new Uint8Array(await file.slice(0, total).arrayBuffer());
    return parseId3Buffer(buf, onFrame);
  }

  // フレーム単位の非同期化(ID3v2.4)の解除: 0xFFの直後にある0x00を取り除く
  function deUnsyncFrame(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i++) {
      out.push(bytes[i]);
      if (bytes[i] === 0xff && bytes[i + 1] === 0x00) i++;
    }
    return new Uint8Array(out);
  }

  // ID3v2 のジャケット画像だけを { blob } で返す(歌詞などファイル種別の判定用に、今も単独で使う場面がある)
  async function readPicture(file) {
    let result = null;
    const ok = await walkFrames(file, (id, buf, ds, end, ver) => {
      if (result || (id !== 'APIC' && id !== 'PIC')) return;
      result = parsePicture(buf, ds, end, ver);
    });
    if (ok === null) return null;
    return result || { blob: null };
  }

  function parsePicture(buf, ds, end, ver) {
    const enc = buf[ds];
    let p = ds + 1;
    let mime;
    if (ver === 2) {
      mime = String.fromCharCode(...buf.subarray(p, p + 3)).toUpperCase() === 'PNG' ? 'image/png' : 'image/jpeg';
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

  // 歌詞(USLT/ULT)フレーム: エンコーディング(1)+言語(3、読み飛ばす)+短い説明(NUL終端)+歌詞本文
  function parseLyricsFrame(buf, ds, end, ver) {
    const enc = buf[ds];
    let p = ds + 4; // エンコーディング1 + 言語3
    if (enc === 1 || enc === 2) { while (p + 1 < end && !(buf[p] === 0 && buf[p + 1] === 0)) p += 2; p += 2; }
    else { while (p < end && buf[p] !== 0) p++; p++; }
    return decodeText(buf, Math.min(p, end), end, enc);
  }

  const ID3_TEXT_MAP = { // ID3v2.2(3文字) / v2.3・v2.4(4文字)の両方に対応
    TT2: 'title', TIT2: 'title',
    TP1: 'artist', TPE1: 'artist',
    TAL: 'album', TALB: 'album',
    TCO: 'genre', TCON: 'genre',
    TYE: 'year', TYER: 'year', TDRC: 'year', TDOR: 'year', TDRL: 'year', TORY: 'year',
    TST: 'TSOT', TSOT: 'TSOT',
    TSP: 'TSOP', TSOP: 'TSOP',
    TSA: 'TSOA', TSOA: 'TSOA',
  };
  // ID3v2タグ本体(buf)から、曲名・アーティスト等・歌詞・ジャケット画像をまとめて取り出す。ID3として読めなければ null
  function collectId3Tags(buf) {
    const tags = {};
    let artworkBlob = null;
    const ok = parseId3Buffer(buf, (id, b, ds, end, ver) => {
      if (id === 'APIC' || id === 'PIC') {
        if (!artworkBlob) artworkBlob = parsePicture(b, ds, end, ver).blob;
        return;
      }
      if (id === 'USLT' || id === 'ULT') {
        if (!tags.lyrics) tags.lyrics = parseLyricsFrame(b, ds, end, ver);
        return;
      }
      const field = ID3_TEXT_MAP[id];
      if (!field || tags[field]) return; // 同じ項目が複数あれば、先に見つかった方を使う
      const enc = b[ds];
      const text = decodeText(b, ds + 1, end, enc);
      if (text) tags[field] = text;
    });
    if (ok === null) return null;
    return { tags, artworkBlob };
  }

  // WAV(RIFF/WAVE)ファイル用: 中のチャンクを頭から順にたどり、
  //  ・id3チャンク(ffmpeg/Audacity等で書き出すと付くことがある)があれば、ID3v2として読む(画像・歌詞も読める)
  //  ・無ければ、LIST/INFOチャンク(簡易な項目名=値の組)から曲名・アーティスト等だけ読む
  // どちらも無ければ null(呼び出し側は、タグ無しの曲として扱う)
  const RIFF_INFO_MAP = { INAM: 'title', IART: 'artist', IPRD: 'album', IGNR: 'genre', ICRD: 'year' };
  function parseRiffInfo(body) {
    const tags = {};
    let p = 0;
    while (p + 8 <= body.length) {
      const id = String.fromCharCode(...body.subarray(p, p + 4));
      const size = (body[p + 4] | (body[p + 5] << 8) | (body[p + 6] << 16) | (body[p + 7] << 24)) >>> 0;
      const ds = p + 8;
      const end = ds + size;
      if (end > body.length) break; // サイズがおかしければ打ち切る
      const field = RIFF_INFO_MAP[id];
      if (field && !tags[field]) {
        const text = DECODERS.utf8.decode(body.subarray(ds, end)).replace(/\u0000+$/, '').trim();
        if (text) tags[field] = text;
      }
      p = end + (size % 2); // チャンクは偶数バイト境界に揃う
    }
    if (tags.year) { const m = tags.year.match(/\d{4}/); tags.year = m ? m[0] : ''; }
    return tags;
  }
  async function readAllWav(file) {
    let offset = 12; // "RIFF"+サイズ(4)+"WAVE" の次からチャンクが並ぶ
    let infoTags = null;
    for (let i = 0; i < 10000 && offset + 8 <= file.size; i++) { // 壊れたファイルで無限ループしないための保険
      const h = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      const chunkId = String.fromCharCode(h[0], h[1], h[2], h[3]);
      const size = (h[4] | (h[5] << 8) | (h[6] << 16) | (h[7] << 24)) >>> 0;
      const bodyStart = offset + 8;
      if (bodyStart + size > file.size) break; // サイズがおかしければ打ち切る
      if (chunkId.toLowerCase().startsWith('id3')) {
        const buf = new Uint8Array(await file.slice(bodyStart, bodyStart + size).arrayBuffer());
        const r = collectId3Tags(buf);
        if (r) return r; // id3チャンクがあれば、それを優先して使う
      } else if (chunkId === 'LIST' && size >= 4) {
        const listType = new Uint8Array(await file.slice(bodyStart, bodyStart + 4).arrayBuffer());
        if (String.fromCharCode(...listType) === 'INFO') {
          const body = new Uint8Array(await file.slice(bodyStart + 4, bodyStart + size).arrayBuffer());
          infoTags = parseRiffInfo(body);
        }
      }
      offset = bodyStart + size + (size % 2);
    }
    // WAVと分かった時点で、タグが無くてもこの結果を使う(jsmediatagsはWAVに対応していないため、呼んでも無駄になる)
    return { tags: infoTags || {}, artworkBlob: null };
  }

  // 曲名・アーティスト等・並び替え用の読み・歌詞・ジャケット画像を、まとめて1回の読み込みで取り出す
  // 戻り値の tags は、今までの jsmediatags 版と同じ形(title/artist/album/genre/year/TSOT/TSOP/TSOA/lyrics が、いずれも文字列)で返す
  async function readAll(file) {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (isId3(head)) {
      const total = 10 + syncsafe(head, 6);
      if (total > file.size) return null;
      const buf = new Uint8Array(await file.slice(0, total).arrayBuffer());
      return collectId3Tags(buf);
    }
    if (isRiffWave(head)) return readAllWav(file);
    return null;
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

  return { readPicture, readAll, mp3Duration };
})();
