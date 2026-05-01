import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

window.addEventListener('error', (e) => window.electron.log?.error?.(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => window.electron.log?.error?.(`unhandled promise: ${String(e.reason)}`));

createRoot(document.getElementById('root')!).render(<App />);
