import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openHistoryDb, type HistoryDb } from '../electron/main/services/history-db';
import type { HistoryRecord } from '@shared/types';

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'llmtrans-'));
  return d;
}

function rec(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'r1', createdAt: Date.now(), mode: 'text',
    sourceLang: 'zh', targetLang: 'en',
    sourceText: '你好', resultText: 'hello', assetPath: null,
    favorite: false, tokenUsage: null, ...over,
  };
}

describe('history-db', () => {
  let db: HistoryDb;
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    db = openHistoryDb(path.join(dir, 'history.db'));
  });

  it('inserts and lists in DESC order', () => {
    db.insert(rec({ id: 'a', createdAt: 1 }));
    db.insert(rec({ id: 'b', createdAt: 2 }));
    expect(db.list({}).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('searches by FTS over source and result', () => {
    db.insert(rec({ id: '1', sourceText: 'hello world', resultText: '你好世界' }));
    db.insert(rec({ id: '2', sourceText: 'goodbye', resultText: '再见' }));
    expect(db.list({ query: 'hello' }).map((r) => r.id)).toEqual(['1']);
    expect(db.list({ query: '世界' }).map((r) => r.id)).toEqual(['1']);
  });

  it('toggles favorite', () => {
    db.insert(rec({ id: 'x' }));
    db.setFavorite('x', true);
    expect(db.list({ favoritesOnly: true }).map((r) => r.id)).toEqual(['x']);
  });

  it('deletes a record', () => {
    db.insert(rec({ id: 'x' }));
    db.delete('x');
    expect(db.list({})).toEqual([]);
  });

  it('caps non-favorites at maxRecords, never deletes favorites', () => {
    for (let i = 0; i < 5; i++) db.insert(rec({ id: `n${i}`, createdAt: i }));
    db.insert(rec({ id: 'fav', createdAt: 100, favorite: true }));
    db.cleanupCapacity(3);
    const ids = db.list({}).map((r) => r.id);
    expect(ids).toContain('fav');
    expect(ids.filter((id) => id !== 'fav')).toHaveLength(3);
    expect(ids).toContain('n4'); // newest non-fav kept
    expect(ids).not.toContain('n0'); // oldest dropped
  });

  it('clears all (favorites included)', () => {
    db.insert(rec({ id: 'a', favorite: true }));
    db.clear();
    expect(db.list({})).toEqual([]);
  });

  it('integrity check passes for fresh db', () => {
    expect(db.integrityOk()).toBe(true);
  });

  it('getAssetById returns asset_path and mode for the record', () => {
    db.insert(rec({ id: 'r1', mode: 'image', assetPath: '/tmp/x.png' }));
    expect(db.getAssetById('r1')).toEqual({ assetPath: '/tmp/x.png', mode: 'image' });
  });

  it('getAssetById returns null for unknown id', () => {
    expect(db.getAssetById('missing')).toBeNull();
  });
});
