import { BracketObject, JumpSegment, LatexObject, MathTree } from "./types";

function pushSegment(
  segments: JumpSegment[],
  coreFrom: number,
  coreTo: number,
  to: number
): void {
  if (coreTo > coreFrom) {
    segments.push({ coreFrom, coreTo, to });
  }
}

function collectBracketSegments(node: BracketObject, segments: JumpSegment[]): void {
  const { slots } = node;
  if (slots.length === 0) {
    pushSegment(segments, node.coreFrom, node.coreTo, node.to);
    return;
  }

  // Opening segment: bracket/command start through slot 0 opener + leading whitespace
  pushSegment(segments, node.coreFrom, slots[0].openCoreTo, slots[0].bodyFrom);
  collectListSegments(slots[0].children, segments);

  // Inter-slot segments: previous slot close through next slot opener + leading whitespace
  for (let s = 1; s < slots.length; s++) {
    const prevSlot = slots[s - 1];
    const nextSlot = slots[s];
    pushSegment(segments, prevSlot.bodyTo, nextSlot.openCoreTo, nextSlot.bodyFrom);
    collectListSegments(nextSlot.children, segments);
  }

  // Closing segment: last slot body end through closing delimiter + trailing whitespace
  const lastSlot = slots[slots.length - 1];
  pushSegment(segments, lastSlot.bodyTo, node.coreTo, node.to);
}

function collectListSegments(objects: readonly LatexObject[], segments: JumpSegment[]): void {
  for (const obj of objects) {
    if (obj.kind === "bracket") {
      collectBracketSegments(obj, segments);
    } else {
      pushSegment(segments, obj.coreFrom, obj.coreTo, obj.to);
    }
  }
}

/**
 * Flattens the math object tree in pre-order into strictly monotonic jump segments.
 * Each segment represents an entity core `[coreFrom, coreTo)` plus its trailing whitespace `[coreTo, to]`.
 */
export function collectJumpSegments(tree: MathTree): JumpSegment[] {
  const segments: JumpSegment[] = [];
  collectListSegments(tree.roots, segments);
  return segments;
}

/**
 * Resolves the next jump offset (relative to math block content start) for `relPos`:
 * - Finds the first segment whose entity core extends past `relPos` (`seg.coreTo > relPos`).
 * - Returns `seg.to` (landing after the entity and its absorbed trailing whitespace).
 * - Returns `null` when no remaining segment exists, signaling a math-block exit.
 */
export function resolveStructuralJump(
  tree: MathTree,
  relPos: number,
  cachedSegments?: readonly JumpSegment[]
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

  return lo < segments.length ? segments[lo].to : null;
}
