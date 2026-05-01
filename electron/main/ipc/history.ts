import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { openHistoryDb, type HistoryDb } from '../services/history-db';
import { listAssetFiles, deleteAsset } from '../services/asset-store';
import type { HistoryListQuery, HistoryRecord } from '@shared/types';

let db: HistoryDb | null = null;
let assetDir = '';

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    case '.ogg': return 'audio/ogg';
    default: return 'application/octet-stream';
  }
}

function getDb(): HistoryDb {
  if (db) return db;
  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'history.db');
  fs.mkdirSync(userData, { recursive: true });
  db = openHistoryDb(dbPath);
  if (!db.integrityOk()) {
    const backup = `${dbPath}.corrupt-${Date.now()}`;
    db.close();
    fs.renameSync(dbPath, backup);
    db = openHistoryDb(dbPath);
  }
  assetDir = path.join(userData, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });
  return db;
}

export function getAssetDir(): string {
  if (!assetDir) getDb();
  return assetDir;
}

export function recordHistory(rec: HistoryRecord): void {
  getDb().insert(rec);
}

export function startupCleanup(maxNonFavorites: number): void {
  const d = getDb();
  d.cleanupCapacity(maxNonFavorites);
  // Orphan asset cleanup
  const referenced = new Set(d.listAllAssetPaths());
  for (const f of listAssetFiles(getAssetDir())) {
    if (!referenced.has(f)) deleteAsset(f);
  }
}

export function registerHistoryIpc(): void {
  ipcMain.handle('history:list', (_e, q: HistoryListQuery) => getDb().list(q ?? {}));
  ipcMain.handle('history:delete', (_e, p: { id: string }) => { getDb().delete(p.id); return { ok: true }; });
  ipcMain.handle('history:clear', () => { getDb().clear(); return { ok: true }; });
  ipcMain.handle('history:favorite', (_e, p: { id: string; favorite: boolean }) => {
    getDb().setFavorite(p.id, p.favorite);
    return { ok: true };
  });
  ipcMain.handle('history:read-asset', (_e, p: { id: string }) => {
    const row = getDb().getAssetById(p.id);
    if (!row?.assetPath) return null;

    const dir = path.resolve(getAssetDir());
    const resolved = path.resolve(row.assetPath);
    const inside = resolved === dir || resolved.startsWith(dir + path.sep);
    if (!inside) return null;

    if (!fs.existsSync(resolved)) return null;

    const bytes = fs.readFileSync(resolved);
    const mime = mimeFromExt(path.extname(resolved));
    return { mime, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
  });
}

export function __recordForTests(r: HistoryRecord): void { recordHistory(r); }
