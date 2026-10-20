// A small ZIP reader that runs in the browser and in Node, so a multi-gigabyte X or Facebook archive never has to be
// uploaded: only the central directory and the few entries we want are read, straight from the file.
// Supports stored and deflated entries and ZIP64 (archives over 4 GB). No encryption, no multi-disk archives.

export interface ZipSource {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX = 0xffffffff;

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u64 = (v: DataView, at: number) => Number(v.getBigUint64(at, true));

export async function listEntries(src: ZipSource): Promise<ZipEntry[]> {
  // The end-of-central-directory record is in the last 22 bytes plus up to 64 KB of comment.
  const tailStart = Math.max(0, src.size - 22 - 0xffff - 20);
  const tail = await src.read(tailStart, src.size);
  const tv = view(tail);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === EOCD) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new Error("This isn't a ZIP file.");

  let count = tv.getUint16(at + 10, true);
  let cdSize = tv.getUint32(at + 12, true);
  let cdOffset = tv.getUint32(at + 16, true);
  if ((cdOffset === MAX || count === 0xffff) && at >= 20 && tv.getUint32(at - 20, true) === EOCD64_LOCATOR) {
    const rec = view(await src.read(u64(tv, at - 12), u64(tv, at - 12) + 56));
    count = u64(rec, 32);
    cdSize = u64(rec, 40);
    cdOffset = u64(rec, 48);
  }

  const cd = await src.read(cdOffset, cdOffset + cdSize);
  const cv = view(cd);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (cv.getUint32(p, true) !== CENTRAL) break;
    const method = cv.getUint16(p + 10, true);
    let compressedSize = cv.getUint32(p + 20, true);
    let size = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    let offset = cv.getUint32(p + 42, true);
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
    // ZIP64 sizes and offset live in extra field 0x0001, in this order, only for the fields that overflowed.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = cv.getUint16(e, true);
      const len = cv.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === MAX) {
          size = u64(cv, q);
          q += 8;
        }
        if (compressedSize === MAX) {
          compressedSize = u64(cv, q);
          q += 8;
        }
        if (offset === MAX) offset = u64(cv, q);
      }
      e += 4 + len;
    }
    if (!name.endsWith("/")) entries.push({ name, method, compressedSize, size, offset });
    p = extraEnd + commentLen;
  }
  return entries;
}

export async function readEntry(src: ZipSource, entry: ZipEntry, inflate: Inflate): Promise<Uint8Array> {
  const header = view(await src.read(entry.offset, entry.offset + 30));
  if (header.getUint32(0, true) !== LOCAL) throw new Error(`Damaged ZIP entry: ${entry.name}`);
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const data = await src.read(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflate(data);
  throw new Error(`Unsupported compression in ${entry.name}.`);
}

/** In the browser: read straight from a File the person picked. */
export const fileSource = (file: Blob): ZipSource => ({
  size: file.size,
  read: async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()),
});

/** In the browser: DecompressionStream does raw deflate natively. */
export const browserInflate: Inflate = async (data) => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export const bytesSource = (bytes: Uint8Array): ZipSource => ({ size: bytes.length, read: async (s, e) => bytes.subarray(s, e) });
