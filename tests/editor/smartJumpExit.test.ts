import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EditorState } from "@codemirror/state";
import { MathRegion } from "../../src/editor/mathRegion";
import { resolveMathBlockLeftExit } from "../../src/editor/smartJump";

function inlineRegion(blockFrom: number, blockTo: number): MathRegion {
  return {
    blockFrom,
    blockTo,
    contentFrom: blockFrom + 1,
    contentTo: blockTo - 1,
    isBlock: false,
    isClosed: true,
  };
}

function blockRegion(blockFrom: number, blockTo: number): MathRegion {
  return {
    blockFrom,
    blockTo,
    contentFrom: blockFrom + 2,
    contentTo: blockTo - 2,
    isBlock: true,
    isClosed: true,
  };
}

describe("Smart Jump — Left Math-Block Exit", () => {
  it("handles inline math left exit for tight text, existing space, and line start", () => {
    // Tight preceding text: inserts space and lands before it (`hello| $x$`)
    const sTight = EditorState.create({ doc: "hello$x$" });
    assert.deepEqual(resolveMathBlockLeftExit(sTight, inlineRegion(5, 8)), {
      kind: "insert",
      pos: 5,
      text: " ",
      anchor: 5,
    });

    // Existing horizontal space after preceding text: moves before space (`hello| $x$`)
    const sSpaced = EditorState.create({ doc: "hello  $x$" });
    assert.deepEqual(resolveMathBlockLeftExit(sSpaced, inlineRegion(7, 10)), {
      kind: "move",
      anchor: 5,
    });

    // Line start or indentation only: pure move to line start without inserting leading space
    const sStart = EditorState.create({ doc: "$x$" });
    assert.deepEqual(resolveMathBlockLeftExit(sStart, inlineRegion(0, 3)), {
      kind: "move",
      anchor: 0,
    });

    const sIndented = EditorState.create({ doc: "line1\n  $x$" });
    assert.deepEqual(resolveMathBlockLeftExit(sIndented, inlineRegion(8, 11)), {
      kind: "move",
      anchor: 6,
    });
  });

  it("handles block math left exit across previous line, first line, and inline-before-block text", () => {
    // Preceded by previous line: moves to end of previous line
    const sPrevLine = EditorState.create({ doc: "intro\n$$\nx\n$$" });
    assert.deepEqual(resolveMathBlockLeftExit(sPrevLine, blockRegion(6, 12)), {
      kind: "move",
      anchor: 5,
    });

    // At first line: inserts newline above $$ and lands at 0
    const sFirstLine = EditorState.create({ doc: "$$\nx\n$$" });
    assert.deepEqual(resolveMathBlockLeftExit(sFirstLine, blockRegion(0, 7)), {
      kind: "insert",
      pos: 0,
      text: "\n",
      anchor: 0,
    });

    // Preceded by non-whitespace text on same line: splits block onto next line
    const sSameLine = EditorState.create({ doc: "foo$$\nx\n$$" });
    assert.deepEqual(resolveMathBlockLeftExit(sSameLine, blockRegion(3, 10)), {
      kind: "insert",
      pos: 3,
      text: "\n",
      anchor: 3,
    });
  });
});
