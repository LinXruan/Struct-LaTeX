import { finishRenderMath, loadMathJax, renderMath } from "obsidian";

const MAX_TEX_CACHE = 512;

let mathJaxReadyPromise: Promise<void> | null = null;
let mathJaxLoaded = false;
let flushTimer: number | null = null;
const texDomCache = new Map<string, HTMLElement>();

function cacheKey(tex: string, display: boolean): string {
  return `${display ? "1" : "0"}:${tex}`;
}

export function isMathJaxLoaded(): boolean {
  return mathJaxLoaded;
}

export function ensureMathJax(): Promise<void> {
  if (!mathJaxReadyPromise) {
    mathJaxReadyPromise = loadMathJax()
      .then(() => {
        mathJaxLoaded = true;
      })
      .catch(() => {
        mathJaxReadyPromise = null;
      });
  }
  return mathJaxReadyPromise;
}

export function scheduleFinishRenderMath(delayMs = 40): void {
  if (delayMs <= 0) {
    void finishRenderMath();
    return;
  }
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void finishRenderMath();
  }, delayMs);
}

export function getCachedTexDom(tex: string, display = false): HTMLElement | null {
  const cached = texDomCache.get(cacheKey(tex, display));
  return cached ? (cached.cloneNode(true) as HTMLElement) : null;
}

function setCachedTexDom(tex: string, display: boolean, node: HTMLElement): void {
  const key = cacheKey(tex, display);
  if (texDomCache.size >= MAX_TEX_CACHE) {
    const oldestKey = texDomCache.keys().next().value;
    if (oldestKey !== undefined) texDomCache.delete(oldestKey);
  }
  texDomCache.set(key, node.cloneNode(true) as HTMLElement);
}

export interface RenderTexResult {
  ok: boolean;
  cached: boolean;
  error?: string;
}

/**
 * Renders `tex` into `targetEl` using the shared LRU DOM cache and Obsidian's MathJax runtime.
 * Assumes `ensureMathJax()` has resolved before calling when uncached.
 */
export function renderTexToElement(
  targetEl: HTMLElement,
  tex: string,
  display = false
): RenderTexResult {
  const cachedNode = getCachedTexDom(tex, display);
  if (cachedNode) {
    targetEl.appendChild(cachedNode);
    return { ok: true, cached: true };
  }

  try {
    const rendered = renderMath(tex, display);
    setCachedTexDom(tex, display, rendered);
    targetEl.appendChild(rendered);
    return { ok: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      cached: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
