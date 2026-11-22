import { syntaxTree } from "@codemirror/language";
import { EditorState, Text } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { buildMathTree } from "../parser/builder";
import { collectJumpSegments } from "../parser/jumpResolver";
import { JumpSegment, MathTree } from "../parser/types";

export const MAX_MATH_BLOCK_CHARS = 10_000;
export const MAX_MATH_BLOCK_LINES = 200;

export interface MathRegion {
  blockFrom: number;
  blockTo: number;
  contentFrom: number;
  contentTo: number;
  isBlock: boolean;
  isClosed: boolean;
}

export interface AnalyzedMathBlock {
  region: MathRegion;
  tree: MathTree;
  jumpSegments: JumpSegment[];
}

interface CachedEntry {
  contentFrom: number;
  contentTo: number;
  analyzed: AnalyzedMathBlock;
}

const docCache = new WeakMap<Text, CachedEntry>();

function hasNameFragment(node: SyntaxNode | null, fragment: string): boolean {
  let cur = node;
  while (cur) {
    if (cur.name.includes(fragment)) return true;
    cur = cur.parent;
  }
  return false;
}

export function isInCodeContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  const left = tree.resolveInner(pos, -1);
  const right = tree.resolveInner(pos, 1);
  const isCode = (n: SyntaxNode | null): boolean =>
    hasNameFragment(n, "code") && !hasNameFragment(n, "link");
  return isCode(left) || isCode(right);
}

export function isInFrontmatterContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  const left = tree.resolveInner(pos, -1);
  const right = tree.resolveInner(pos, 1);
  return hasNameFragment(left, "frontmatter") || hasNameFragment(right, "frontmatter");
}

export function isInCodeOrFrontmatter(state: EditorState, pos: number): boolean {
  return isInCodeContext(state, pos) || isInFrontmatterContext(state, pos);
}

function isMathBeginName(name: string): boolean {
  return name.includes("formatting-math-begin");
}

function isMathEndName(name: string): boolean {
  return name.includes("formatting-math-end");
}

function isMathTokenName(name: string): boolean {
  return name.includes("math") && !name.includes("code");
}

