/**
 * OpenCV.js を CDN から動的ロードする。
 *
 * OpenCV.js は WebAssembly モジュールで、スクリプトの `load` イベントは
 * "ファイル取得完了" であって "ランタイム初期化完了" ではない。
 * 公式の推奨は次のいずれか:
 *   - `Module.onRuntimeInitialized` を待つ
 *   - 新しいビルドは `await cv` で Promise を解く
 * 両方に対応する。
 *
 * https://docs.opencv.org/4.x/d0/d84/tutorial_js_usage.html
 */

export type OpenCV = unknown;

const OPENCV_URL =
  "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js";
const LOAD_TIMEOUT_MS = 60_000;

let cvPromise: Promise<OpenCV> | null = null;

export function getOpenCV(): Promise<OpenCV> {
  if (cvPromise) return cvPromise;
  cvPromise = loadOpenCV();
  return cvPromise;
}

function loadOpenCV(): Promise<OpenCV> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV.js は ブラウザでのみ利用可能"));
  }

  return new Promise<OpenCV>((resolve, reject) => {
    const w = window as unknown as {
      cv?: unknown;
      Module?: { onRuntimeInitialized?: () => void };
    };

    const timer = setTimeout(() => {
      reject(new Error("OpenCV.js のロードがタイムアウトしました"));
    }, LOAD_TIMEOUT_MS);

    const finalize = async (raw: unknown) => {
      try {
        let cv = raw;
        if (cv && typeof (cv as { then?: unknown }).then === "function") {
          cv = await (cv as Promise<unknown>);
        }
        if (cv && hasMat(cv)) {
          clearTimeout(timer);
          (w as { cv?: unknown }).cv = cv;
          resolve(cv);
          return;
        }
        if (cv && typeof cv === "object") {
          const cvObj = cv as { onRuntimeInitialized?: () => void };
          const prev = cvObj.onRuntimeInitialized;
          cvObj.onRuntimeInitialized = () => {
            try {
              prev?.();
            } catch (e) {
              console.warn("opencv: prev onRuntimeInitialized threw", e);
            }
            clearTimeout(timer);
            resolve(cv);
          };
          return;
        }
        clearTimeout(timer);
        reject(new Error("OpenCV.js: cv オブジェクトが見つかりません"));
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    };

    if (w.cv) {
      void finalize(w.cv);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-opencv="true"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => void finalize(w.cv));
      existing.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("OpenCV.js のロードに失敗しました"));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = OPENCV_URL;
    script.async = true;
    script.dataset.opencv = "true";
    script.onload = () => void finalize(w.cv);
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("OpenCV.js のロードに失敗しました"));
    };
    document.head.appendChild(script);
  });
}

function hasMat(cv: unknown): boolean {
  return (
    typeof cv === "object" &&
    cv !== null &&
    typeof (cv as { Mat?: unknown }).Mat === "function"
  );
}
