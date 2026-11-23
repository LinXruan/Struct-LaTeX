import { AtomObject, BracketObject, LatexObject, MathTree, WordObject } from "./types";

export interface AutoDelimEdit {
  from: number;
  to: number;
  insert: string;
}

const MANUAL_LEFT_SIZE_COMMANDS = new Set([
  "\\big",
  "\\Big",
  "\\bigg",
  "\\Bigg",
  "\\bigl",
  "\\Bigl",
  "\\biggl",
  "\\Biggl",
  "\\bigm",
  "\\Bigm",
  "\\biggm",
  "\\Biggm",
]);

const MANUAL_RIGHT_SIZE_COMMANDS = new Set([
  "\\big",
  "\\Big",
  "\\bigg",
  "\\Bigg",
  "\\bigr",
  "\\Bigr",
  "\\biggr",
  "\\Biggr",
]);

const TALL_WORD_COMMANDS = new Set([
  "\\sum",
  "\\prod",
  "\\coprod",
  "\\int",
  "\\iint",
  "\\iiint",
  "\\iiiint",
  "\\oint",
  "\\oiint",
  "\\oiiint",
  "\\bigcup",
  "\\bigcap",
  "\\bigoplus",
  "\\bigotimes",
  "\\bigsqcup",
  "\\bigvee",
  "\\bigwedge",
  "\\biguplus",
  "\\bigodot",
  "∑",
  "∏",
  "∫",
  "∬",
  "∭",
  "∮",
]);

const TALL_CMD_BRACKETS = new Set([
  "\\frac",
  "\\dfrac",
  "\\tfrac",
  "\\cfrac",
  "\\binom",
  "\\dbinom",
  "\\tbinom",
  "\\overset",
  "\\underset",
  "\\stackrel",
  "\\substack",
]);

function isTallLeaf(obj: WordObject | AtomObject): boolean {
  if (TALL_WORD_COMMANDS.has(obj.text)) return true;
  return obj.dependents.some((dep) => dep.kind === "word" && dep.text === "\\limits");
}

function isPlainParenCandidate(
  obj: BracketObject,
  prevSibling: LatexObject | undefined,
  source: string,
  inTextMode: boolean
): boolean {
  if (inTextMode || obj.subtype !== "delim" || obj.slots.length !== 1) return false;
  const slot = obj.slots[0];
  if (slot.textMode) return false;

  if (source.slice(slot.openFrom, slot.openCoreTo) !== "(") return false;
  if (source.slice(slot.bodyTo, slot.closeTo) !== ")") return false;

  if (
    prevSibling &&
    prevSibling.kind === "word" &&
    MANUAL_LEFT_SIZE_COMMANDS.has(prevSibling.text) &&
    prevSibling.to === obj.coreFrom
  ) {
    return false;
  }

  const lastChild = slot.children[slot.children.length - 1];
  if (
    lastChild &&
    lastChild.kind === "word" &&
    MANUAL_RIGHT_SIZE_COMMANDS.has(lastChild.text) &&
    lastChild.to === slot.bodyTo
  ) {
    return false;
  }

  return true;
}

/**
 * Checks whether a list of sibling objects inside `(...)` contains any tall operator/structure
 * or nested visible delimiter, bridging transparently through non-tall commands (`\mathbb`, `\sqrt`),
 * bare groups (`{...}`), and scripts (`_{...}`, `^{...}`) while skipping `textMode` slots.
 */
export function hasTallOrNestedContent(children: readonly LatexObject[]): boolean {
  for (const child of children) {
    if (child.kind === "word" || child.kind === "atom") {
      if (isTallLeaf(child)) return true;
      continue;
    }

    if (child.subtype === "delim" || child.subtype === "env") {
      return true;
    }

    if (child.subtype === "cmd" && TALL_CMD_BRACKETS.has(child.name ?? "")) {
      return true;
    }

    for (const slot of child.slots) {
      if (slot.textMode) continue;
      if (hasTallOrNestedContent(slot.children)) return true;
    }
  }
  return false;
}

function collectUpgradesInList(
  list: readonly LatexObject[],
  relPos: number,
  source: string,
  inTextMode: boolean,
  forceSubtree: boolean,
  out: BracketObject[]
): void {
  for (let i = 0; i < list.length; i++) {
    const obj = list[i];
    if (obj.kind !== "bracket") continue;

    const coversCursor = obj.coreFrom < relPos && relPos <= obj.coreTo;
    if (!forceSubtree && !coversCursor) continue;

    const prevSibling = i > 0 ? list[i - 1] : undefined;
    const isCandidate = isPlainParenCandidate(obj, prevSibling, source, inTextMode);
    if (isCandidate && hasTallOrNestedContent(obj.slots[0].children)) {
      out.push(obj);
    }

    const nextForce = forceSubtree || (isCandidate && coversCursor);
    for (const slot of obj.slots) {
      const slotTextMode = inTextMode || Boolean(slot.textMode);
      if (slotTextMode) continue;
      collectUpgradesInList(slot.children, relPos, source, slotTextMode, nextForce, out);
    }
  }
}

/**
 * Resolves all plain `(...)` brackets around `relPos` (and any nested plain `(...)` inside them)
 * that should auto-upgrade to `\left(...\right)`, returning edits sorted in ascending offset order.
 */
export function resolveAutoParenUpgrades(tree: MathTree, relPos: number): AutoDelimEdit[] {
  if (relPos <= 0 || relPos > tree.source.length) return [];

  const matchedBrackets: BracketObject[] = [];
  collectUpgradesInList(tree.roots, relPos, tree.source, false, false, matchedBrackets);
  if (matchedBrackets.length === 0) return [];

  const edits: AutoDelimEdit[] = [];
  for (const br of matchedBrackets) {
    const slot = br.slots[0];
    edits.push({ from: slot.openFrom, to: slot.openCoreTo, insert: "\\left(" });
    edits.push({ from: slot.bodyTo, to: slot.closeTo, insert: "\\right)" });
  }

  edits.sort((a, b) => a.from - b.from);
  return edits;
}

/**
 * Maps a math-block-relative cursor offset across sorted non-overlapping `AutoDelimEdit`s.
 */
export function applyAutoDelimEditsToCursor(
  edits: readonly AutoDelimEdit[],
  relPos: number
): number {
  let shift = 0;
  for (const edit of edits) {
    if (edit.to <= relPos) {
      shift += edit.insert.length - (edit.to - edit.from);
    }
  }
  return relPos + shift;
}

/**
 * Applies sorted `AutoDelimEdit`s to a math source string (used by unit tests).
 */
export function applyAutoDelimEditsToString(
  source: string,
  edits: readonly AutoDelimEdit[]
): string {
  if (edits.length === 0) return source;
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    out += source.slice(cursor, edit.from) + edit.insert;
    cursor = edit.to;
  }
  out += source.slice(cursor);
  return out;
}
