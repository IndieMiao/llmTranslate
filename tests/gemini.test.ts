import { describe, it, expect } from 'vitest';
import { mapSdkError, buildContents, buildSystemPrompt } from '../electron/main/services/gemini';

describe('gemini.mapSdkError', () => {
  it('maps 401 to INVALID_API_KEY', () => {
    expect(mapSdkError({ status: 401 }).code).toBe('INVALID_API_KEY');
  });
  it('maps 403 to INVALID_API_KEY', () => {
    expect(mapSdkError({ status: 403 }).code).toBe('INVALID_API_KEY');
  });
  it('maps 429 to RATE_LIMIT', () => {
    expect(mapSdkError({ status: 429 }).code).toBe('RATE_LIMIT');
  });
  it('maps quota errors to QUOTA_EXCEEDED', () => {
    expect(mapSdkError({ status: 429, message: 'quota exceeded' }).code).toBe('QUOTA_EXCEEDED');
  });
  it('maps abort errors to CANCELLED', () => {
    expect(mapSdkError({ name: 'AbortError' }).code).toBe('CANCELLED');
  });
  it('maps network errors', () => {
    expect(mapSdkError({ code: 'ECONNRESET' }).code).toBe('NETWORK');
    expect(mapSdkError({ code: 'ENOTFOUND' }).code).toBe('NETWORK');
    expect(mapSdkError({ message: 'fetch failed' }).code).toBe('NETWORK');
  });
  it('maps safety blocks to MODEL_REFUSED', () => {
    expect(mapSdkError({ message: 'blocked by safety settings' }).code).toBe('MODEL_REFUSED');
  });
  it('falls back to INTERNAL', () => {
    expect(mapSdkError(new Error('weird thing')).code).toBe('INTERNAL');
  });
});

describe('gemini.buildSystemPrompt', () => {
  it('includes both languages', () => {
    const p = buildSystemPrompt('zh', 'en');
    expect(p).toContain('Chinese');
    expect(p).toContain('English');
    expect(p).toMatch(/Output only the translation/i);
  });
  it('reverses for en->zh', () => {
    const p = buildSystemPrompt('en', 'zh');
    expect(p).toContain('English');
    expect(p).toContain('Chinese');
  });
});

describe('gemini.buildContents', () => {
  it('text mode produces a single text part', () => {
    const c = buildContents({ id: 'x', mode: 'text', sourceLang: 'zh', targetLang: 'en', text: '你好' });
    expect(c).toEqual([{ role: 'user', parts: [{ text: '你好' }] }]);
  });
  it('image mode produces inlineData + instruction', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const c = buildContents({ id: 'x', mode: 'image', sourceLang: 'zh', targetLang: 'en', bytes, mime: 'image/png' });
    expect(c[0].parts[0]).toMatchObject({ inlineData: { mimeType: 'image/png' } });
    expect(c[0].parts[1]).toHaveProperty('text');
  });
  it('audio mode produces inlineData + transcribe-and-translate text', () => {
    const c = buildContents({ id: 'x', mode: 'audio', sourceLang: 'zh', targetLang: 'en', bytes: new Uint8Array(2), mime: 'audio/mp3' });
    expect(c[0].parts[0]).toMatchObject({ inlineData: { mimeType: 'audio/mp3' } });
    expect((c[0].parts[1] as { text: string }).text).toMatch(/transcribe/i);
  });
});
