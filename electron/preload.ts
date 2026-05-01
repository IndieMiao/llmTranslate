// Will be expanded in Task 12 with the typed IPC bridge.
import { contextBridge } from 'electron';
contextBridge.exposeInMainWorld('electron', { ready: true });
