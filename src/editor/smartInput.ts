import { isolateHistory } from "@codemirror/commands";
import { EditorState, Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildRuleContext } from "../input/contextBuilder";
import { keyboardEventToCombo } from "../input/keybindUtils";
import { CompiledRuleSet } from "../input/ruleCompiler";
import { evaluateAutoInput, evaluateConfirmKey, evaluateHotkey } from "../input/ruleEngine";
import { InputRule, OutputDialect, ResolvedRuleAction } from "../input/types";
import { getAnalyzedMathBlock, isInCodeOrFrontmatter } from "./mathRegion";

const CHORD_TIMEOUT_MS = 1200;

export interface SmartInputProvider {
  isEnabled: () => boolean;
  getCompiledRules: () => CompiledRuleSet;
  getDialect: () => OutputDialect;
  isMac?: boolean;
  onJsError?: (rule: InputRule, message: string) => void;
}

interface PendingChord {
  prefix: string;
  expiresAt: number;
}

function buildContextPair(state: EditorState, pos: number, key: string) {
  const inCode = isInCodeOrFrontmatter(state, pos);
  const analyzed = inCode ? null : getAnalyzedMathBlock(state, pos);
  const line = state.doc.lineAt(pos);
  const lineBefore = state.doc.sliceString(line.from, pos);
  const lineAfter = state.doc.sliceString(pos, line.to);

  const mathCtx = analyzed
    ? buildRuleContext({
        key,
        before: state.doc.sliceString(analyzed.region.contentFrom, pos),
        after: state.doc.sliceString(pos, analyzed.region.contentTo),
        inMath: true,
        inBlockMath: analyzed.region.isBlock,
        inCode: false,
        tree: analyzed.tree,
        relPos: pos - analyzed.region.contentFrom,
      })
    : null;

  const lineCtx = buildRuleContext({
    key,
    before: lineBefore,
    after: lineAfter,
    inMath: Boolean(analyzed),
    inBlockMath: analyzed?.region.isBlock ?? false,
    inCode,
    tree: analyzed?.tree ?? null,
    relPos: analyzed ? pos - analyzed.region.contentFrom : 0,
  });

  return { math: mathCtx, line: lineCtx };
}

function dispatchInputAction(
  view: EditorView,
  pos: number,
  pendingKeyLength: number,
  action: ResolvedRuleAction
): void {
  const docDeleteBefore = Math.max(0, action.replaceLength - pendingKeyLength);
  const from = Math.max(0, pos - docDeleteBefore);
  const to = Math.min(view.state.doc.length, pos + action.deleteAfter);
  const anchor = from + action.cursorOffset;

  view.dispatch({
    changes: { from, to, insert: action.insert },
    selection: { anchor },
    scrollIntoView: true,
    annotations: [isolateHistory.of("full")],
    userEvent: "struct-latex.input",
  });
}

export function createSmartInputExtension(provider: SmartInputProvider): Extension {
  const pendingChords = new WeakMap<EditorView, PendingChord>();

  const autoInputHandler = Prec.highest(
    EditorView.inputHandler.of((view, from, to, text) => {
      if (!provider.isEnabled()) return false;
      const { state } = view;
      if (state.readOnly || view.composing) return false;
      if (state.selection.ranges.length > 1) return false;
      if (from !== to || text.length === 0 || text.length > 2) return false;

      const ctxPair = buildContextPair(state, from, text);
      const match = evaluateAutoInput(
        provider.getCompiledRules(),
        ctxPair,
        provider.getDialect(),
        provider.onJsError
      );
      if (!match) return false;

      dispatchInputAction(view, from, text.length, match.action);
      return true;
    })
  );

  const keydownHandler = Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (!provider.isEnabled()) return false;
        const { state } = view;
        if (state.readOnly || view.composing || event.isComposing) return false;
        if (state.selection.ranges.length > 1) return false;

        const sel = state.selection.main;
        if (!sel.empty) return false;

        const combo = keyboardEventToCombo(event, provider.isMac);
        if (!combo) return false;

        const compiled = provider.getCompiledRules();
        const dialect = provider.getDialect();
        const now = Date.now();
        const pending = pendingChords.get(view);

        if (pending) {
          pendingChords.delete(view);
          if (combo === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
          if (now <= pending.expiresAt) {
            const chord = `${pending.prefix} ${combo}`;
            const ctxPair = buildContextPair(state, sel.head, "");
            const chordMatch = evaluateHotkey(compiled, ctxPair, chord, dialect, provider.onJsError);
            if (chordMatch) {
              event.preventDefault();
              event.stopPropagation();
              dispatchInputAction(view, sel.head, 0, chordMatch.action);
              return true;
            }
          }
        }

        const hasSingleHotkey = compiled.hotkeyRules.has(combo);
        const hasConfirmRule = compiled.confirmRulesByKey.has(combo);
        const isChordPrefix = compiled.chordPrefixes.has(combo);

        if (!hasSingleHotkey && !hasConfirmRule && !isChordPrefix) {
          return false;
        }

        const ctxPair = buildContextPair(state, sel.head, "");

        if (hasSingleHotkey) {
          const hotkeyMatch = evaluateHotkey(compiled, ctxPair, combo, dialect, provider.onJsError);
          if (hotkeyMatch) {
            event.preventDefault();
            event.stopPropagation();
            dispatchInputAction(view, sel.head, 0, hotkeyMatch.action);
            return true;
          }
        }

        if (hasConfirmRule) {
          const confirmMatch = evaluateConfirmKey(compiled, ctxPair, combo, dialect, provider.onJsError);
          if (confirmMatch) {
            event.preventDefault();
            event.stopPropagation();
            dispatchInputAction(view, sel.head, 0, confirmMatch.action);
            return true;
          }
        }

        if (isChordPrefix) {
          pendingChords.set(view, { prefix: combo, expiresAt: now + CHORD_TIMEOUT_MS });
          event.preventDefault();
          event.stopPropagation();
          return true;
        }

        return false;
      },
    })
  );

  return [autoInputHandler, keydownHandler];
}
