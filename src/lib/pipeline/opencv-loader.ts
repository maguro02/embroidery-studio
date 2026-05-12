/**
 * OpenCV.js を CDN から動的ロードする。
 * WASMの初期化完了まで待ってから cv を返す。
 */

declare global {
  interface Window {
    cv?: OpenCV & { onRuntimeInitialized?: () => void };
  }
}

export type OpenCV = unknown;

const OPENCV_URL = "https://docs.opencv.org/4.x/opencv.js";

let cvPromise: Promise<OpenCV> | null = null;

export function getOpenCV(): Promise<OpenCV> {
  if (cvPromise) return cvPromise;
  cvPromise = (async () => {
    if (typeof window === "undefined") {
      throw new Error("OpenCV.js can only be loaded in a browser context");
    }
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = OPENCV_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${OPENCV_URL}`));
      document.head.appendChild(s);
    });
    await new Promise<void>((resolve) => {
      const check = () => {
        const cv = window.cv;
        if (cv && (cv as { Mat?: unknown }).Mat) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
    return window.cv as OpenCV;
  })();
  return cvPromise;
}
