# llmTranslate

A desktop translation app powered by Google Gemini. Translate text, images, and audio with real-time streaming output.

## Features

- **Text translation** — streamed markdown output with rich formatting
- **Image translation** — paste or upload images for OCR + translation
- **Audio translation** — transcribe and translate audio files
- **History** — searchable history with favorites and full-text search
- **Dark / light theme** — follows system preference, manually switchable
- **Keyboard shortcuts** — `Ctrl+Enter` to translate, `Ctrl+L` to swap languages, `Escape` to cancel
- **Quick translate** — system-wide hotkey to translate clipboard text

## Install

Download the latest release from the [releases page](../../releases).

- **`llmTranslate Setup x.x.x.exe`** — NSIS installer (choose install location)
- **`llmTranslate x.x.x.exe`** — portable executable (no install)

Requires a [Gemini API key](https://aistudio.google.com/app/apikey).

## Dev

```bash
npm install
npm run dev          # start dev server + electron
npm run build        # production build
npm run package      # build + package for Windows
npm test             # run unit tests
npm run test:e2e     # run e2e tests
```

### Stack

- Electron 32 + Vite 5
- React 18 + TypeScript 5
- Tailwind CSS 3
- better-sqlite3 (history)
- react-markdown + remark-gfm
- electron-builder (packaging)

## License

MIT
