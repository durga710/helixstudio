/**
 * Lazy CDN loader for the in-browser ML stack used by the Classifier widget:
 * TensorFlow.js + MobileNet (feature embeddings) + a KNN classifier. This is
 * the exact "Teachable Machine" recipe — show examples, it learns, you test —
 * and it runs entirely client-side with no backend.
 *
 * Loaded from a CDN (like our game engines) so it never bloats the main bundle;
 * only the AI Lab pays for it, and only when a Classifier mounts.
 */

export type MLTensor = { dispose(): void };

export interface MobileNetModel {
  /** With embedding=true, returns the feature activation (a tensor). */
  infer(input: CanvasImageSource, embedding?: boolean): MLTensor;
}

export interface KnnClassifier {
  addExample(example: MLTensor, label: number): void;
  predictClass(
    example: MLTensor,
    k?: number,
  ): Promise<{ label: string; confidences: Record<string, number> }>;
  getNumLabels(): number;
  clearAllLabels(): void;
}

interface MLWindow {
  mobilenet: { load(): Promise<MobileNetModel> };
  knnClassifier: { create(): KnnClassifier };
}

export interface MLStack {
  net: MobileNetModel;
  createClassifier(): KnnClassifier;
}

const TFJS = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const MOBILENET = "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js";
const KNN = "https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.6/dist/knn-classifier.min.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
}

let cached: Promise<MLStack> | null = null;

/** Load (once) and return the ML stack — MobileNet model + a KNN factory. */
export function ensureML(): Promise<MLStack> {
  if (cached) return cached;
  cached = (async () => {
    await loadScript(TFJS);
    await Promise.all([loadScript(MOBILENET), loadScript(KNN)]);
    const w = window as unknown as MLWindow;
    const net = await w.mobilenet.load();
    return { net, createClassifier: () => w.knnClassifier.create() };
  })();
  return cached;
}
