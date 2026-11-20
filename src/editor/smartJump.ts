import { isolateHistory } from "@codemirror/commands";
import { EditorState, Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { resolveStructuralJump } from "../parser/jumpResolver";
import { getAnalyzedMathBlock, MathRegion } from "./mathRegion";

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

  // Inline math: skip existing horizontal space(s), otherwise insert a single space
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

function handleSmartTab(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || view.composing) return false;
  if (state.selection.ranges.length > 1) return false;

  const sel = state.selection.main;
  if (!sel.empty) return false;

  const pos = sel.head;
  const analyzed = getAnalyzedMathBlock(state, pos);
  if (!analyzed) return false;

  const relPos = pos - analyzed.region.contentFrom;
  const targetRelPos = resolveStructuralJump(analyzed.tree, relPos, analyzed.jumpSegments);

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

export function createSmartJumpExtension(): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Tab",
        run: handleSmartTab,
      },
    ])
  );
}