function isPosInsideMathTree(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  const left = tree.resolveInner(pos, -1);
  const right = tree.resolveInner(pos, 1);

  if (isInCodeContext(state, pos)) return false;

  const leftMath = hasNameFragment(left, "math");
  const rightMath = hasNameFragment(right, "math");
  const leftIsEnd = hasNameFragment(left, "formatting-math-end");
  const rightIsBegin = hasNameFragment(right, "formatting-math-begin");

  if (leftMath && !leftIsEnd) return true;
  if (rightMath && !rightIsBegin) return true;

  // Handle blank lines inside multiline `$$...$$` where resolveInner hits Document gap
  const line = state.doc.lineAt(pos);
  if (line.text.trim().length === 0) {
    if (line.number > 1) {
      const prevLineEnd = state.doc.line(line.number - 1).to;
      const prevNode = tree.resolveInner(prevLineEnd, -1);
      if (hasNameFragment(prevNode, "math") && !hasNameFragment(prevNode, "formatting-math-end")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects an empty math block boundary for Backspace cleanup:
 * - `$|$` -> deletes `[pos - 1, pos + 1]`
 * - `$$|` (standalone empty `$$` on a line) -> deletes `[pos - 2, pos]`
 * - `$$\n|\n$$` (or whitespace-only `$$...$$`) -> deletes `[blockFrom, blockTo]`
 */
export function findEmptyMathBlockDeleteSpan(
  state: EditorState,
  pos: number
): { from: number; to: number } | null {
  if (isInCodeContext(state, pos)) return null;

  const doc = state.doc;
  const docLen = doc.length;

  // Case 1: `$|$` (inline empty pair, not adjacent to another `$`)
  if (
    pos >= 1 &&
    pos < docLen &&
    doc.sliceString(pos - 1, pos + 1) === "$$" &&
    (pos < 2 || doc.sliceString(pos - 2, pos - 1) !== "$") &&
    (pos + 1 >= docLen || doc.sliceString(pos + 1, pos + 2) !== "$")
  ) {
    // Exclude escaped `\$`
    if (pos < 2 || doc.sliceString(pos - 2, pos - 1) !== "\\") {
      return { from: pos - 1, to: pos + 1 };
    }
  }

  // Case 2: standalone empty `$$|` on its own line (not closing a non-empty block)
  if (pos >= 2 && doc.sliceString(pos - 2, pos) === "$$") {
    const line = doc.lineAt(pos);
    const trimmed = line.text.trim();
    if (trimmed === "$$" && pos === line.from + line.text.indexOf("$$") + 2) {
      const tree = syntaxTree(state);
      const tokenBefore = tree.resolveInner(pos - 1, -1);
      if (!hasNameFragment(tokenBefore, "formatting-math-end")) {
        return { from: pos - 2, to: pos };
      }
    }
  }

  // Case 3: whitespace-only closed `$$...$$` block
  const region = findMathRegion(state, pos);
  if (region && region.isBlock && region.isClosed) {
    const inner = doc.sliceString(region.contentFrom, region.contentTo);
    if (inner.trim().length === 0) {
      return { from: region.blockFrom, to: region.blockTo };
    }
  }

  return null;
}

/**
 * Locates the single enclosing math block around `pos` using CM6 `syntaxTree(state)`.
 * Adapts to Obsidian HyperMD's flat token stream with a strict char/line fuse.
 */
export function findMathRegion(state: EditorState, pos: number): MathRegion | null {
  if (!isPosInsideMathTree(state, pos)) return null;

  const doc = state.doc;
  const docLen = doc.length;
  const tree = syntaxTree(state);

  const curLineNum = doc.lineAt(pos).number;
  const minLineNum = Math.max(1, curLineNum - MAX_MATH_BLOCK_LINES);
  const maxLineNum = Math.min(doc.lines, curLineNum + MAX_MATH_BLOCK_LINES);

  const windowFrom = Math.max(0, Math.max(pos - MAX_MATH_BLOCK_CHARS, doc.line(minLineNum).from));
  const windowTo = Math.min(docLen, Math.min(pos + MAX_MATH_BLOCK_CHARS, doc.line(maxLineNum).to));

  let beginFrom = -1;
  let beginTo = -1;
  let endFrom = -1;
  let endTo = -1;
  let sawEndAfterPos = false;
  let abortedAfterPos = false;

  tree.iterate({
    from: windowFrom,
    to: windowTo,
    enter(node) {
      if (node.name === "Document") return;

      const name = node.name;
      if (node.to <= pos) {
        if (isMathBeginName(name)) {
          beginFrom = node.from;
          beginTo = node.to;
        } else if (isMathEndName(name)) {
          beginFrom = -1;
          beginTo = -1;
        } else if (!isMathTokenName(name)) {
          beginFrom = -1;
          beginTo = -1;
        }
        return;
      }

      if (node.from >= pos) {
        if (sawEndAfterPos || abortedAfterPos) return false;
        if (isMathEndName(name)) {
          endFrom = node.from;
          endTo = node.to;
          sawEndAfterPos = true;
          return false;
        }
        if (isMathBeginName(name)) {
          abortedAfterPos = true;
          return false;
        }
        if (!isMathTokenName(name)) {
          abortedAfterPos = true;
          return false;
        }
      }
    },
  });

  if (beginFrom === -1 || beginTo === -1) return null;

  const delimText = doc.sliceString(beginFrom, beginTo);
  const isBlock = delimText === "$$" || delimText === "\\[";
  const isClosed = endFrom !== -1 && endTo !== -1;

  const contentFrom = beginTo;
  const contentTo = isClosed ? endFrom : Math.min(docLen, windowTo);
  const blockTo = isClosed ? endTo : contentTo;

  if (pos < contentFrom || pos > contentTo) return null;
  if (contentTo - contentFrom > MAX_MATH_BLOCK_CHARS) return null;

  const startLine = doc.lineAt(contentFrom).number;
  const endLine = doc.lineAt(contentTo).number;
  if (endLine - startLine > MAX_MATH_BLOCK_LINES) return null;

  return {
    blockFrom: beginFrom,
    blockTo,
    contentFrom,
    contentTo,
    isBlock,
    isClosed,
  };
}

/**
 * Lazily builds (and caches per immutable CM6 Text doc) the object relation tree
 * and flattened jump segments for the current math block.
 */
export function getAnalyzedMathBlock(state: EditorState, pos: number): AnalyzedMathBlock | null {
  const region = findMathRegion(state, pos);
  if (!region) return null;

  const cached = docCache.get(state.doc);
  if (
    cached &&
    cached.contentFrom === region.contentFrom &&
    cached.contentTo === region.contentTo
  ) {
    return cached.analyzed;
  }

  const source = state.doc.sliceString(region.contentFrom, region.contentTo);
  const tree = buildMathTree(source);
  const jumpSegments = collectJumpSegments(tree);
  const analyzed: AnalyzedMathBlock = { region, tree, jumpSegments };

  docCache.set(state.doc, {
    contentFrom: region.contentFrom,
    contentTo: region.contentTo,
    analyzed,
  });

  return analyzed;
}
