import Database from 'better-sqlite3';
import type { HistoryListQuery, HistoryRecord, TranslateUsage } from '@shared/types';
import { deleteAsset } from './asset-store';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_text TEXT,
  result_text TEXT NOT NULL,
  asset_path TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  token_usage TEXT
);
CREATE INDEX IF NOT EXISTS idx_created  ON translations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorite ON translations(favorite);

CREATE VIRTUAL TABLE IF NOT EXISTS translations_fts USING fts5(
  source_text, result_text, content='translations', content_rowid='rowid',
  tokenize='trigram case_sensitive 0'
);

CREATE TRIGGER IF NOT EXISTS trans_ai AFTER INSERT ON translations BEGIN
  INSERT INTO translations_fts(rowid, source_text, result_text)
  VALUES (new.rowid, new.source_text, new.result_text);
END;
CREATE TRIGGER IF NOT EXISTS trans_ad AFTER DELETE ON translations BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, source_text, result_text)
  VALUES('delete', old.rowid, old.source_text, old.result_text);
END;
CREATE TRIGGER IF NOT EXISTS trans_au AFTER UPDATE ON translations BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, source_text, result_text)
  VALUES('delete', old.rowid, old.source_text, old.result_text);
  INSERT INTO translations_fts(rowid, source_text, result_text)
  VALUES (new.rowid, new.source_text, new.result_text);
END;
`;

export interface HistoryDb {
  insert(rec: HistoryRecord): void;
  list(q: HistoryListQuery): HistoryRecord[];
  delete(id: string): void;
  clear(): void;
  setFavorite(id: string, favorite: boolean): void;
  cleanupCapacity(maxNonFavorites: number): void;
  listAllAssetPaths(): string[];
  getAssetById(id: string): { assetPath: string | null; mode: HistoryRecord['mode'] } | null;
  integrityOk(): boolean;
  close(): void;
}

interface Row {
  id: string; created_at: number; mode: string;
  source_lang: string; target_lang: string;
  source_text: string | null; result_text: string;
  asset_path: string | null; favorite: number;
  token_usage: string | null;
}

function rowToRecord(r: Row): HistoryRecord {
  return {
    id: r.id, createdAt: r.created_at, mode: r.mode as HistoryRecord['mode'],
    sourceLang: r.source_lang as HistoryRecord['sourceLang'],
    targetLang: r.target_lang as HistoryRecord['targetLang'],
    sourceText: r.source_text, resultText: r.result_text,
    assetPath: r.asset_path, favorite: !!r.favorite,
    tokenUsage: r.token_usage ? (JSON.parse(r.token_usage) as TranslateUsage) : null,
  };
}

export function openHistoryDb(filePath: string): HistoryDb {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const insertStmt = db.prepare(`
    INSERT INTO translations (id, created_at, mode, source_lang, target_lang,
      source_text, result_text, asset_path, favorite, token_usage)
    VALUES (@id, @createdAt, @mode, @sourceLang, @targetLang,
      @sourceText, @resultText, @assetPath, @favorite, @tokenUsage)
  `);

  return {
    insert(rec) {
      insertStmt.run({
        ...rec,
        favorite: rec.favorite ? 1 : 0,
        tokenUsage: rec.tokenUsage ? JSON.stringify(rec.tokenUsage) : null,
      });
    },
    list(q) {
      const limit = q.limit ?? 200;
      const offset = q.offset ?? 0;
      let rows: Row[];
      if (q.query) {
        const favClause = q.favoritesOnly ? 'AND favorite = 1' : '';
        // trigram tokenizer requires >= 3 characters; for shorter queries fall back to LIKE
        if ([...q.query].length >= 3) {
          rows = db.prepare(`
            SELECT t.* FROM translations t
            JOIN translations_fts f ON f.rowid = t.rowid
            WHERE translations_fts MATCH ?
              ${q.favoritesOnly ? 'AND t.favorite = 1' : ''}
            ORDER BY t.created_at DESC LIMIT ? OFFSET ?
          `).all(q.query, limit, offset) as Row[];
        } else {
          const like = `%${q.query}%`;
          rows = db.prepare(`
            SELECT * FROM translations
            WHERE (source_text LIKE ? OR result_text LIKE ?) ${favClause}
            ORDER BY created_at DESC LIMIT ? OFFSET ?
          `).all(like, like, limit, offset) as Row[];
        }
      } else {
        rows = db.prepare(`
          SELECT * FROM translations
          ${q.favoritesOnly ? 'WHERE favorite = 1' : ''}
          ORDER BY created_at DESC LIMIT ? OFFSET ?
        `).all(limit, offset) as Row[];
      }
      return rows.map(rowToRecord);
    },
    delete(id) {
      const row = db.prepare('SELECT asset_path FROM translations WHERE id = ?').get(id) as { asset_path: string | null } | undefined;
      db.prepare('DELETE FROM translations WHERE id = ?').run(id);
      if (row?.asset_path) deleteAsset(row.asset_path);
    },
    clear() {
      const rows = db.prepare('SELECT asset_path FROM translations WHERE asset_path IS NOT NULL').all() as { asset_path: string }[];
      db.prepare('DELETE FROM translations').run();
      for (const r of rows) deleteAsset(r.asset_path);
    },
    setFavorite(id, favorite) {
      db.prepare('UPDATE translations SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
    },
    cleanupCapacity(maxNonFavorites) {
      const rows = db.prepare(`
        SELECT id, asset_path FROM translations
        WHERE favorite = 0
        ORDER BY created_at DESC
      `).all() as { id: string; asset_path: string | null }[];
      const toDelete = rows.slice(maxNonFavorites);
      const tx = db.transaction((items: typeof toDelete) => {
        const stmt = db.prepare('DELETE FROM translations WHERE id = ?');
        for (const it of items) stmt.run(it.id);
      });
      tx(toDelete);
      for (const it of toDelete) if (it.asset_path) deleteAsset(it.asset_path);
    },
    listAllAssetPaths() {
      return (db.prepare('SELECT asset_path FROM translations WHERE asset_path IS NOT NULL').all() as { asset_path: string }[])
        .map((r) => r.asset_path);
    },
    getAssetById(id) {
      const row = db
        .prepare('SELECT asset_path, mode FROM translations WHERE id = ?')
        .get(id) as { asset_path: string | null; mode: string } | undefined;
      if (!row) return null;
      return { assetPath: row.asset_path, mode: row.mode as HistoryRecord['mode'] };
    },
    integrityOk() {
      const r = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      return r.integrity_check === 'ok';
    },
    close() { db.close(); },
  };
}
