import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

if (!global.URL.createObjectURL) {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
}

// jsdom Blob/File does not implement arrayBuffer().
// Access the internal _buffer via the Symbol(impl) wrapper jsdom attaches to every WebIDL object.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self = this as any;
    // jsdom stores impl under the Symbol whose description is 'impl'
    const implSym = Object.getOwnPropertySymbols(self).find(
      (s) => s.description === 'impl',
    );
    if (implSym) {
      const buf: Buffer = self[implSym]._buffer;
      if (buf) {
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        return Promise.resolve(ab);
      }
    }
    // Fallback: FileReader (fires async but better than throwing)
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer));
      reader.addEventListener('error', () => reject(reader.error));
      reader.readAsArrayBuffer(this as Blob);
    });
  };
}
