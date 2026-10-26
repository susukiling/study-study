// 添付ファイルの読み込み（PDF・画像・テキスト・Word・CSV）
const MAX = 12 * 1024 * 1024;
export const ACCEPT = '.pdf,image/*,.txt,.md,.csv,.tsv,.json,.docx';

const toB64 = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('ファイルを読み込めませんでした'));
    r.readAsDataURL(blob);
  });

/** 大きい写真は長辺1800pxのJPEGに縮小（通信量と速度のため） */
async function shrinkImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    if (blob) return { mimeType: 'image/jpeg', data: await toB64(blob) };
  } catch {
    /* そのまま送る */
  }
  return { mimeType: file.type || 'image/jpeg', data: await toB64(file) };
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** .docx（zip）から本文テキストだけを取り出す */
async function docxText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let e = buf.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Wordファイルを読めませんでした');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    if (name === 'word/document.xml') {
      const ln = dv.getUint16(off + 26, true);
      const le = dv.getUint16(off + 28, true);
      const start = off + 30 + ln + le;
      const raw = buf.subarray(start, start + csize);
      const xml = new TextDecoder().decode(method === 0 ? raw : await inflateRaw(raw));
      return xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error('Wordファイルの本文が見つかりませんでした');
}

/** 戻り値: { name, kind: 'inline', mimeType, data } または { name, kind: 'text', text } */
export async function readAttachment(file) {
  if (file.size > MAX) throw new Error(`「${file.name}」は大きすぎます（12MBまで）`);
  const name = file.name;
  const ext = name.split('.').pop().toLowerCase();
  if (file.type === 'application/pdf' || ext === 'pdf') return { name, kind: 'inline', mimeType: 'application/pdf', data: await toB64(file) };
  if (file.type.startsWith('image/')) return { name, kind: 'inline', ...(await shrinkImage(file)) };
  if (ext === 'docx') return { name, kind: 'text', text: await docxText(file) };
  if (['txt', 'md', 'csv', 'tsv', 'json'].includes(ext) || file.type.startsWith('text/')) return { name, kind: 'text', text: await file.text() };
  throw new Error(`「${name}」は対応していない形式です（PDF・画像・txt・csv・Wordが使えます）`);
}

export async function readAll(fileList) {
  const out = [];
  for (const f of fileList) out.push(await readAttachment(f));
  return out;
}

export const fileChips = (files, act = 'rmFile') =>
  files.map((f, i) => `<span class="fchip">${f.name.replace(/[<>&"]/g, '')}<button data-a="${act}" data-i="${i}" aria-label="外す">×</button></span>`).join('');
