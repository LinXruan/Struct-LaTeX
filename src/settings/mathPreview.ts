import { finishRenderMath, loadMathJax, renderMath } from "obsidian";
import { t } from "../i18n";
import { RulePreviewResult } from "../input/types";

const MAX_TEX_CACHE = 512;
const FRAME_BUDGET_MS = 6;
const MAX_UNCACHED_PER_FRAME = 4;
const MAX_CACHED_PER_FRAME = 24;

let mathJaxReadyPromise: Promise<void> | null = null;
let flushTimer: number | null = null;
const texDomCache = new Map<string, HTMLElement>();

function ensureMathJax(): Promise<void> {
  if (!mathJaxReadyPromise) {
    mathJaxReadyPromise = loadMathJax().catch(() => {
      mathJaxReadyPromise = null;
    });
  }
  return mathJaxReadyPromise;
}

function scheduleFinishRenderMath(): void {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void finishRenderMath();
  }, 40);
}

function setCachedDom(tex: string, node: HTMLElement): void {
  if (texDomCache.size >= MAX_TEX_CACHE) {
    const oldestKey = texDomCache.keys().next().value;
    if (oldestKey !== undefined) texDomCache.delete(oldestKey);
  }
  texDomCache.set(tex, node.cloneNode(true) as HTMLElement);
}

function findScrollRoot(el: HTMLElement): HTMLElement | null {
  const win = el.ownerDocument.defaultView ?? window;
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const style = win.getComputedStyle(cur);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function applyPreviewErrorOrCache(el: HTMLElement, preview: RulePreviewResult): boolean {
  el.empty();
  el.removeClass("struct-latex-preview-error");

  if (preview.error) {
    el.addClass("struct-latex-preview-error");
    el.setText(preview.error);
    el.setAttr("title", preview.error);
    return true;
  }

  el.setAttr("title", preview.rawOutput ? t("preview.outputTooltip", { output: preview.rawOutput }) : "");

  const cached = texDomCache.get(preview.tex);
  if (cached) {
    el.appendChild(cached.cloneNode(true));
    return true;
  }
  return false;
}

function renderUncachedMath(el: HTMLElement, tex: string): boolean {
  try {
    const rendered = renderMath(tex, false);
    setCachedDom(tex, rendered);
    el.appendChild(rendered);
    return true;
  } catch (err) {
    el.addClass("struct-latex-preview-error");
    el.setText(t("preview.renderError", { msg: (err as Error).message }));
    return false;
  }
}

export function renderMathPreviewNow(el: HTMLElement, preview: RulePreviewResult): void {
  if (applyPreviewErrorOrCache(el, preview)) return;

  void ensureMathJax().then(() => {
    if (!el.isConnected) return;
    if (applyPreviewErrorOrCache(el, preview)) return;
    if (renderUncachedMath(el, preview.tex)) {
      scheduleFinishRenderMath();
    }
  });
}

export class LazyMathPreviewManager {
  private observer: IntersectionObserver | null = null;
  private readonly pending = new WeakMap<HTMLElement, () => RulePreviewResult>();
  private readonly queuedSet = new Set<HTMLElement>();
  private readonly queue: HTMLElement[] = [];
  private readonly win: Window;
  private rafId: number | null = null;
  private destroyed = false;

  constructor(containerEl?: HTMLElement) {
    this.win = containerEl?.ownerDocument.defaultView ?? window;
    if (typeof IntersectionObserver !== "undefined") {
      const root = containerEl ? findScrollRoot(containerEl) : null;
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            if (!this.pending.has(target)) continue;
            if (entry.isIntersecting) {
              this.enqueue(target);
            } else {
              this.queuedSet.delete(target);
            }
          }
        },
        { root, rootMargin: "160px 0px" }
      );
    }
  }

  private enqueue(el: HTMLElement): void {
    if (this.queuedSet.has(el)) return;
    this.queuedSet.add(el);
    this.queue.push(el);
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.rafId !== null || this.destroyed) return;
    this.rafId = this.win.requestAnimationFrame(() => {
      this.rafId = null;
      void this.drainQueue();
    });
  }

  private async drainQueue(): Promise<void> {
    if (this.destroyed || this.queue.length === 0) return;
    await ensureMathJax();
    if (this.destroyed) return;

    const start = performance.now();
    let uncachedCount = 0;
    let totalCount = 0;
    let needsFinish = false;

    while (this.queue.length > 0) {
      if (uncachedCount >= MAX_UNCACHED_PER_FRAME || totalCount >= MAX_CACHED_PER_FRAME) break;
      if (totalCount > 0 && performance.now() - start >= FRAME_BUDGET_MS) break;

      const target = this.queue.shift()!;
      if (!this.queuedSet.has(target) || !target.isConnected) continue;
      this.queuedSet.delete(target);

      const getter = this.pending.get(target);
      if (!getter) continue;

      this.observer?.unobserve(target);
      this.pending.delete(target);

      const preview = getter();
      totalCount++;
      if (!applyPreviewErrorOrCache(target, preview)) {
        if (renderUncachedMath(target, preview.tex)) {
          needsFinish = true;
        }
        uncachedCount++;
      }
    }

    if (needsFinish) {
      scheduleFinishRenderMath();
    }
    if (this.queue.length > 0 && !this.destroyed) {
      this.scheduleDrain();
    }
  }

  observe(el: HTMLElement, getPreview: () => RulePreviewResult): void {
    if (!this.observer) {
      renderMathPreviewNow(el, getPreview());
      return;
    }
    this.pending.set(el, getPreview);
    this.observer.observe(el);
  }

  refresh(el: HTMLElement, preview: RulePreviewResult): void {
    this.observer?.unobserve(el);
    this.pending.delete(el);
    this.queuedSet.delete(el);
    renderMathPreviewNow(el, preview);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId !== null) {
      this.win.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.observer?.disconnect();
    this.observer = null;
    this.queuedSet.clear();
    this.queue.length = 0;
  }
}
