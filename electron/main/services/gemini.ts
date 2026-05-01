import { GoogleGenAI } from '@google/genai';
import type {
  ErrorCode, LangCode, TranslateRunPayload, TranslateUsage,
} from '@shared/types';

const LANG_NAMES: Record<LangCode, string> = { zh: 'Chinese', en: 'English' };

export function buildSystemPrompt(src: LangCode, tgt: LangCode): string {
  return `You are a professional translator. Translate the user's input from ${LANG_NAMES[src]} to ${LANG_NAMES[tgt]}. Preserve formatting and tone. Output only the translation, no commentary, no quotes.`;
}

export interface ContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
export interface Content { role: 'user'; parts: ContentPart[]; }

export function buildContents(p: TranslateRunPayload): Content[] {
  if (p.mode === 'text') {
    return [{ role: 'user', parts: [{ text: p.text ?? '' }] }];
  }
  if (!p.bytes || !p.mime) throw new Error('bytes/mime required for non-text mode');
  const data = Buffer.from(p.bytes).toString('base64');
  if (p.mode === 'image') {
    return [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: p.mime, data } },
        { text: 'Translate the visible text in this image.' },
      ],
    }];
  }
  return [{
    role: 'user',
    parts: [
      { inlineData: { mimeType: p.mime, data } },
      { text: 'Transcribe and translate the speech in this audio.' },
    ],
  }];
}

export interface MappedError { code: ErrorCode; message: string; detail?: string; }

export function mapSdkError(err: unknown): MappedError {
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  const msg = (e.message ?? '').toLowerCase();
  if (e.name === 'AbortError') return { code: 'CANCELLED', message: '已取消' };
  if (e.status === 401 || e.status === 403) return { code: 'INVALID_API_KEY', message: 'API key 无效或权限不足', detail: e.message };
  if (e.status === 429) {
    if (msg.includes('quota')) return { code: 'QUOTA_EXCEEDED', message: '配额已用尽', detail: e.message };
    return { code: 'RATE_LIMIT', message: '请求频率超限', detail: e.message };
  }
  if (msg.includes('safety') || msg.includes('blocked')) return { code: 'MODEL_REFUSED', message: '内容被模型安全策略拒绝', detail: e.message };
  if (e.code === 'ECONNRESET' || e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT' || msg.includes('fetch failed') || msg.includes('network')) {
    return { code: 'NETWORK', message: '网络异常', detail: e.message };
  }
  return { code: 'INTERNAL', message: '发生未知错误', detail: e.message ?? String(err) };
}

export interface StreamTranslateOptions {
  apiKey: string;
  model: string;
  payload: TranslateRunPayload;
  signal: AbortSignal;
  onChunk: (delta: string) => void;
}

export interface StreamResult {
  fullText: string;
  usage?: TranslateUsage;
}

export async function streamTranslate(opts: StreamTranslateOptions): Promise<StreamResult> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const stream = await ai.models.generateContentStream({
    model: opts.model,
    contents: buildContents(opts.payload),
    config: {
      systemInstruction: buildSystemPrompt(opts.payload.sourceLang, opts.payload.targetLang),
    },
  });

  let fullText = '';
  let usage: TranslateUsage | undefined;
  for await (const chunk of stream) {
    if (opts.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const text = chunk.text ?? '';
    if (text) {
      fullText += text;
      opts.onChunk(text);
    }
    if (chunk.usageMetadata) {
      usage = {
        inputTokens: chunk.usageMetadata.promptTokenCount,
        outputTokens: chunk.usageMetadata.candidatesTokenCount,
      };
    }
  }
  return { fullText, usage };
}
