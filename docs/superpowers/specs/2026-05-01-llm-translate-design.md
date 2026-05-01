# llmTranslate — 桌面端 LLM 翻译软件设计文档

- **Date**: 2026-05-01
- **Owner**: zhangshaojie
- **Status**: Approved (brainstorming complete, awaiting implementation plan)
- **Target platform**: Windows only (first release)

## 1. 项目目标

构建一个 Windows 桌面端 LLM 翻译软件，主打"低摩擦、多模态"：用户能在系统栏长期常驻，通过托盘图标或全局快捷键快速唤起；输入文本/图片/音频后由 Gemini Flash 模型完成翻译并以流式打字机效果回显。默认中→英双向，UI 默认暗色，本地存储翻译历史。

### 关键设计决定（来自 brainstorming）

| 维度 | 决定 |
|---|---|
| 技术栈 | Electron + React + TypeScript + Vite |
| 平台 | Windows only |
| 翻译模型 | Gemini Flash（多模态一步过；图/音直传，不本地 OCR/STT）|
| 音频输入 | 仅音频文件（拖拽/粘贴/选择），不接麦克风 |
| API key | BYOK，用户在设置页填入；本地用 `safeStorage`（DPAPI）加密存储 |
| 语言对 | zh ↔ en 双向，按钮一键切换 |
| 唤起方式 | 系统栏图标 + 全局快捷键（默认 `Ctrl+Shift+T`，可改）|
| 主题 | 暗 / 亮 / 跟随系统 三档 |
| 历史 | 本地 SQLite，可查看/搜索/清理；容量上限 200 条（默认）|
| 输出 | 流式打字机效果 |

## 2. 整体架构

### 2.1 进程模型

Electron 双进程：

- **main 进程（Node）**：负责窗口/托盘/全局快捷键、Gemini SDK 调用（流式）、SQLite 历史、`safeStorage` 加密存储、剪贴板与原生对话框。
- **renderer 进程（React + Vite）**：负责 UI、状态管理、主题渲染、与 main 之间通过 IPC 通信。

renderer 端启用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；通过 `preload.ts` 用 `contextBridge` 仅暴露受控 IPC 函数（不暴露 `ipcRenderer` 自身）。所有外部 HTTP（Gemini）只在 main 进程发出。

### 2.2 目录布局

```
llmTranslate/
├── electron/
│   ├── main/
│   │   ├── index.ts              # app 生命周期、窗口、托盘、快捷键
│   │   ├── tray.ts
│   │   ├── shortcuts.ts          # 全局快捷键注册
│   │   ├── ipc/
│   │   │   ├── translate.ts      # translate:run / translate:cancel
│   │   │   ├── settings.ts       # api-key / 主题 / 快捷键 / 语言对
│   │   │   └── history.ts        # 列表/搜索/清理/收藏/删除
│   │   ├── services/
│   │   │   ├── gemini.ts         # Gemini SDK 封装，含流式 + 错误映射
│   │   │   ├── secret-store.ts   # safeStorage + electron-store
│   │   │   └── history-db.ts     # better-sqlite3
│   │   └── preload.ts            # contextBridge 暴露最小 API
│   └── tsconfig.json
├── src/                          # renderer
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Translate.tsx
│   │   ├── History.tsx
│   │   └── Settings.tsx
│   ├── components/               # 见 §3.2
│   ├── hooks/                    # useTranslate / useTheme / usePaste / useErrorHandler
│   ├── lib/
│   │   ├── ipc.ts                # 类型化 IPC 调用包装
│   │   └── theme.ts              # 主题切换、跟随系统
│   ├── styles/
│   │   ├── tokens.css            # 三主题的 CSS 变量
│   │   └── globals.css
│   └── types/
│       └── ipc.d.ts              # 共享类型（main↔renderer）
├── shared/                       # main 与 renderer 共用纯类型/常量
│   └── types.ts
├── electron-builder.json
├── vite.config.ts
├── package.json
└── docs/superpowers/specs/2026-05-01-llm-translate-design.md
```

### 2.3 关键依赖

- 核心：`electron`、`electron-builder`、`vite`、`typescript`、`react`
- UI：`tailwindcss`、`shadcn/ui`（按需引入 Radix primitives）
- AI：`@google/genai`（Gemini 官方 SDK，支持流式 + 多模态）
- 存储：`better-sqlite3`、`electron-store`
- 测试：`vitest`、`@testing-library/react`、`@playwright/test`
- 日志：`electron-log`

