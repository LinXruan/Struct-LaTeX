import { EditorState } from "@codemirror/state";
import { convertOutputDialect } from "../input/dialectConverter";
import { InlineMathPreviewPosition } from "../input/types";
import { findMathRegion, isInCodeOrFrontmatter } from "./mathRegion";

export interface InlineMathPreviewTarget {
  blockFrom: number;
  blockTo: number;
  tex: string;
  position: "above" | "below";
}

/**
 * Resolves whether an inline math live preview tooltip should be shown for `state`
 * and computes the normalized TeX source plus anchor span.
 */
export function resolveInlineMathPreviewTarget(
  state: EditorState,
  position: InlineMathPreviewPosition
): InlineMathPreviewTarget | null {
  if (position === "off" || state.readOnly) return null;

  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) return null;

  const pos = selection.main.head;
  if (isInCodeOrFrontmatter(state, pos)) return null;

  const region = findMathRegion(state, pos);
  if (!region || region.isBlock) return null;

  const rawSource = state.doc.sliceString(region.contentFrom, region.contentTo).trim();
  if (rawSource.length === 0) return null;

  const tex = convertOutputDialect(rawSource, rawSource.length, "latex").insert;
  return {
    blockFrom: region.blockFrom,
    blockTo: region.blockTo,
    tex,
    position,
  };
}
