// OpenCV.js を WebWorker で動かして画像を k-means 量子化する。
// メインスレッドからは
//   { type: 'quantize', seq, width, height, buffer, colorCount, iterations, epsilon }
// を postMessage で送る。結果は
//   { type: 'result', seq, paletteBuf, labelsBuf, outBuf, width, height }
// で返す (Transferable で 3 つの ArrayBuffer をゼロコピー転送)。
//
// このファイルは plain JS。public/ に置いて static 配信される。

/* global cv */

self.importScripts('/opencv.js');

let ready = false;
const queued = [];

cv['onRuntimeInitialized'] = () => {
  ready = true;
  self.postMessage({ type: 'ready' });
  for (const msg of queued) handle(msg);
  queued.length = 0;
};

self.onmessage = (e) => {
  if (ready) handle(e.data);
  else queued.push(e.data);
};

// labels に書き込む「背景」 sentinel 値。Uint8Array なので 0..colorCount-1 とぶつからない 255。
const BACKGROUND_LABEL = 0xff;

function handle(msg) {
  if (!msg || msg.type !== 'quantize') return;
  const {
    seq,
    width,
    height,
    buffer,
    maskBuffer,
    colorCount,
    iterations = 10,
    epsilon = 1.0,
  } = msg;

  const pixelCount = width * height;
  const srcU8 = new Uint8ClampedArray(buffer);
  const opaqueMask = maskBuffer ? new Uint8Array(maskBuffer) : null;

  // 不透明ピクセルだけを k-means に投入する。
  // opaqueMask が未指定なら全ピクセル不透明として扱う (後方互換)。
  const opaqueIndices = [];
  for (let i = 0; i < pixelCount; i++) {
    if (!opaqueMask || opaqueMask[i] === 1) opaqueIndices.push(i);
  }
  const opaqueCount = opaqueIndices.length;

  if (opaqueCount < colorCount) {
    self.postMessage({
      type: 'error',
      seq,
      message: '不透明ピクセル数が色数より少ないため減色できません',
    });
    return;
  }

  // RGBA → Float32 RGB を不透明ピクセルだけで構築。
  const rgbF32 = new Float32Array(opaqueCount * 3);
  for (let j = 0; j < opaqueCount; j++) {
    const i = opaqueIndices[j];
    rgbF32[j * 3 + 0] = srcU8[i * 4 + 0];
    rgbF32[j * 3 + 1] = srcU8[i * 4 + 1];
    rgbF32[j * 3 + 2] = srcU8[i * 4 + 2];
  }

  let samples = null;
  let labels = null;
  let centers = null;
  try {
    samples = cv.matFromArray(opaqueCount, 3, cv.CV_32FC1, rgbF32);

    const criteria = new cv.TermCriteria(
      cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER,
      iterations,
      epsilon,
    );

    labels = new cv.Mat();
    centers = new cv.Mat();
    cv.kmeans(
      samples,
      colorCount,
      labels,
      criteria,
      1,
      cv.KMEANS_PP_CENTERS,
      centers,
    );

    const palette = new Uint8Array(colorCount * 3);
    for (let k = 0; k < colorCount; k++) {
      palette[k * 3 + 0] = clampByte(centers.data32F[k * 3 + 0]);
      palette[k * 3 + 1] = clampByte(centers.data32F[k * 3 + 1]);
      palette[k * 3 + 2] = clampByte(centers.data32F[k * 3 + 2]);
    }

    // 出力 labels と RGBA: 透明ピクセルは sentinel ラベル + 白で埋める。
    const labelsArr = new Uint8Array(pixelCount).fill(BACKGROUND_LABEL);
    const outRgba = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      outRgba[i * 4 + 0] = 255;
      outRgba[i * 4 + 1] = 255;
      outRgba[i * 4 + 2] = 255;
      outRgba[i * 4 + 3] = 255;
    }
    for (let j = 0; j < opaqueCount; j++) {
      const i = opaqueIndices[j];
      const k = labels.data32S[j];
      labelsArr[i] = k;
      outRgba[i * 4 + 0] = palette[k * 3 + 0];
      outRgba[i * 4 + 1] = palette[k * 3 + 1];
      outRgba[i * 4 + 2] = palette[k * 3 + 2];
      outRgba[i * 4 + 3] = 255;
    }

    self.postMessage(
      {
        type: 'result',
        seq,
        width,
        height,
        colorCount,
        paletteBuf: palette.buffer,
        labelsBuf: labelsArr.buffer,
        outBuf: outRgba.buffer,
      },
      [palette.buffer, labelsArr.buffer, outRgba.buffer],
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      seq,
      message: (err && err.message) || String(err),
    });
  } finally {
    if (samples) samples.delete();
    if (labels) labels.delete();
    if (centers) centers.delete();
  }
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
