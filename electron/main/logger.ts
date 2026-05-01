import log from 'electron-log/main';
import path from 'node:path';
import { app } from 'electron';

export function initLogger(): void {
  log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', `app-${new Date().toISOString().slice(0, 10)}.log`);
  log.transports.file.level = 'info';
  log.transports.console.level = 'debug';
  log.errorHandler.startCatching({ showDialog: false });
}

export const logger = log;
