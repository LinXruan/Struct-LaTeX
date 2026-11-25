import { EditorSelection, Extension, StateEffect, StateField, Transaction } from "@codemirror/state";
import {
  EditorView,
  Rect,
  repositionTooltips,
  showTooltip,
  Tooltip,
  TooltipView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { InlineMathPreviewPosition } from "../input/types";
import {
  computeInlineMathPreviewAnchorRect,
  InlineMathPreviewTarget,
  isMultiLinePreviewSpan,
  resolveInlineMathPreviewTarget,
} from "./inlineMathPreviewState";
import {
  ensureMathJax,
  flushFinishRenderMath,
  isMathJaxLoaded,
  renderTexToElement,
} from "./mathJaxCache";

export const refreshInlineMathPreviewEffect = StateEffect.define<null>();

const setEditorFocusEffect = StateEffect.define<boolean>();

export interface InlineMathPreviewOptions {
  getPosition: () => InlineMathPreviewPosition;
}

interface PreviewTooltip extends Tooltip {
  readonly target: InlineMathPreviewTarget;
}

function targetsEqual(a: InlineMathPreviewTarget, b: InlineMathPreviewTarget): boolean {
  return (
    a.blockFrom === b.blockFrom &&
    a.blockTo === b.blockTo &&
    a.tex === b.tex &&
    a.position === b.position
  );
}

function renderIntoTooltipDom(view: EditorView, dom: HTMLElement, tex: string): void {
  const apply = (): void => {
    dom.replaceChildren();
    const res = renderTexToElement(dom, tex, false);
    if (!res.ok) {
      dom.createSpan({
        cls: "struct-latex-inline-preview-error",
        text: res.error ?? "",
      });
      return;
    }
    if (!res.cached) {
      void flushFinishRenderMath().then(() => {
        if (dom.isConnected) repositionTooltips(view);
      });
    }
  };

  if (isMathJaxLoaded()) {
    apply();
    return;
  }

  void ensureMathJax().then(() => {
    if (!dom.isConnected) return;
    apply();
    repositionTooltips(view);
  });
}

function syncTooltipFontSize(view: EditorView, dom: HTMLElement): void {
  const win = view.dom.ownerDocument.defaultView;
  const fontSize = win?.getComputedStyle(view.contentDOM).fontSize;
  if (fontSize && dom.style.fontSize !== fontSize) {
    dom.style.fontSize = fontSize;
  }
}

const OFFSCREEN_RECT: Rect = {
  left: -100_000,
  right: -100_000,
  top: -100_000,
  bottom: -100_000,
};

function resolveTooltipCoords(view: EditorView, target: InlineMathPreviewTarget): Rect {
  const startCoords = view.coordsAtPos(target.blockFrom, 1);
  const endCoords = view.coordsAtPos(target.blockTo, -1);

  let lastLineStartCoords: Rect | null = null;
  if (
    endCoords &&
    target.position === "below" &&
    (!startCoords || isMultiLinePreviewSpan(startCoords, endCoords))
  ) {
    const lineStart = view.moveToLineBoundary(
      EditorSelection.cursor(target.blockTo, -1),
      false,
      true
    );
    lastLineStartCoords = view.coordsAtPos(lineStart.head, 1);
  }

  return (
    computeInlineMathPreviewAnchorRect(
      startCoords,
      endCoords,
      lastLineStartCoords,
      target.position
    ) ?? OFFSCREEN_RECT
  );
}

function createPreviewTooltip(target: InlineMathPreviewTarget): PreviewTooltip {
  return {
    pos: target.blockFrom,
    end: target.blockTo,
    above: target.position === "above",
    strictSide: false,
    target,
    create(view: EditorView): TooltipView {
      const dom = createDiv({ cls: "struct-latex-inline-preview-tooltip" });
      syncTooltipFontSize(view, dom);
      renderIntoTooltipDom(view, dom, target.tex);
      return {
        dom,
        offset: { x: 0, y: 4 },
        getCoords: () => resolveTooltipCoords(view, target),
        update(update: ViewUpdate): void {
          if (update.geometryChanged) {
            syncTooltipFontSize(update.view, dom);
          }
        },
      };
    },
  };
}

/**
 * Displays a pure non-interactive MathJax live preview tooltip above or below
 * inline `$...$` / `\(...\)` formulas when editing in Obsidian Live Preview.
 */
export function createInlineMathPreviewExtension(options: InlineMathPreviewOptions): Extension {
  const editorFocusField = StateField.define<boolean>({
    create: () => false,
    update(value, tr) {
      for (const effect of tr.effects) {
        if (effect.is(setEditorFocusEffect)) return effect.value;
      }
      return value;
    },
  });

  const computeTooltip = (state: EditorView["state"]): PreviewTooltip | null => {
    if (!state.field(editorFocusField, false)) return null;
    if (!state.field(editorLivePreviewField, false)) return null;
    const target = resolveInlineMathPreviewTarget(state, options.getPosition());
    return target ? createPreviewTooltip(target) : null;
  };

  const previewTooltipField = StateField.define<PreviewTooltip | null>({
    create: (state) => computeTooltip(state),
    update(prev, tr) {
      const prevLivePreview = Boolean(tr.startState.field(editorLivePreviewField, false));
      const nextLivePreview = Boolean(tr.state.field(editorLivePreviewField, false));
      const relevantEffect = tr.effects.some(
        (e) => e.is(refreshInlineMathPreviewEffect) || e.is(setEditorFocusEffect)
      );

      if (!tr.docChanged && !tr.selection && !relevantEffect && prevLivePreview === nextLivePreview) {
        return prev;
      }

      if (!tr.state.field(editorFocusField, false) || !nextLivePreview) {
        return null;
      }

      const target = resolveInlineMathPreviewTarget(tr.state, options.getPosition());
      if (!target) return null;
      if (prev && targetsEqual(prev.target, target)) {
        return prev;
      }
      return createPreviewTooltip(target);
    },
    provide: (field) => showTooltip.from(field),
  });

  const focusSyncPlugin = ViewPlugin.fromClass(
    class {
      private destroyed = false;

      constructor(view: EditorView) {
        this.syncFocus(view);
      }

      update(update: ViewUpdate): void {
        if (update.focusChanged) {
          this.syncFocus(update.view);
        }
      }

      destroy(): void {
        this.destroyed = true;
      }

      private syncFocus(view: EditorView): void {
        const focused = view.hasFocus;
        if (focused === view.state.field(editorFocusField, false)) return;
        queueMicrotask(() => {
          if (this.destroyed) return;
          const current = view.hasFocus;
          if (current !== view.state.field(editorFocusField, false)) {
            view.dispatch({
              effects: setEditorFocusEffect.of(current),
              annotations: [Transaction.addToHistory.of(false)],
            });
          }
        });
      }
    }
  );

  return [editorFocusField, previewTooltipField, focusSyncPlugin];
}
