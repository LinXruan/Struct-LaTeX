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

export interface PreviewAnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Returns true when the formula end coordinate sits on a lower visual line than its start.
 */
export function isMultiLinePreviewSpan(
  startCoords: PreviewAnchorRect,
  endCoords: PreviewAnchorRect
): boolean {
  const lineHeight = Math.max(1, startCoords.bottom - startCoords.top);
  return endCoords.bottom - startCoords.bottom > lineHeight * 0.5;
}

/**
 * Composes a combined bounding rect across `[blockFrom, blockTo]` so CM6 places
 * `"below"` tooltips beneath the last visual line and `"above"` tooltips above the first.
 */
export function computeInlineMathPreviewAnchorRect(
  startCoords: PreviewAnchorRect | null,
  endCoords: PreviewAnchorRect | null,
  lastLineStartCoords: PreviewAnchorRect | null,
  position: "above" | "below"
): PreviewAnchorRect | null {
  if (!startCoords && !endCoords) return null;

  if (!startCoords && endCoords) {
    if (position === "above") return null;
    const left = lastLineStartCoords?.left ?? endCoords.left;
    return {
      left,
      right: Math.max(left, endCoords.right),
      top: endCoords.top,
      bottom: endCoords.bottom,
    };
  }

  if (startCoords && !endCoords) {
    return position === "above" ? startCoords : null;
  }

  const start = startCoords!;
  const end = endCoords!;
  const multiLine = isMultiLinePreviewSpan(start, end);
  const left =
    multiLine && position === "below"
      ? (lastLineStartCoords?.left ?? Math.min(start.left, end.left))
      : start.left;

  return {
    left,
    right: Math.max(left, start.right, end.right),
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
  };
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
