// Prosty ZIP (bez kompresji — zdjęcia JPG i tak są już skompresowane).
// Działa w przeglądarce, także na telefonach, bez zewnętrznych bibliotek.

const encoder = new TextEncoder();
let crcTable;

function table() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

async function crc32(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const t = table();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosStamp() {
  const d = new Date();
  const y = Math.max(1980, d.getFullYear());
  return {
    time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31),
    date: (((y - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
  };
}

function header(size, fields) {
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  fields.forEach(([offset, bytes, value]) => {
    if (bytes === 2) view.setUint16(offset, value & 0xffff, true);
    else view.setUint32(offset, value >>> 0, true);
  });
  return buf;
}

// files: [{ name, blob }]. onProgress(done, total, name) — opcjonalnie.
export async function buildZip(files, onProgress = () => {}) {
  const entries = [];
  const used = new Set();
  let offset = 0;

  for (let i = 0; i < files.length; i++) {
    let name = files[i].name;
    // Unikalne nazwy w archiwum.
    for (let n = 2; used.has(name.toLowerCase()); n++) name = files[i].name.replace(/(\.[^.]*)?$/, ` (${n})$1`);
    used.add(name.toLowerCase());

    const nameBytes = encoder.encode(name);
    const blob = files[i].blob;
    const stamp = dosStamp();
    const entry = { nameBytes, blob, size: blob.size, crc: await crc32(blob), offset, ...stamp };
    entries.push(entry);
    offset += 30 + nameBytes.length + blob.size;
    onProgress(i + 1, files.length, name);
    if (i % 2) await new Promise(resolve => setTimeout(resolve, 0));
  }

  const parts = [];
  for (const e of entries) {
    parts.push(header(30, [[0, 4, 0x04034b50], [4, 2, 20], [6, 2, 0x0800], [8, 2, 0], [10, 2, e.time], [12, 2, e.date], [14, 4, e.crc], [18, 4, e.size], [22, 4, e.size], [26, 2, e.nameBytes.length], [28, 2, 0]]), e.nameBytes, e.blob);
  }
  const centralOffset = offset;
  let centralSize = 0;
  for (const e of entries) {
    const h = header(46, [[0, 4, 0x02014b50], [4, 2, 20], [6, 2, 20], [8, 2, 0x0800], [10, 2, 0], [12, 2, e.time], [14, 2, e.date], [16, 4, e.crc], [20, 4, e.size], [24, 4, e.size], [28, 2, e.nameBytes.length], [30, 2, 0], [32, 2, 0], [34, 2, 0], [36, 2, 0], [38, 4, 0], [42, 4, e.offset]]);
    parts.push(h, e.nameBytes);
    centralSize += h.byteLength + e.nameBytes.length;
  }
  parts.push(header(22, [[0, 4, 0x06054b50], [4, 2, 0], [6, 2, 0], [8, 2, entries.length], [10, 2, entries.length], [12, 4, centralSize], [16, 4, centralOffset], [20, 2, 0]]));
  return new Blob(parts, { type: "application/zip" });
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 180000);
}