## 3. 组件与 UI

### 3.1 主窗布局

单主窗，左侧 Sidebar（翻译/历史/设置）+ 右侧主区。Frameless 窗口 + 自绘标题栏。

```
┌──────────────────────────────────────────────────────────────────┐
│ TitleBar (拖动区 + close/min/max)                                │
├──────────┬───────────────────────────────────────────────────────┤
│  Sidebar │  ┌─ LangSwitch ──┐    ┌─ ModeTabs ───────────┐       │
│ • 翻译   │  │ 中 → 英  ⇄    │    │ 文本 / 图片 / 音频    │       │
│ • 历史   │  └────────────────┘    └──────────────────────┘       │
│ • 设置   │  ┌───────────────────────────────────────────────┐    │
│          │  │  InputArea（按当前 mode 渲染）                 │    │
│          │  └───────────────────────────────────────────────┘    │
│          │  [ 翻译 ]   [ 清空 ]                                   │
│          │  ┌───────────────────────────────────────────────┐    │
│          │  │  TranslationView（流式打字机）                 │    │
│          │  │  [复制] [收藏] [重新翻译]                      │    │
│          │  └───────────────────────────────────────────────┘    │
└──────────┴───────────────────────────────────────────────────────┘
```

### 3.2 组件清单（renderer）

| 组件 | 职责 |
|---|---|
| `AppShell` | 整体布局 + 路由（sidebar + content）|
| `TitleBar` | 自绘标题栏（拖动 + 关闭/最小化）|
| `Sidebar` | 三页切换 |
| `LangSwitch` | 中→英 ⇄ 英→中（点一次反转）|
| `ModeTabs` | 文本 / 图片 / 音频 |
| `TextInput` | textarea + 字数 + 粘贴 |
| `ImageInput` | 拖拽 / 粘贴 / 点击；缩略图；上限 10MB |
| `AudioInput` | 拖拽 / 点击；上限 20MB；mime 白名单 |
| `TranslationView` | 流式渲染 + [复制] [收藏] [重译] |
| `HistoryList` | 表格 + 搜索 + 清空；点击回填到翻译页 |
| `SettingsPanel` | API key / 主题 / 快捷键 / 历史上限 |
| `Toast` / `Dialog` | shadcn 标准化反馈 |

### 3.3 主题系统

CSS 变量驱动。`tokens.css` 定义三套：

```css
:root[data-theme="dark"]   { --bg:#0e1116; --fg:#e6e6e6; --accent:#4f8cff; ... }
:root[data-theme="light"]  { --bg:#ffffff; --fg:#111111; --accent:#2563eb; ... }
/* "system" 是逻辑值，渲染时按 nativeTheme.shouldUseDarkColors 解析为 dark/light */
```

切换：设置存 `theme: 'dark' | 'light' | 'system'`。main 监听 `nativeTheme.on('updated')` 推 `theme:system-changed` IPC，renderer 更新根元素 `data-theme`。启动时同步读一次。

### 3.4 系统栏与快捷键

- 关闭主窗 → 隐藏到托盘（应用不退出）
- 托盘菜单：`显示主窗` / `快速翻译剪贴板` / `分隔` / `退出`
- 全局快捷键（默认 `Ctrl+Shift+T`）：唤起主窗 + 聚焦输入框；可在设置里改

### 3.5 应用内键盘交互

- `Enter`：换行；`Ctrl+Enter`：触发翻译
- `Esc`：取消正在进行的流式翻译
- `Ctrl+L`：切换语言方向
- `Ctrl+,`：打开设置

## 4. 数据流

### 4.1 翻译主流程

```
renderer                                  main
─────────                                 ─────
1. 用户提交（mode + 内容 + sourceLang + targetLang + id）
                  │ ipc.invoke('translate:run', payload)
                  ▼
                                          ① 校验 payload + API key 存在
                                          ② 构造 multimodal request
                                          ③ 调 streamGenerateContent
                  ┌──── translate:chunk ◀── for await chunk of stream
                  │     { id, delta }
                  ▼
   appendDelta(id, delta)                
   → TranslationView 逐字渲染            
                  ┌──── translate:done  ◀── stream 完成
                  │     { id, fullText, usage, status }
                  ▼
   finalize(id) + main 直接写 history
```

