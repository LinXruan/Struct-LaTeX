import { BracketObject, JumpSegment, LatexObject, MathTree, StructuralJumpMode } from "./types";

function pushSegment(
  segments: JumpSegment[],
  coreFrom: number,
  coreTo: number,
  to: number,
  isSolid: boolean
): void {
  if (coreTo > coreFrom) {
    segments.push({ coreFrom, coreTo, to, isSolid, solidRunFrom: coreFrom, solidRunTo: to });
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
 * and precomputes `solidRunFrom` / `solidRunTo` for same-level consecutive solid objects.
 */
export function collectJumpSegments(tree: MathTree): JumpSegment[] {
  const segments: JumpSegment[] = [];
  collectListSegments(tree.roots, segments);

  // Bracket boundaries always separate solid objects across nesting levels,
  // so contiguous `isSolid` segments correspond 1-to-1 to same-level solid runs.
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].isSolid && segments[i - 1].isSolid) {
      segments[i].solidRunFrom = segments[i - 1].solidRunFrom;
    }
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].isSolid && i + 1 < segments.length && segments[i + 1].isSolid) {
      segments[i].solidRunTo = segments[i + 1].solidRunTo;
    }
  }

  return segments;
}

function resolveRightJump(
  segments: readonly JumpSegment[],
  relPos: number,
  multi: boolean
): number | null {
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
  return multi ? segments[lo].solidRunTo : segments[lo].to;
}

function resolveLeftJump(
  segments: readonly JumpSegment[],
  relPos: number,
  multi: boolean
): number | null {
  let lo = 0;
  let hi = segments.length;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (segments[mid].coreFrom < relPos) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const idx = lo - 1;
  if (idx < 0) return null;
  return multi ? segments[idx].solidRunFrom : segments[idx].coreFrom;
}

/**
 * Resolves the next jump offset (relative to math block content start) for `relPos`:
 * - Right modes find the first segment whose core extends past `relPos` (`seg.coreTo > relPos`).
 * - Left modes find the last segment starting before `relPos` (`seg.coreFrom < relPos`).
 * - Single modes land on `seg.to` / `seg.coreFrom`; multi modes jump to `solidRunTo` / `solidRunFrom`.
 * - Returns `null` when no remaining segment exists, signaling a math-block exit.
 */
export function resolveStructuralJump(
  tree: MathTree,
  relPos: number,
  cachedSegments?: readonly JumpSegment[],
  mode: StructuralJumpMode = "rightSingle"
): number | null {
  const segments = cachedSegments ?? collectJumpSegments(tree);
  if (mode === "leftSingle" || mode === "leftMulti") {
    return resolveLeftJump(segments, relPos, mode === "leftMulti");
  }
  return resolveRightJump(segments, relPos, mode === "rightMulti");
}
