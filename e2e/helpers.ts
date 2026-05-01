import { _electron, type ElectronApplication, type Page } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function launchApp(env: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await _electron.launch({
    args: [path.join(__dirname, '..', 'dist-electron', 'index.js')],
    env: { ...process.env, ...env, NODE_ENV: 'test' },
  });
  const page = await app.firstWindow();
  return { app, page };
}
