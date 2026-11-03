// Self-hosts MediaPipe so the game has no runtime CDN dependency:
// copies the WASM runtime out of node_modules and downloads the hand model once.
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const outDir = join(root, 'client/public/mediapipe');
const modelPath = join(outDir, 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

await mkdir(outDir, { recursive: true });

if (existsSync(wasmSrc)) {
  await cp(wasmSrc, join(outDir, 'wasm'), { recursive: true });
  console.log('[mediapipe] WASM runtime copied');
} else {
  console.log('[mediapipe] tasks-vision not installed yet, skipping WASM copy');
}

const hasModel = existsSync(modelPath) && (await stat(modelPath)).size > 1_000_000;
if (hasModel) {
  console.log('[mediapipe] hand model already present');
} else {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[mediapipe] hand model downloaded');
  } catch (err) {
    // The client falls back to loading the model straight from Google's URL.
    console.warn(`[mediapipe] could not download hand model (${err.message}); the browser will fetch it instead`);
  }
}
