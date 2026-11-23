import { isolateHistory } from "@codemirror/commands";
import { Extension, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import {
  applyAutoDelimEditsToCursor,
  resolveAutoParenUpgrades,
} from "../parser/autoDelimResolver";
import { getAnalyzedMathBlock, isInCodeOrFrontmatter } from "./mathRegion";

export const AUTO_DELIM_USER_EVENT = "struct-latex.auto-delim";

export interface AutoParenSizeOptions {
  isEnabled: () => boolean;
  getParseAmbiguousBars?: () => boolean;
}

function isEligibleInputTransaction(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  if (tr.isUserEvent(AUTO_DELIM_USER_EVENT)) return false;
  if (tr.isUserEvent("input.type.compose")) return false;
  return tr.isUserEvent("struct-latex.input") || tr.isUserEvent("input");
}

function shouldInspectUpdate(update: ViewUpdate, options: AutoParenSizeOptions): boolean {
  if (!options.isEnabled()) return false;
  if (!update.docChanged || update.view.composing || update.state.readOnly) return false;

  const { selection } = update.state;
  if (selection.ranges.length !== 1 || !selection.main.empty) return false;

  let hasInputTr = false;
  for (const tr of update.transactions) {
    if (tr.isUserEvent(AUTO_DELIM_USER_EVENT) || tr.isUserEvent("input.type.compose")) {
      return false;
    }
    if (isEligibleInputTransaction(tr)) {
      hasInputTr = true;
    }
  }
  return hasInputTr;
}

/**
 * Automatically upgrades enclosing plain `(...)` to `\left(...\right)` in a dedicated
 * isolated history step when an input transaction introduces tall symbols or nested delimiters.
 */
export function createAutoParenSizeExtension(options: AutoParenSizeOptions): Extension {
  return EditorView.updateListener.of((update) => {
    if (!shouldInspectUpdate(update, options)) return;

    const { state, view } = update;
    const pos = state.selection.main.head;
    if (isInCodeOrFrontmatter(state, pos)) return;

    const parseAmbiguousBars = options.getParseAmbiguousBars?.() ?? true;
    const analyzed = getAnalyzedMathBlock(state, pos, { parseAmbiguousBars });
    if (!analyzed) return;

    const contentFrom = analyzed.region.contentFrom;
    const relPos = pos - contentFrom;
    const edits = resolveAutoParenUpgrades(analyzed.tree, relPos);
    if (edits.length === 0) return;

    const changes = edits.map((edit) => ({
      from: contentFrom + edit.from,
      to: contentFrom + edit.to,
      insert: edit.insert,
    }));
    const nextRelPos = applyAutoDelimEditsToCursor(edits, relPos);

    view.dispatch({
      changes,
      selection: { anchor: contentFrom + nextRelPos },
      scrollIntoView: true,
      annotations: [isolateHistory.of("full")],
      userEvent: AUTO_DELIM_USER_EVENT,
    });
  });
}
