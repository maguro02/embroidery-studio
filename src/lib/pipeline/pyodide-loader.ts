/**
 * Pyodide を CDN から動的ロードし、pyembroidery をインストールするローダー。
 * Web Worker から呼び出して UI スレッドを止めないこと。
 */

declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<PyodideInstance>;
  }
}

export type PyodideInstance = {
  loadPackage: (name: string | string[]) => Promise<void>;
  runPythonAsync: (code: string) => Promise<unknown>;
  pyimport: (name: string) => unknown;
  globals: { get: (name: string) => unknown; set: (name: string, value: unknown) => void };
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
  };
};

const PYODIDE_VERSION = "0.29.4";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise: Promise<PyodideInstance> | null = null;

export function getPyodide(): Promise<PyodideInstance> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    if (typeof window === "undefined") {
      throw new Error("Pyodide can only be loaded in a browser context");
    }
    await loadScript(`${PYODIDE_CDN}pyodide.js`);
    if (!window.loadPyodide) throw new Error("loadPyodide not available");
    const pyodide = await window.loadPyodide({ indexURL: PYODIDE_CDN });
    await pyodide.loadPackage(["micropip"]);
    await pyodide.runPythonAsync(`
import micropip
await micropip.install("pyembroidery")
`);
    return pyodide;
  })();
  return pyodidePromise;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
