import { ipcMain, type WebContents } from 'electron';
import { streamTranslate, mapSdkError } from '../services/gemini';
import { loadSettings } from '../services/secret-store';
import { recordHistory, getAssetDir } from './history';
import { copyAsset } from '../services/asset-store';
import type {
  TranslateRunPayload, TranslateChunkEvent, TranslateDoneEvent, TranslateErrorEvent, ErrorCode,
} from '@shared/types';
import { FILE_LIMITS } from '@shared/types';

const inflight = new Map<string, AbortController>();

class IpcError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); this.name = 'IpcError'; }
}

function validatePayload(p: TranslateRunPayload): void {
  if (p.mode === 'text') {
    if (!p.text || !p.text.trim()) throw new IpcError('INTERNAL', '文本为空');
    if (p.text.length > FILE_LIMITS.textMaxChars) throw new IpcError('FILE_TOO_LARGE', '文本过长');
  } else {
    if (!p.bytes || !p.mime) throw new IpcError('INTERNAL', '缺少文件数据');
    const limit = p.mode === 'image' ? FILE_LIMITS.imageMaxBytes : FILE_LIMITS.audioMaxBytes;
    if (p.bytes.byteLength > limit) throw new IpcError('FILE_TOO_LARGE', '文件超出大小限制');
    const mimes: readonly string[] = p.mode === 'image' ? FILE_LIMITS.imageMimes : FILE_LIMITS.audioMimes;
    if (!mimes.includes(p.mime)) throw new IpcError('UNSUPPORTED_FORMAT', '不支持的文件类型');
  }
}

function extFor(mime: string): string {
  const m: Record<string, string> = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
    'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
    'audio/m4a': '.m4a', 'audio/x-m4a': '.m4a', 'audio/ogg': '.ogg',
  };
  return m[mime] ?? '.bin';
}

function send<T>(wc: WebContents, ch: string, payload: T): void {
  if (wc.isDestroyed()) return;
  wc.send(ch, payload);
}

async function runStream(wc: WebContents, payload: TranslateRunPayload): Promise<void> {
  const settings = loadSettings();
  const ctrl = new AbortController();
  inflight.set(payload.id, ctrl);
  try {
    const result = await streamTranslate({
      apiKey: settings.apiKey,
      model: settings.model,
      payload,
      signal: ctrl.signal,
      onChunk: (delta) => send<TranslateChunkEvent>(wc, 'translate:chunk', { id: payload.id, delta }),
    });
    if (ctrl.signal.aborted) {
      send<TranslateDoneEvent>(wc, 'translate:done', { id: payload.id, fullText: result.fullText, status: 'cancelled' });
      return;
    }
    let assetPath: string | null = null;
    if ((payload.mode === 'image' || payload.mode === 'audio') && payload.bytes && payload.mime) {
      assetPath = copyAsset(payload.bytes, getAssetDir(), payload.id, extFor(payload.mime));
    }
    recordHistory({
      id: payload.id,
      createdAt: Date.now(),
      mode: payload.mode,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      sourceText: payload.mode === 'text' ? (payload.text ?? null) : null,
      resultText: result.fullText,
      assetPath,
      favorite: false,
      tokenUsage: result.usage ?? null,
    });
    send<TranslateDoneEvent>(wc, 'translate:done', { id: payload.id, fullText: result.fullText, status: 'ok', usage: result.usage });
  } catch (err) {
    const m = mapSdkError(err);
    if (m.code === 'CANCELLED') {
      send<TranslateDoneEvent>(wc, 'translate:done', { id: payload.id, fullText: '', status: 'cancelled' });
    } else {
      send<TranslateErrorEvent>(wc, 'translate:error', { id: payload.id, code: m.code, message: m.message, detail: m.detail });
    }
  } finally {
    inflight.delete(payload.id);
  }
}

export function registerTranslateIpc(): void {
  ipcMain.handle('translate:run', async (e, payload: TranslateRunPayload) => {
    if (!loadSettings().apiKey) throw new IpcError('NO_API_KEY', '请先在设置中填入 API key');
    validatePayload(payload);
    const wc = e.sender;
    queueMicrotask(() => { void runStream(wc, payload); });
    return { accepted: true };
  });

  ipcMain.handle('translate:cancel', (_e, p: { id: string }) => {
    const ctrl = inflight.get(p.id);
    if (!ctrl) return { cancelled: false };
    ctrl.abort();
    return { cancelled: true };
  });
}
