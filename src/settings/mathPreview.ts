import { finishRenderMath, loadMathJax, renderMath } from "obsidian";
import { RulePreviewResult } from "../input/types";

let mathJaxReadyPromise: Promise<void> | null = null;
let flushTimer: number | null = null;

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

export function renderMathPreviewNow(el: HTMLElement, preview: RulePreviewResult): void {
  el.empty();
  el.removeClass("struct-latex-preview-error");

  if (preview.error) {
    el.addClass("struct-latex-preview-error");
    el.setText(preview.error);
    el.setAttr("title", preview.error);
    return;
  }

  el.setAttr("title", preview.rawOutput ? `输出: ${preview.rawOutput}` : "");

  void ensureMathJax().then(() => {
    if (!el.isConnected) return;
    el.empty();
    try {
      const rendered = renderMath(preview.tex, false);
      el.appendChild(rendered);
      scheduleFinishRenderMath();
    } catch (err) {
      el.addClass("struct-latex-preview-error");
      el.setText(`预览异常: ${(err as Error).message}`);
    }
  });
}

export class LazyMathPreviewManager {
  private observer: IntersectionObserver | null = null;
  private readonly pending = new WeakMap<HTMLElement, () => RulePreviewResult>();

  constructor() {
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const target = entry.target as HTMLElement;
            const getter = this.pending.get(target);
            if (!getter) continue;
            this.observer?.unobserve(target);
            this.pending.delete(target);
            renderMathPreviewNow(target, getter());
          }
        },
        { rootMargin: "160px 0px" }
      );
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
    renderMathPreviewNow(el, preview);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
