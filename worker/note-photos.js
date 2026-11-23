const maxNotePhotos = 6;
const maxNoteImage = 1_500_000;
const maxNoteThumbnail = 100_000;

function photoError(message, status) {
  return Response.json({ error: message }, { status, headers: noCache });
}

async function removeUnusedPhotos(env, owner, keys) {
  if (!env.BUCKET || !keys.length) return;
  try {
    const remaining = await env.DB.prepare(`SELECT DISTINCT object_key FROM note_photos
      WHERE owner=? AND object_key IN (SELECT value FROM json_each(?))`).bind(owner, JSON.stringify(keys)).all();
    const used = new Set(remaining.results.map(row => row.object_key));
    const unused = [...new Set(keys)].filter(key => !used.has(key)).flatMap(key => [key + '/full', key + '/thumb']);
    for (let start = 0; start < unused.length; start += 1000) {
      await env.BUCKET.delete(unused.slice(start, start + 1000));
    }
  } catch (error) {
    console.error('Unable to remove detached note photos', error.message);
  }
}

const photoFormats = {
  'image/jpeg': bytes => bytes[0] === 255 && bytes[1] === 216 &&
    bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217,
  'image/png': bytes => [137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte),
  'image/gif': bytes => ['GIF87a','GIF89a'].includes(String.fromCharCode(...bytes.slice(0,6))),
  'image/webp': bytes => String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8,12)) === 'WEBP'
};

async function readPhoto(file, limit, thumbnail = false) {
  validate(file instanceof Blob && Object.hasOwn(photoFormats,file.type) && file.size <= limit &&
    (!thumbnail || ['image/jpeg','image/png'].includes(file.type)), '圖片格式或大小不符');
  const bytes = new Uint8Array(await file.arrayBuffer());
  validate(bytes.length >= 4 && photoFormats[file.type](bytes), '圖片格式無效');
  return { bytes, contentType:file.type };
}

async function photoForm(request) {
  const limit = maxNoteImage + maxNoteThumbnail + 4096;
  validate(request.headers.get('content-type')?.startsWith('multipart/form-data;'), '上傳格式無效');
  validate(Number(request.headers.get('content-length')) <= limit && request.body, '上傳的照片過大');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new RequestError('上傳的照片過大');
    }
    chunks.push(value);
  }
  return new Response(new Blob(chunks), {
    headers: { 'Content-Type': request.headers.get('content-type') }
  }).formData();
}

async function uploadNotePhoto(request, env, owner, entryId, photoId) {
  const exists = await env.DB.prepare('SELECT 1 FROM note_photos WHERE owner=? AND entry_id=? AND id=?')
    .bind(owner, entryId, photoId).first();
  if (exists) return Response.json({ ok: true }, { headers: noCache });
  const form = await photoForm(request);
  const [full, thumb] = await Promise.all([
    readPhoto(form.get('full'), maxNoteImage), readPhoto(form.get('thumb'), maxNoteThumbnail, true)
  ]);
  const key = 'note-photos/' + crypto.randomUUID();
  let attached = false;
  try {
    const writes = await Promise.allSettled([
      env.BUCKET.put(key + '/full', full.bytes, {httpMetadata:{contentType:full.contentType}}),
      env.BUCKET.put(key + '/thumb', thumb.bytes, {httpMetadata:{contentType:thumb.contentType}})
    ]);
    if (writes.some(result => result.status === 'rejected')) throw new Error('照片寫入失敗');
    const result = await env.DB.prepare(`INSERT INTO note_photos(owner,entry_id,id,object_key)
      SELECT owner,id,?,? FROM entries WHERE owner=? AND id=? AND kind IN ('TASK','EVENT','NOTE')
      AND (SELECT COUNT(*) FROM note_photos WHERE owner=? AND entry_id=?) < ?
      ON CONFLICT(owner,entry_id,id) DO NOTHING`)
      .bind(photoId, key, owner, entryId, owner, entryId, maxNotePhotos).run();
    attached = result.meta.changes > 0;
    if (!attached) {
      const retry = await env.DB.prepare('SELECT 1 FROM note_photos WHERE owner=? AND entry_id=? AND id=?')
        .bind(owner, entryId, photoId).first();
      validate(retry, '每筆最多 6 張圖片，請確認筆記及圖片數量');
    }
    return Response.json({ ok: true }, { headers: noCache });
  } finally {
    // Check references even after an ambiguous database write.
    if (!attached) await removeUnusedPhotos(env, owner, [key]);
  }
}

async function handleNotePhoto(request, env, owner, entryId, photoId, size) {
  if (!owner) return photoError('請先登入', 401);
  if (![entryId, photoId].every(value => uuidPattern.test(value))) return photoError('找不到照片', 404);
  if (!env.BUCKET) return photoError('照片儲存空間暫時無法使用', 503);
  const url = new URL(request.url);
  try {
    if (request.method === 'GET' && size) {
      const photo = await env.DB.prepare('SELECT object_key FROM note_photos WHERE owner=? AND entry_id=? AND id=?')
        .bind(owner, entryId, photoId).first();
      const image = photo && await env.BUCKET.get(photo.object_key + '/' + size);
      if (!image) return photoError('找不到照片', 404);
      const contentType = image.httpMetadata?.contentType;
      return new Response(image.body, { headers: { ...noCache,
        'Content-Type': Object.hasOwn(photoFormats,contentType) ? contentType : 'image/jpeg' } });
    }
    if (size || !['PUT','DELETE'].includes(request.method)) return photoError('不支援的操作', 405);
    if (request.headers.get('origin') !== url.origin) return photoError('請從 App 內操作', 403);
    if (request.method === 'PUT') return await uploadNotePhoto(request, env, owner, entryId, photoId);

    const removed = await env.DB.prepare('DELETE FROM note_photos WHERE owner=? AND entry_id=? AND id=? RETURNING object_key')
      .bind(owner, entryId, photoId).first();
    if (removed) await removeUnusedPhotos(env, owner, [removed.object_key]);
    return Response.json({ ok: true }, { headers: noCache });
  } catch (error) {
    return error instanceof RequestError ? photoError(error.message, 400) : photoError('照片操作失敗，請稍後再試', 500);
  }
}