### 4.2 关键设计点

1. **会话 id**：renderer 生成 `nanoid`，所有 chunk/done/error/cancel 都带同一个 id。允许并行会话（虽然 UI 上一般一次只跑一个）。
2. **取消机制**：main 持 `Map<id, AbortController>`。`translate:cancel` 调 `controller.abort()` → SDK 抛 abort → 发 `translate:done` with `status: 'cancelled'`，不写历史。
3. **二进制传输**：图片/音频经 IPC 直传 `Uint8Array`/Buffer，不做 base64，省内存与一次拷贝。SDK 调用时再按需转换。
4. **Prompt 设计**（在 `services/gemini.ts` 里固化）：
   - System：「You are a professional translator. Translate the user's input from {src} to {tgt}. Preserve formatting and tone. Output only the translation, no commentary, no quotes.」
   - 文本：`{ role:'user', parts:[{ text }] }`
   - 图片：`parts:[{ inlineData:{ mimeType, data } }, { text:'Translate the visible text in this image.' }]`
   - 音频：`parts:[{ inlineData:... }, { text:'Transcribe and translate the speech in this audio.' }]`
5. **历史写入时机**：流结束、且 `status==='ok'` 时，main 直接写 SQLite（不绕一圈 IPC）。renderer 切到历史页通过 `history:list` 拉。
6. **粘贴/拖拽分流**（renderer）：
   - `paste`：检查 `clipboardData.items`，按优先级 image → file(audio/*) → text 切换 mode
   - `drop`：同样按 mime 分流；`dragover` 阻止默认 + 显示 drop overlay

### 4.3 IPC 通道清单

| 通道 | 方向 | payload | 返回 / 用途 |
|---|---|---|---|
| `translate:run` | renderer→main (invoke) | `{id, mode, sourceLang, targetLang, text?, bytes?, mime?}` | resolves `{ accepted: true }` 表示请求被接收并已开始；同步校验失败（无 API key / payload 非法）时 reject 并附 `code` |
| `translate:cancel` | renderer→main (invoke) | `{id}` | resolves `{ cancelled: boolean }` |
| `translate:chunk` | main→renderer (send) | `{id, delta}` | 流式 token |
| `translate:done` | main→renderer (send) | `{id, fullText, usage, status: 'ok' \| 'cancelled'}` | 收尾 |
| `translate:error` | main→renderer (send) | `{id, code, message, detail?}` | 流过程中（已 accepted 之后）的运行时错误（见 §6）|
| `settings:get` / `settings:set` | invoke | — / `Partial<Settings>` | 设置读写 |
| `history:list` / `:search` / `:delete` / `:clear` / `:favorite` | invoke | — | 历史 CRUD |
| `theme:system-changed` | main→renderer (send) | `{isDark}` | 跟随系统时同步 |

**错误传递分工**：`translate:run` 同步可知的错误（payload 校验、API key 缺失）以 invoke reject 形式返回，便于 renderer 在 await 处直接捕获；流启动后才出现的运行时错误（401/429/网络/safety/cancel）一律走 `translate:error` 事件，与 chunk/done 同通道。

## 5. 存储与安全

### 5.1 API key 加密存储

```
设置面板输入 key
  │ ipc.invoke('settings:set', { apiKey })
  ▼
main: safeStorage.encryptString(apiKey) → Buffer
  │                                        │
  │                                        ▼
  │                          electron-store 写到
  │                          %APPDATA%\llmTranslate\settings.json
  │                          字段: apiKey: <base64 of encrypted Buffer>
  ▼
读取时：safeStorage.decryptString(buffer)
```

- `safeStorage` 在 Windows 底层用 DPAPI（与当前用户账户绑定）；文件被复制到他机无法解密。
- key 仅在 main 进程内存中以明文存在；renderer 永远拿不到。
- 设置 UI 显示 `••••••••` + 末 4 位 + "更换 key" 按钮，不回显完整值。

### 5.2 设置文件

`%APPDATA%\llmTranslate\settings.json`

```jsonc
{
  "apiKey": "<base64 encrypted bytes>",
  "model": "gemini-2.0-flash",
  "theme": "system",                  // dark | light | system
  "shortcut": "Ctrl+Shift+T",
  "languagePair": "zh-en",            // 当前方向
  "history": { "maxRecords": 200 }
}
```

### 5.3 历史数据库

`%APPDATA%\llmTranslate\history.db`（SQLite，by `better-sqlite3`）

```sql
CREATE TABLE translations (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  mode         TEXT NOT NULL,         -- text | image | audio
  source_lang  TEXT NOT NULL,         -- zh | en
  target_lang  TEXT NOT NULL,
  source_text  TEXT,                  -- 文本模式原文；图/音模式为 null
  result_text  TEXT NOT NULL,
  asset_path   TEXT,                  -- 图/音模式下原始文件本地拷贝路径
  favorite     INTEGER NOT NULL DEFAULT 0,
  token_usage  TEXT                   -- JSON: { input, output }
);

CREATE INDEX idx_created  ON translations(created_at DESC);
CREATE INDEX idx_favorite ON translations(favorite);

CREATE VIRTUAL TABLE translations_fts USING fts5(
  source_text, result_text, content='translations', content_rowid='rowid'
);
-- 用触发器同步 FTS 内容（在迁移脚本里写）
```

### 5.4 资产文件

图/音不入 SQLite blob。落到 `%APPDATA%\llmTranslate\assets\YYYY\MM\<id>.<ext>`。

容量管理：
- "总记录数"指 **非收藏** 记录数。仅当非收藏数 > `history.maxRecords` 时，按 `created_at` 升序删除最旧的非收藏记录及其资产。
- 收藏记录不计入 cap，也不会被自动清理 —— 收藏即"显式持久"。"清空历史"按钮才会一并清掉收藏（带二次确认）。
- 启动时跑一次清理；每次新增也跑一次（轻量）。
- 设置里"清空历史"按钮带二次确认，会同时清掉 assets。

### 5.5 渲染端安全

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- `preload.ts` 仅暴露已定义的 IPC 函数（`window.electron.translate.run(...)`等），不暴露 `ipcRenderer`
- HTML CSP：`default-src 'self'; img-src 'self' data: blob:; connect-src 'self'`
- 所有外部 HTTP 在 main 进程发出，renderer 不直连外网

## 6. 错误处理

### 6.1 错误分类

| code | 触发场景 | 用户看到的 |
|---|---|---|
| `NO_API_KEY` | settings 里没存 key | 全屏蒙层引导跳设置页 |
| `INVALID_API_KEY` | Gemini 返回 401/403 | Toast: "API key 无效，请检查"+ 跳设置 |
| `RATE_LIMIT` | 429 | Toast: "频率超限，请稍后再试"；按钮 30s 灰态 |
| `QUOTA_EXCEEDED` | 配额耗尽 | Dialog 引导查 Google AI Studio 额度 |
| `NETWORK` | DNS/连接失败/超时 | Toast: "网络异常"+ 重试按钮（同 id）|
| `MODEL_REFUSED` | safety filter 拦截 | Inline 在结果区显示拒绝原因；不写历史 |
| `FILE_TOO_LARGE` | 图片 >10MB / 音频 >20MB | InputArea 红字提示，按钮禁用 |
| `UNSUPPORTED_FORMAT` | mime 不在白名单 | 同上 |
| `CANCELLED` | 用户按 Esc | 安静收尾，结果区显示已收到的部分 + "已取消"标记 |
| `INTERNAL` | 兜底 | Toast: "发生未知错误"，写日志并提供"复制错误信息"按钮 |

### 6.2 错误对象统一形状

```ts
// shared/types.ts
type TranslateError = {
  id: string;
  code: 'NO_API_KEY' | 'INVALID_API_KEY' | 'RATE_LIMIT'
      | 'QUOTA_EXCEEDED' | 'NETWORK' | 'MODEL_REFUSED'
      | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT'
      | 'CANCELLED' | 'INTERNAL';
  message: string;     // 中文用户文案
  detail?: string;     // 技术细节，只写日志
};
```

`services/gemini.ts` 的 `mapSdkError` 负责把 SDK 异常映射成对应 code，再经 `translate:error` 推给 renderer。renderer 端 `useErrorHandler` hook 按 code 派发 UI 反应。

### 6.3 输入侧前置校验（不走 IPC）

- 文本：trim 后非空、长度 ≤ 50000 字
- 图片 mime：png / jpeg / webp / gif；size ≤ 10MB
- 音频 mime：mp3 / wav / m4a / ogg；size ≤ 20MB
- API key 必须存在；否则按钮 disabled + 提示

### 6.4 日志

- main 进程错误（含栈）→ `%APPDATA%\llmTranslate\logs\app-YYYY-MM-DD.log`，用 `electron-log`
- renderer 的 `window.onerror` / `unhandledrejection` 转 IPC 写到同一日志
- 设置页提供"打开日志目录"按钮

### 6.5 重试

仅 `NETWORK` / `RATE_LIMIT`（且服务端给了 `retry-after`）展示"重试"按钮，复用同 id 重发。**不做自动指数退避** —— 翻译是用户驱动同步动作，自动重试可能无声烧光额度。

### 6.6 数据完整性

- 历史 INSERT 用事务包住 "资产文件移动 + DB 写入"。中途崩溃留下的孤儿资产，由启动清理扫除（DB 没引用即删）。
- 启动时跑 `PRAGMA integrity_check`；损坏则备份并新建，Dialog 通知用户。

## 7. 测试策略

### 7.1 测试层

| 层 | 工具 | 跑在哪 |
|---|---|---|
| 单元 | Vitest | 不启动 Electron |
| 集成 | Vitest + 手写 fake | 启动 main 模块但不开窗 |
| 组件 | Vitest + RTL | jsdom |
| E2E | Playwright + Electron | 真实 Electron |
| 手动 | — | 真机 |

### 7.2 单元测试覆盖

- `mapSdkError(err) → ErrorCode`：mock 几种 SDK 异常
- `buildRequest(payload, apiKey, model)`：text/image/audio 三种 mode 的 prompt+parts 构造
- `secret-store`：写入再读 = 原值；篡改文件后读应抛错
- `history-db`：插入 → 列表 → 搜索 → 收藏过滤 → 容量超限清理 → 删除带资产
- `lib/theme.ts`：`system` 时 `isDark` 切换会更新 `data-theme`
- prompt builder 的 zh→en ↔ en→zh 反转

### 7.3 集成测试

- `translate:run` 端到端，但替换 gemini service 为 fake stream
  - 验证 `translate:chunk` × N → `translate:done` × 1，history 表多 1 条
- `translate:cancel`：cancel 后 main abort，最终 `translate:done` `status:'cancelled'`，无历史
- 错误：fake gemini 抛 401 → renderer 收到 `code: 'INVALID_API_KEY'`

### 7.4 组件测试

- `TranslationView`：连续 dispatch chunk，文本累积
- `LangSwitch`：点击翻转 source/target
- 粘贴图片自动切到图片模式
- Toast / Dialog 在错误码下显示合适文案

### 7.5 E2E（5 条主路径）

1. 首次启动 → 设置 API key → 文本翻译 → 流式 → 历史新增
2. 切换语言方向后翻译方向正确
3. 粘贴图片 → 自动切图片模式 → 翻译 → 历史含资产缩略图
4. 主题三档切换，DOM `data-theme` 与样式都改变
5. 关闭主窗进托盘 → 全局快捷键唤起 → 主窗回来且聚焦输入框

> 系统栏交互在 CI 自动化困难，留人工。

### 7.6 手动验收清单（每次发版前）

- 系统栏图标显示、菜单可点
- 全局快捷键在不同前台应用下都能召唤
- 文件拖拽（资源管理器）正确分流到对应模式
- Windows 改深/浅色后应用即时响应（跟随系统）
- `settings.json` 用文本编辑器打开看不到明文 key
- 清空历史后 `assets/` 下非收藏文件全部清掉

### 7.7 CI

- push：`vitest run` + `playwright test`
- 主分支合并：`electron-builder --win` 出 portable + nsis 安装包，作为 artifact
- 暂不接代码签名（个人工具优先；分发时再加）

## 8. 范围以外（v1 不做）

- 麦克风实时录音（仅音频文件）
- 多语种（仅 zh ↔ en）
- 后端代理 / 商业化
- macOS / Linux 打包
- 弹出式 mini 翻译窗（mouse-anchor popup）
- 翻译收藏的导出/导入
- 多账号 / 多 API key 切换
- 自动重试与指数退避
- 代码签名 / 自动更新

这些决定在 brainstorming 中已显式排除；后续若要补，用新的 spec 增量推。
