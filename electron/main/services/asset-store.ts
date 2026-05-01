import fs from 'node:fs';
import path from 'node:path';

export function copyAsset(srcBytes: Uint8Array, baseDir: string, id: string, ext: string): string {
  const now = new Date();
  const sub = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  const dir = path.join(baseDir, sub);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}${ext}`);
  fs.writeFileSync(file, srcBytes);
  return file;
}

export function deleteAsset(filePath: string | null): void {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch { /* missing is fine */ }
}

export function listAssetFiles(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) return [];
  const out: string[] = [];
  for (const year of fs.readdirSync(baseDir)) {
    const yPath = path.join(baseDir, year);
    if (!fs.statSync(yPath).isDirectory()) continue;
    for (const month of fs.readdirSync(yPath)) {
      const mPath = path.join(yPath, month);
      if (!fs.statSync(mPath).isDirectory()) continue;
      for (const f of fs.readdirSync(mPath)) out.push(path.join(mPath, f));
    }
  }
  return out;
}
