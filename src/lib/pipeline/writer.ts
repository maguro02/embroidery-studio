import type { PyodideInstance } from "./pyodide-loader";
import type { StitchPattern } from "./types";
import type { EmbroideryFormat } from "@/components/embroidery-studio";

export type WriteInput = {
  pattern: StitchPattern;
  format: EmbroideryFormat;
};

const PY_CODE = `
import json
import pyembroidery
from pyembroidery import EmbPattern, STITCH, JUMP, TRIM, COLOR_CHANGE, END

KIND_TO_CMD = {
    "run": STITCH,
    "satin": STITCH,
    "fill": STITCH,
    "jump": JUMP,
    "trim": TRIM,
    "stop": COLOR_CHANGE,
}

def build_pattern(pattern_json: str, fmt: str) -> bytes:
    p = json.loads(pattern_json)
    emb = EmbPattern()
    h10 = int(p["heightMm"] * 10)
    for bi, block in enumerate(p["blocks"]):
        r, g, b = block["rgb"]
        emb.add_thread({"rgb": (int(r), int(g), int(b))})
        for s in block["stitches"]:
            cmd = KIND_TO_CMD.get(s["kind"], STITCH)
            x = int(round(s["x"] * 10))
            y = h10 - int(round(s["y"] * 10))
            emb.add_stitch_absolute(cmd, x, y)
    emb.add_stitch_relative(END, 0, 0)
    out_path = "/tmp/out." + fmt
    pyembroidery.write(emb, out_path)
    with open(out_path, "rb") as f:
        return f.read()
`;

let pyInitialized = false;

export async function writeEmbroidery(
  py: PyodideInstance,
  input: WriteInput,
): Promise<Blob> {
  if (!pyInitialized) {
    await py.runPythonAsync(PY_CODE);
    pyInitialized = true;
  }

  py.globals.set("pattern_json", JSON.stringify(input.pattern));
  py.globals.set("fmt", input.format);

  const result = (await py.runPythonAsync(
    "build_pattern(pattern_json, fmt)",
  )) as unknown;

  const bytes = toUint8Array(result);
  return new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  const proxy = value as {
    toJs?: (opts?: { create_proxies?: boolean }) => unknown;
    getBuffer?: () => { data: Uint8Array; release: () => void };
    destroy?: () => void;
  };
  if (proxy && typeof proxy.getBuffer === "function") {
    const buf = proxy.getBuffer();
    try {
      return new Uint8Array(buf.data);
    } finally {
      buf.release();
      proxy.destroy?.();
    }
  }
  if (proxy && typeof proxy.toJs === "function") {
    const js = proxy.toJs({ create_proxies: false });
    proxy.destroy?.();
    if (js instanceof Uint8Array) return js;
    if (Array.isArray(js)) return new Uint8Array(js);
  }
  throw new Error("pyembroidery output: could not convert to Uint8Array");
}

/** UI 等から再初期化したい場合の hook (テスト用) */
export function __resetWriterCache() {
  pyInitialized = false;
}
