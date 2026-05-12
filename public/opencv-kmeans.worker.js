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

function handle(msg) {
  if (!msg || msg.type !== 'quantize') return;
  const {
    seq,
    width,
    height,
    buffer,
    colorCount,
    iterations = 10,
    epsilon = 1.0,
  } = msg;

  const pixelCount = width * height;
  if (pixelCount < colorCount) {
    self.postMessage({
      type: 'error',
      seq,
      message: '画像が小さすぎます (ピクセル数 < 色数)',
    });
    return;
  }

  let src = null;
  let rgb = null;
  let samples = null;
  let labels = null;
  let centers = null;
  let reshaped = null;
  try {
    const imageData = new ImageData(
      new Uint8ClampedArray(buffer),
      width,
      height,
    );
    src = cv.matFromImageData(imageData);
    rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

    reshaped = rgb.reshape(1, pixelCount);
    samples = new cv.Mat();
    reshaped.convertTo(samples, cv.CV_32F);

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

    const labelsArr = new Uint8Array(pixelCount);
    const outRgba = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const k = labels.data32S[i];
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
    if (src) src.delete();
    if (rgb) rgb.delete();
    if (reshaped) reshaped.delete();
    if (samples) samples.delete();
    if (labels) labels.delete();
    if (centers) centers.delete();
  }
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
