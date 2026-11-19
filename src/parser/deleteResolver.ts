import { DeleteSpan, LatexObject, MathTree } from "./types";

function matchesTrigger(obj: LatexObject, pos: number): boolean {
  for (const tr of obj.triggers) {
    if (pos >= tr.from && pos <= tr.to) return true;
  }
  return false;
}

function getDepth(obj: LatexObject): number {
  let depth = 0;
  let cur = obj.parent;
  while (cur) {
    depth++;
    cur = cur.parent;
  }
  return depth;
}

/**
 * Finds the single target object triggered by a Backspace at `relPos` (relative to math block start).
 * If multiple objects somehow share a trigger position, prefers the deepest / tightest object.
 */
export function findTriggeredObject(tree: MathTree, relPos: number): LatexObject | null {
  let best: LatexObject | null = null;
  let bestDepth = -1;
  let bestWidth = Infinity;

  for (const obj of tree.allObjects) {
    if (!matchesTrigger(obj, relPos)) continue;
    const depth = getDepth(obj);
    const width = obj.to - obj.from;
    if (depth > bestDepth || (depth === bestDepth && width < bestWidth)) {
      best = obj;
      bestDepth = depth;
      bestWidth = width;
    }
  }

  return best;
}

/**
 * Computes the transitive delete-propagation closure starting from `target`:
 * - Nesting (`Parent -> Child`) is already covered by `[obj.from, obj.to]`.
 * - Unidirectional associations (`Host -> Dependent`) propagate transitively to the right.
 * - Never propagates backward to `target.host`.
 */
export function computeDeleteClosureSpan(target: LatexObject): DeleteSpan {
  let minFrom = target.from;
  let maxTo = target.to;

  const visited = new Set<number>();
  const stack: LatexObject[] = [target];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);

    if (cur.from < minFrom) minFrom = cur.from;
    if (cur.to > maxTo) maxTo = cur.to;

    for (const dep of cur.dependents) {
      if (!visited.has(dep.id)) stack.push(dep);
    }
  }

  return { from: minFrom, to: maxTo };
}

/**
 * Resolves the structural delete span in math-block-relative coordinates.
 * Returns `null` when no structural trigger is hit or when deletion equals a plain 1-char Backspace,
 * allowing the editor to fall back to native Backspace with zero interference.
 */
export function resolveStructuralDelete(tree: MathTree, relPos: number): DeleteSpan | null {
  if (relPos <= 0 || relPos > tree.source.length) return null;

  const target = findTriggeredObject(tree, relPos);
  if (!target) return null;

  const span = computeDeleteClosureSpan(target);

  // Fast-path fallback: identical to native single-character Backspace
  if (span.from === relPos - 1 && span.to === relPos) {
    return null;
  }

  return span;
}
