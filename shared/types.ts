// ----- Translation -----
export type TranslateMode = 'text' | 'image' | 'audio';
export type LangCode = 'zh' | 'en';
export type LangPair = `${LangCode}-${LangCode}`;

export interface TranslateRunPayload {
  id: string;
  mode: TranslateMode;
  sourceLang: LangCode;
  targetLang: LangCode;
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
}

export interface TranslateChunkEvent {
  id: string;
  delta: string;
}

export interface TranslateUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type TranslateStatus = 'ok' | 'cancelled';

export interface TranslateDoneEvent {
  id: string;
  fullText: string;
  status: TranslateStatus;
  usage?: TranslateUsage;
}

export type ErrorCode =
  | 'NO_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK'
  | 'MODEL_REFUSED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'CANCELLED'
  | 'INTERNAL';

export interface TranslateErrorEvent {
  id: string;
  code: ErrorCode;
  message: string;
  detail?: string;
}

// ----- Settings -----
export type ThemeChoice = 'dark' | 'light' | 'system';

export interface Settings {
  apiKey: string;          // empty string when unset
  model: string;           // gemini-2.0-flash default
  theme: ThemeChoice;
  shortcut: string;        // e.g. 'Ctrl+Shift+T'
  languagePair: LangPair;  // current direction
  history: { maxRecords: number };
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'gemini-2.0-flash',
  theme: 'system',
  shortcut: 'Ctrl+Shift+T',
  languagePair: 'zh-en',
  history: { maxRecords: 200 },
};

// ----- History -----
export interface HistoryRecord {
  id: string;
  createdAt: number;
  mode: TranslateMode;
  sourceLang: LangCode;
  targetLang: LangCode;
  sourceText: string | null;
  resultText: string;
  assetPath: string | null;
  favorite: boolean;
  tokenUsage: TranslateUsage | null;
}

export interface HistoryListQuery {
  query?: string;
  favoritesOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface HistoryAssetReadResult {
  mime: string;
  dataUrl: string; // "data:<mime>;base64,..."
}

// ----- File limits -----
export const FILE_LIMITS = {
  imageMaxBytes: 10 * 1024 * 1024,
  audioMaxBytes: 20 * 1024 * 1024,
  imageMimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
  audioMimes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a', 'audio/ogg'] as const,
  textMaxChars: 50_000,
};
