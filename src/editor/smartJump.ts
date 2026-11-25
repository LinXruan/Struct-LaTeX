import { isolateHistory } from "@codemirror/commands";
import { ChangeSpec, EditorState, Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildRuleContext } from "../input/contextBuilder";
import {
  evaluateTriggerRules,
  resolvePureStructuralJumpWithTrigger,
} from "../input/triggerEngine";
import { CompiledTriggerRule, TriggerJsErrorReporter } from "../input/triggerTypes";
import { resolveStructuralJump } from "../parser/jumpResolver";
import { StructuralJumpMode } from "../parser/types";
import { createKeybindHijackExtension } from "./keybindHijack";
import { AnalyzedMathBlock, getAnalyzedMathBlock, isInCodeOrFrontmatter, MathRegion } from "./mathRegion";

export { resolvePureStructuralJumpWithTrigger } from "../input/triggerEngine";

export interface SmartJumpOptions {
  mode?: StructuralJumpMode;
  defaultKeybind?: string;
  isEnabled?: () => boolean;
  getKeybind?: () => string;
  getTriggerRules?: () => readonly CompiledTriggerRule[];
  getParseAmbiguousBars?: () => boolean;
  isMac?: boolean;
  onJsError?: TriggerJsErrorReporter;
}

type JumpAction =
  | { kind: "move"; anchor: number }
  | { kind: "insert"; pos: number; text: string; anchor: number };

function resolveMathBlockExit(state: EditorState, region: MathRegion): JumpAction | null {
  if (!region.isClosed) return null;

  const doc = state.doc;
  const exitPos = region.blockTo;

  if (region.isBlock) {
    const endLine = doc.lineAt(exitPos);
    const restOfLine = doc.sliceString(exitPos, endLine.to);
    if (restOfLine.trim().length === 0) {
      if (endLine.number < doc.lines) {
        return { kind: "move", anchor: doc.line(endLine.number + 1).from };
      }
      return { kind: "insert", pos: endLine.to, text: "\n", anchor: endLine.to + 1 };
    }
    return { kind: "insert", pos: exitPos, text: "\n", anchor: exitPos + 1 };
  }

  let afterSpace = exitPos;
  while (afterSpace < doc.length) {
    const ch = doc.sliceString(afterSpace, afterSpace + 1);
    if (ch === " " || ch === "\t") {
      afterSpace++;
    } else {
      break;
    }
  }

  if (afterSpace > exitPos) {
    return { kind: "move", anchor: afterSpace };
  }
  return { kind: "insert", pos: exitPos, text: " ", anchor: exitPos + 1 };
}

function dispatchJumpAction(view: EditorView, action: JumpAction): boolean {
  if (action.kind === "move") {
    view.dispatch({
      selection: { anchor: action.anchor },
      scrollIntoView: true,
      userEvent: "select.struct-latex",
    });
    return true;
  }

  view.dispatch({
    changes: { from: action.pos, to: action.pos, insert: action.text },
    selection: { anchor: action.anchor },
    scrollIntoView: true,
    annotations: [isolateHistory.of("full")],
    userEvent: "struct-latex.jump",
  });
  return true;
}

export function executeSmartJump(
  view: EditorView,
  parseAmbiguousBars: boolean,
  mode: StructuralJumpMode = "rightSingle"
): boolean {
  const { state } = view;
  if (state.readOnly || view.composing) return false;
  if (state.selection.ranges.length > 1) return false;

  const sel = state.selection.main;
  if (!sel.empty) return false;

  const pos = sel.head;
  const analyzed = getAnalyzedMathBlock(state, pos, { parseAmbiguousBars });
  if (!analyzed) return false;

  const relPos = pos - analyzed.region.contentFrom;
  const targetRelPos = resolveStructuralJump(analyzed.tree, relPos, analyzed.jumpSegments, mode);

  if (targetRelPos !== null) {
    return dispatchJumpAction(view, {
      kind: "move",
      anchor: analyzed.region.contentFrom + targetRelPos,
    });
  }

  const exitAction = resolveMathBlockExit(state, analyzed.region);
  if (!exitAction) return false;

  return dispatchJumpAction(view, exitAction);
}

function tryDispatchTriggerJump(
  view: EditorView,
  analyzed: AnalyzedMathBlock,
  pos: number,
  docDeleteBefore: number,
  docDeleteAfter: number,
  parseAmbiguousBars: boolean,
  mode: StructuralJumpMode
): boolean {
  const { state } = view;
  if (docDeleteBefore === 0 && docDeleteAfter === 0) {
    return executeSmartJump(view, parseAmbiguousBars, mode);
  }

  const contentFrom = analyzed.region.contentFrom;
  const contentTo = analyzed.region.contentTo;
  const trigFrom = Math.max(contentFrom, pos - docDeleteBefore);
  const trigTo = Math.min(contentTo, pos + docDeleteAfter);
  const removedLen = trigTo - trigFrom;

  const mathSource = state.doc.sliceString(contentFrom, contentTo);
  const relTrigFrom = trigFrom - contentFrom;
  const relTrigTo = trigTo - contentFrom;
  const { targetCleanRelPos } = resolvePureStructuralJumpWithTrigger(
    mathSource,
    relTrigFrom,
    relTrigTo,
    parseAmbiguousBars,
    mode
  );

  if (targetCleanRelPos !== null) {
    view.dispatch({
      changes: { from: trigFrom, to: trigTo, insert: "" },
      selection: { anchor: contentFrom + targetCleanRelPos },
      scrollIntoView: true,
      annotations: [isolateHistory.of("full")],
      userEvent: "struct-latex.jump",
    });
    return true;
  }

  const exitAction = resolveMathBlockExit(state, analyzed.region);
  if (!exitAction) return false;

  const changes: ChangeSpec[] = [{ from: trigFrom, to: trigTo, insert: "" }];
  if (exitAction.kind === "insert") {
    changes.push({ from: exitAction.pos, to: exitAction.pos, insert: exitAction.text });
  }

  view.dispatch({
    changes,
    selection: { anchor: exitAction.anchor - removedLen },
    scrollIntoView: true,
    annotations: [isolateHistory.of("full")],
    userEvent: "struct-latex.jump",
  });
  return true;
}

export function createSmartJumpExtension(options: SmartJumpOptions = {}): Extension {
  const mode = options.mode ?? "rightSingle";
  const defaultKeybind = options.defaultKeybind ?? "Tab";
  const isEnabled = options.isEnabled ?? (() => true);
  const getBars = () => options.getParseAmbiguousBars?.() ?? true;

  const keybindExt = createKeybindHijackExtension({
    isEnabled,
    getKeybind: options.getKeybind ?? (() => defaultKeybind),
    defaultKeybind,
    isMac: options.isMac,
    run: (view) => executeSmartJump(view, getBars(), mode),
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
          tryDispatchTriggerJump(
            view,
            analyzed,
            from,
            docDeleteBefore,
            docDeleteAfter,
            parseAmbiguousBars,
            mode
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
