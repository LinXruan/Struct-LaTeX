import { syntaxTree } from "@codemirror/language";
import { EditorState, Extension, RangeSetBuilder, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
  analyzeMathRegion,
  finalizeMathRegion,
  findMathRegion,
  isMathBeginName,
  isMathEndName,
  isMathTokenName,
  MathRegion,
  MAX_MATH_BLOCK_CHARS,
  MAX_MATH_BLOCK_LINES,
} from "./mathRegion";

export const refreshOddBarsEffect = StateEffect.define<null>();

export interface OddBarHighlightOptions {
  isEnabled: () => boolean;
}

const oddBarMark = Decoration.mark({ class: "struct-latex-odd-bar" });

/**
 * Collects all complete math regions overlapping CM6 `visibleRanges`, expanding across
 * block boundaries up to the char/line fuse so partial scrolling never skews parity counts.
 */
function collectVisibleMathRegions(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[]
): MathRegion[] {
  const doc = state.doc;
  const docLen = doc.length;
  const tree = syntaxTree(state);
  const seenContentFrom = new Set<number>();
  const regions: MathRegion[] = [];

  const pushRegion = (region: MathRegion | null): void => {
    if (!region || seenContentFrom.has(region.contentFrom)) return;
    seenContentFrom.add(region.contentFrom);
    regions.push(region);
  };

  for (const range of visibleRanges) {
    let scanFrom = range.from;
    const enclosingStart = findMathRegion(state, range.from);
    if (enclosingStart) {
      pushRegion(enclosingStart);
      if (!enclosingStart.isClosed) continue;
      scanFrom = Math.max(scanFrom, enclosingStart.blockTo);
    }
    if (scanFrom > range.to) continue;

    const endLineNum = Math.min(doc.lines, doc.lineAt(range.to).number + MAX_MATH_BLOCK_LINES);
    const scanLimit = Math.min(docLen, Math.min(range.to + MAX_MATH_BLOCK_CHARS, doc.line(endLineNum).to));

    let beginFrom = -1;
    let beginTo = -1;

    tree.iterate({
      from: scanFrom,
      to: scanLimit,
      enter(node) {
        if (node.name === "Document") return;
        const name = node.name;
        if (isMathBeginName(name)) {
          if (node.from > range.to) return false;
          beginFrom = node.from;
          beginTo = node.to;
          return;
        }
        if (beginFrom !== -1 && isMathEndName(name)) {
          pushRegion(finalizeMathRegion(doc, beginFrom, beginTo, node.from, node.to, scanLimit));
          beginFrom = -1;
          beginTo = -1;
          if (node.to > range.to) return false;
          return;
        }
        if (beginFrom !== -1 && !isMathTokenName(name)) {
          pushRegion(finalizeMathRegion(doc, beginFrom, beginTo, -1, -1, node.from));
          beginFrom = -1;
          beginTo = -1;
          if (node.from > range.to) return false;
          return;
        }
        if (beginFrom === -1 && node.from > range.to) return false;
      },
    });

    if (beginFrom !== -1) {
      pushRegion(finalizeMathRegion(doc, beginFrom, beginTo, -1, -1, scanLimit));
    }
  }

  regions.sort((a, b) => a.contentFrom - b.contentFrom);
  return regions;
}

function buildOddBarDecorations(view: EditorView, enabled: boolean): DecorationSet {
  if (!enabled) return Decoration.none;

  const { state } = view;
  const regions = collectVisibleMathRegions(state, view.visibleRanges);
  if (regions.length === 0) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  let lastTo = 0;

  for (const region of regions) {
    const analyzed = analyzeMathRegion(state, region, { parseAmbiguousBars: true });
    for (const span of analyzed.tree.oddBarSpans) {
      const from = region.contentFrom + span.from;
      const to = region.contentFrom + span.to;
      if (from >= lastTo && to <= state.doc.length && from < to) {
        builder.add(from, to, oddBarMark);
        lastTo = to;
      }
    }
  }

  return builder.finish();
}

/**
 * Highlights same-level odd-count `|` and `∥` characters in visible math source blocks
 * when partial ambiguous-bar parsing is enabled.
 */
export function createOddBarHighlightExtension(options: OddBarHighlightOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private lastEnabled: boolean;

      constructor(view: EditorView) {
        this.lastEnabled = options.isEnabled();
        this.decorations = buildOddBarDecorations(view, this.lastEnabled);
      }

      update(update: ViewUpdate): void {
        const enabled = options.isEnabled();
        const settingChanged = enabled !== this.lastEnabled;
        const forced = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(refreshOddBarsEffect))
        );

        if (update.docChanged || update.viewportChanged || settingChanged || forced) {
          this.lastEnabled = enabled;
          this.decorations = buildOddBarDecorations(update.view, enabled);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  );
}
