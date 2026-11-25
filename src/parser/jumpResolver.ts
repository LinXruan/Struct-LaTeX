import { BracketObject, JumpSegment, LatexObject, MathTree, StructuralJumpMode } from "./types";

function pushSegment(
  segments: JumpSegment[],
  coreFrom: number,
  coreTo: number,
  to: number,
  isSolid: boolean
): void {
  if (coreTo > coreFrom) {
    segments.push({ coreFrom, coreTo, to, isSolid, solidRunTo: to });
  }
}

function collectBracketSegments(node: BracketObject, segments: JumpSegment[]): void {
  const { slots } = node;
  if (slots.length === 0) {
    pushSegment(segments, node.coreFrom, node.coreTo, node.to, false);
    return;
  }

  // Opening segment: bracket/command start through slot 0 opener + leading whitespace
  pushSegment(segments, node.coreFrom, slots[0].openCoreTo, slots[0].bodyFrom, false);
  collectListSegments(slots[0].children, segments);

  // Inter-slot segments: previous slot close through next slot opener + leading whitespace
  for (let s = 1; s < slots.length; s++) {
    const prevSlot = slots[s - 1];
    const nextSlot = slots[s];
    pushSegment(segments, prevSlot.bodyTo, nextSlot.openCoreTo, nextSlot.bodyFrom, false);
    collectListSegments(nextSlot.children, segments);
  }

  // Closing segment: last slot body end through closing delimiter + trailing whitespace
  const lastSlot = slots[slots.length - 1];
  pushSegment(segments, lastSlot.bodyTo, node.coreTo, node.to, false);
}

function collectListSegments(objects: readonly LatexObject[], segments: JumpSegment[]): void {
  for (const obj of objects) {
    if (obj.kind === "bracket") {
      collectBracketSegments(obj, segments);
    } else {
      pushSegment(segments, obj.coreFrom, obj.coreTo, obj.to, true);
    }
  }
}

/**
 * Flattens the math object tree in pre-order into strictly monotonic jump segments.
 * Each segment represents an entity core `[coreFrom, coreTo)` plus its trailing whitespace `[coreTo, to]`,
 * and precomputes `solidRunTo` for same-level consecutive solid objects.
 */
export function collectJumpSegments(tree: MathTree): JumpSegment[] {
  const segments: JumpSegment[] = [];
  collectListSegments(tree.roots, segments);

  // Bracket boundaries always separate solid objects across nesting levels,
  // so contiguous `isSolid` segments correspond 1-to-1 to same-level solid runs.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.isSolid && i + 1 < segments.length && segments[i + 1].isSolid) {
      seg.solidRunTo = segments[i + 1].solidRunTo;
    }
  }

  return segments;
}

/**
 * Resolves the next jump offset (relative to math block content start) for `relPos`:
 * - Finds the first segment whose entity core extends past `relPos` (`seg.coreTo > relPos`).
 * - In `"rightSingle"` mode, lands at `seg.to` (single object / bracket boundary).
 * - In `"rightMulti"` mode, lands at `seg.solidRunTo` (end of contiguous same-level solid run, or `seg.to` on brackets).
 * - Returns `null` when no remaining segment exists, signaling a math-block exit.
 */
export function resolveStructuralJump(
  tree: MathTree,
  relPos: number,
  cachedSegments?: readonly JumpSegment[],
  mode: StructuralJumpMode = "rightSingle"
): number | null {
  const segments = cachedSegments ?? collectJumpSegments(tree);
  let lo = 0;
  let hi = segments.length;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (segments[mid].coreTo > relPos) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  if (lo >= segments.length) return null;
  return mode === "rightMulti" ? segments[lo].solidRunTo : segments[lo].to;
}
