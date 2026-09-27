// バックアップと復元: プレイリスト・お気に入り・季節の設定・曲情報の編集・歌詞・設定を、1つのファイル(JSON)に書き出す/読み込む
// 曲のファイル(音声)は含めない。曲は「ファイル名_サイズ_更新日時」(sourceKey)で照合するので、曲を取り込み直したあとでも戻せる
const Backup = (() => {
  const FORMAT = 'MyMusicBackup';
  // 曲ごとに保存する項目(曲のファイル・ジャケット画像・曲の長さなどは、ファイルから読み直せるので含めない)
  const TRACK_FIELDS = ['title', 'artist', 'album', 'genre', 'year', 'titleSort', 'artistSort', 'albumSort',
    'favorite', 'season', 'playCount', 'lastPlayedAt', 'lyricOffset', 'gainDb', 'lyrics', 'syncedLyrics', 'lyricsDurationMatched'];
  const nameSize = (key) => String(key).replace(/_\d+$/, ''); // 更新日時だけが違うとき(コピーし直したファイル)でも照合できるように

  function build() {
    const idToKey = new Map(tracks.filter(t => t.sourceKey).map(t => [t.id, t.sourceKey]));
    const sortedPl = playlists.slice().sort((a, b) => a.id - b.id);
    const plIndex = new Map(sortedPl.map((p, i) => [p.id, i]));
    let order = [];
    try { order = JSON.parse(localStorage.getItem(PLAYLIST_ORDER_KEY)) || []; } catch (e) { /* 並びが無ければ標準の並び */ }
    order = order
      .map(k => (k.startsWith('pl:') ? (plIndex.has(Number(k.slice(3))) ? 'pl:' + plIndex.get(Number(k.slice(3))) : null) : k))
      .filter(Boolean);
    const settings = Settings.getAll();
    const seasonOrders = {};
    Object.entries(settings.seasonOrders || {}).forEach(([season, ids]) => {
      seasonOrders[season] = ids.map(id => idToKey.get(id)).filter(Boolean);
    });
    settings.seasonOrders = seasonOrders;
    return {
      format: FORMAT,
      version: 1,
      appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
      exportedAt: new Date().toISOString(),
      settings,
      playlistOrder: order,
      playlists: sortedPl.map(p => ({
        name: p.name,
        createdAt: p.createdAt,
        keys: p.trackIds.map(id => idToKey.get(id)).filter(Boolean),
      })),
      tracks: tracks.filter(t => t.sourceKey).map((t) => {
        const o = { key: t.sourceKey };
        TRACK_FIELDS.forEach((f) => { if (t[f] !== undefined && t[f] !== null && t[f] !== '') o[f] = t[f]; });
        return o;
      }),
    };
  }

  // 書き出し: iPhoneでは共有シート(「ファイルに保存」など)を、それが無い環境では、ダウンロードを使う
  async function exportFile() {
    const data = build();
    const json = JSON.stringify(data);
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File([json], `Myミュージック-バックアップ-${stamp}.json`, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Myミュージックのバックアップ' });
        return { ok: true, tracks: data.tracks.length, playlists: data.playlists.length };
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, cancelled: true }; // 共有シートを閉じただけ
      console.error('共有に失敗。ダウンロードに切り替えます:', err);
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { ok: true, tracks: data.tracks.length, playlists: data.playlists.length };
  }

  function parse(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('ファイルを読めませんでした(バックアップのファイルではありません)'); }
    if (!data || data.format !== FORMAT || !Array.isArray(data.tracks) || !Array.isArray(data.playlists)) {
      throw new Error('Myミュージックのバックアップファイルではありません');
    }
    return data;
  }

  // 復元。現在のプレイリストは、バックアップの内容に置き換える。曲のファイルは触らない
  async function restore(data) {
    const byKey = new Map();
    const byName = new Map();
    tracks.forEach((t) => { if (t.sourceKey) { byKey.set(t.sourceKey, t); byName.set(nameSize(t.sourceKey), t); } });
    const find = (key) => byKey.get(key) || byName.get(nameSize(key));

    let matched = 0;
    for (const bt of data.tracks) {
      const t = find(bt.key);
      if (!t) continue;
      TRACK_FIELDS.forEach((f) => { if (bt[f] !== undefined) t[f] = bt[f]; });
      t.readingsScanned = true; // 読みは、バックアップの内容を優先する
      await DB.updateTrack(t);
      matched++;
    }
    if (data.tracks.length > 0 && matched === 0) {
      throw new Error('バックアップの曲が、今のライブラリに1曲も見つかりません。先に、曲のファイルを取り込んでから復元してください');
    }

    for (const p of playlists.slice()) await DB.deletePlaylist(p.id);
    const newIds = [];
    for (const bp of data.playlists) {
      const trackIds = bp.keys.map(k => (find(k) || {}).id).filter(id => id !== undefined);
      newIds.push(await DB.addPlaylist({ name: bp.name, trackIds, createdAt: bp.createdAt || Date.now() }));
    }
    try {
      const order = (data.playlistOrder || []).map(k => (k.startsWith('pl:') ? (newIds[Number(k.slice(3))] !== undefined ? 'pl:' + newIds[Number(k.slice(3))] : null) : k)).filter(Boolean);
      localStorage.setItem(PLAYLIST_ORDER_KEY, JSON.stringify(order));
    } catch (e) { /* 並びは標準に戻る */ }

    const settings = { ...(data.settings || {}) };
    const seasonOrders = {};
    Object.entries(settings.seasonOrders || {}).forEach(([season, keys]) => {
      seasonOrders[season] = keys.map(k => (find(k) || {}).id).filter(id => id !== undefined);
    });
    settings.seasonOrders = seasonOrders;
    Settings.setAll(settings);
    return { matched, total: data.tracks.length, playlists: data.playlists.length };
  }

  return { build, exportFile, parse, restore };
})();
