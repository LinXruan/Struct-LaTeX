import { isolateHistory } from "@codemirror/commands";
import { Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildRuleContext } from "../input/contextBuilder";
import {
  evaluateTriggerRules,
  resolvePureStructuralDeleteWithTrigger,
} from "../input/triggerEngine";
import { CompiledTriggerRule, TriggerJsErrorReporter } from "../input/triggerTypes";
import { resolveStructuralDelete } from "../parser/deleteResolver";
import { createKeybindHijackExtension } from "./keybindHijack";
import {
  AnalyzedMathBlock,
  findEmptyMathBlockDeleteSpan,
  getAnalyzedMathBlock,
  isInCodeOrFrontmatter,
} from "./mathRegion";

export { resolvePureStructuralDeleteWithTrigger } from "../input/triggerEngine";

export interface SmartBackspaceOptions {
  isEnabled?: () => boolean;
  getKeybind?: () => string;
  getTriggerRules?: () => readonly CompiledTriggerRule[];
  getParseAmbiguousBars?: () => boolean;
  isMac?: boolean;
  onJsError?: TriggerJsErrorReporter;
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

export function executeSmartBackspace(view: EditorView, parseAmbiguousBars: boolean): boolean {
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

function tryDispatchTriggerDelete(
  view: EditorView,
  analyzed: AnalyzedMathBlock,
  pos: number,
  docDeleteBefore: number,
  docDeleteAfter: number,
  parseAmbiguousBars: boolean
): boolean {
  if (docDeleteBefore === 0 && docDeleteAfter === 0) {
    return executeSmartBackspace(view, parseAmbiguousBars);
  }

  const { state } = view;
  const contentFrom = analyzed.region.contentFrom;
  const contentTo = analyzed.region.contentTo;
  const trigFrom = Math.max(contentFrom, pos - docDeleteBefore);
  const trigTo = Math.min(contentTo, pos + docDeleteAfter);

  const mathSource = state.doc.sliceString(contentFrom, contentTo);
  const relTrigFrom = trigFrom - contentFrom;
  const relTrigTo = trigTo - contentFrom;
  const cleanSource = mathSource.slice(0, relTrigFrom) + mathSource.slice(relTrigTo);

  if (cleanSource.trim().length === 0 && analyzed.region.isClosed) {
    return dispatchAtomicDelete(view, analyzed.region.blockFrom, analyzed.region.blockTo);
  }

  const mergedRelSpan = resolvePureStructuralDeleteWithTrigger(
    mathSource,
    relTrigFrom,
    relTrigTo,
    parseAmbiguousBars
  );
  if (!mergedRelSpan) return false;

  return dispatchAtomicDelete(
    view,
    contentFrom + mergedRelSpan.from,
    contentFrom + mergedRelSpan.to
  );
}

export function createSmartBackspaceExtension(options: SmartBackspaceOptions = {}): Extension {
  const isEnabled = options.isEnabled ?? (() => true);
  const getBars = () => options.getParseAmbiguousBars?.() ?? true;

  const keybindExt = createKeybindHijackExtension({
    isEnabled,
    getKeybind: options.getKeybind ?? (() => "Backspace"),
    defaultKeybind: "Backspace",
    isMac: options.isMac,
    run: (view) => executeSmartBackspace(view, getBars()),
  });

  const inputTriggerExt = Prec.highest(
    EditorView.inputHandler.of((view, from, to, text) => {
      if (!isEnabled()) return false;
      const compiled = options.getTriggerRules?.() ?? [];
      if (compiled.length === 0) return false;

      const { state } = view;
      if (state.readOnly || view.composing) return false;
      if (state.selection.ranges.length > 1) return false;
      if (from !== to || text.length === 0 || text.length > 2) return false;
      if (isInCodeOrFrontmatter(state, from)) return false;

      const parseAmbiguousBars = getBars();
      const analyzed = getAnalyzedMathBlock(state, from, { parseAmbiguousBars });
      if (!analyzed) return false;

      const ctx = buildRuleContext({
        key: text,
        before: state.doc.sliceString(analyzed.region.contentFrom, from),
        after: state.doc.sliceString(from, analyzed.region.contentTo),
        inMath: true,
        inBlockMath: analyzed.region.isBlock,
        inCode: false,
        tree: analyzed.tree,
        relPos: from - analyzed.region.contentFrom,
      });

      const matches = evaluateTriggerRules(compiled, ctx, options.onJsError);
      for (const match of matches) {
        const docDeleteBefore = Math.max(0, match.action.replaceLength - text.length);
        const docDeleteAfter = Math.max(0, match.action.deleteAfter);
        if (
          tryDispatchTriggerDelete(
            view,
            analyzed,
            from,
            docDeleteBefore,
            docDeleteAfter,
            parseAmbiguousBars
          )
        ) {
          return true;
        }
      }
      return false;
    })
  );

  return [keybindExt, inputTriggerExt];
}
