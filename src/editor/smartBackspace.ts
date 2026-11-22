import { isolateHistory } from "@codemirror/commands";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { resolveStructuralDelete } from "../parser/deleteResolver";
import { createKeybindHijackExtension } from "./keybindHijack";
import { findEmptyMathBlockDeleteSpan, getAnalyzedMathBlock } from "./mathRegion";

export interface SmartBackspaceOptions {
  isEnabled?: () => boolean;
  getKeybind?: () => string;
  getParseAmbiguousBars?: () => boolean;
  isMac?: boolean;
}

function dispatchAtomicDelete(view: EditorView, from: number, to: number): boolean {
  view.dispatch({
    changes: { from, to, insert: "" },
    selection: { anchor: from },
    annotations: [isolateHistory.of("full")],
    userEvent: "delete.struct-latex",
  });
  return true;
}

function handleSmartBackspace(view: EditorView, parseAmbiguousBars: boolean): boolean {
  const { state } = view;
  if (state.readOnly || view.composing) return false;
  if (state.selection.ranges.length > 1) return false;

  const sel = state.selection.main;
  if (!sel.empty) return false;

  const pos = sel.head;

  // 1. Empty math block boundary cleanup (`$|$`, `$$|`, `$$\n|\n$$`)
  const emptySpan = findEmptyMathBlockDeleteSpan(state, pos);
  if (emptySpan) {
    return dispatchAtomicDelete(view, emptySpan.from, emptySpan.to);
  }

  // 2. Single-math-block object tree lookup & transitive delete closure
  const analyzed = getAnalyzedMathBlock(state, pos, { parseAmbiguousBars });
  if (!analyzed) return false;

  const relPos = pos - analyzed.region.contentFrom;
  const relSpan = resolveStructuralDelete(analyzed.tree, relPos);
  if (!relSpan) return false;

  return dispatchAtomicDelete(
    view,
    analyzed.region.contentFrom + relSpan.from,
    analyzed.region.contentFrom + relSpan.to
  );
}

export function createSmartBackspaceExtension(options: SmartBackspaceOptions = {}): Extension {
  return createKeybindHijackExtension({
    isEnabled: options.isEnabled ?? (() => true),
    getKeybind: options.getKeybind ?? (() => "Backspace"),
    defaultKeybind: "Backspace",
    isMac: options.isMac,
    run: (view) => handleSmartBackspace(view, options.getParseAmbiguousBars?.() ?? true),
  });
}
