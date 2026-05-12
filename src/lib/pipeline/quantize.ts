import type { OpenCV } from "./opencv-loader";

export type QuantizeInput = {
  imageData: ImageData;
  colorCount: number;
  iterations?: number;
  epsilon?: number;
};

export type QuantizedImage = {
  imageData: ImageData;
  palette: Array<[number, number, number]>;
  labels: Uint8Array;
};

type CvMat = {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32S: Int32Array;
  data32F: Float32Array;
  delete: () => void;
  convertTo: (dst: CvMat, type: number) => void;
  reshape: (cn: number, rows: number) => CvMat;
};

type CvLike = {
  CV_32F: number;
  CV_8U: number;
  COLOR_RGBA2RGB: number;
  KMEANS_PP_CENTERS: number;
  TermCriteria_EPS: number;
  TermCriteria_MAX_ITER: number;
  Mat: new (rows?: number, cols?: number, type?: number) => CvMat;
  TermCriteria: new (type: number, maxCount: number, epsilon: number) => unknown;
  matFromImageData: (imageData: ImageData) => CvMat;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  kmeans: (
    samples: CvMat,
    k: number,
    bestLabels: CvMat,
    criteria: unknown,
    attempts: number,
    flags: number,
    centers: CvMat,
  ) => number;
};

export async function quantize(
  cv: OpenCV,
  input: QuantizeInput,
): Promise<QuantizedImage> {
  const c = cv as CvLike;
  const { imageData, colorCount, iterations = 10, epsilon = 1.0 } = input;
  const { width, height } = imageData;
  const pixelCount = width * height;

  if (pixelCount < colorCount) {
    throw new Error("画像が小さすぎます (ピクセル数 < 色数)");
  }
  if (colorCount < 1 || colorCount > 64) {
    throw new Error(`colorCount は 1..64 の範囲: ${colorCount}`);
  }

  const src = c.matFromImageData(imageData);
  const rgb = new c.Mat();
  const samplesU8 = new c.Mat();
  const samples = new c.Mat();
  const labels = new c.Mat();
  const centers = new c.Mat();
  try {
    c.cvtColor(src, rgb, c.COLOR_RGBA2RGB);
    const reshaped = rgb.reshape(1, pixelCount);
    try {
      reshaped.convertTo(samples, c.CV_32F);
    } finally {
      reshaped.delete();
    }
    void samplesU8;

    const criteria = new c.TermCriteria(
      c.TermCriteria_EPS + c.TermCriteria_MAX_ITER,
      iterations,
      epsilon,
    );

    c.kmeans(
      samples,
      colorCount,
      labels,
      criteria,
      3,
      c.KMEANS_PP_CENTERS,
      centers,
    );

    const palette: Array<[number, number, number]> = [];
    for (let k = 0; k < colorCount; k++) {
      const r = clampByte(centers.data32F[k * 3 + 0]);
      const g = clampByte(centers.data32F[k * 3 + 1]);
      const b = clampByte(centers.data32F[k * 3 + 2]);
      palette.push([r, g, b]);
    }

    const outLabels = new Uint8Array(pixelCount);
    const outData = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const k = labels.data32S[i];
      outLabels[i] = k;
      const [r, g, b] = palette[k];
      outData[i * 4 + 0] = r;
      outData[i * 4 + 1] = g;
      outData[i * 4 + 2] = b;
      outData[i * 4 + 3] = 255;
    }

    return {
      imageData: new ImageData(outData, width, height),
      palette,
      labels: outLabels,
    };
  } finally {
    src.delete();
    rgb.delete();
    samples.delete();
    samplesU8.delete();
    labels.delete();
    centers.delete();
  }
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
