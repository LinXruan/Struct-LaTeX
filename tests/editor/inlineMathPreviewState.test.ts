import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defineLanguageFacet, Language, language } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { Input, NodeSet, NodeType, Parser, PartialParse, Tree } from "@lezer/common";
import {
  computeInlineMathPreviewAnchorRect,
  isMultiLinePreviewSpan,
  resolveInlineMathPreviewTarget,
} from "../../src/editor/inlineMathPreviewState";

interface SpanSpec {
  typeId: number;
  from: number;
  to: number;
}

const NODE_SET = new NodeSet([
  NodeType.none,
  NodeType.define({ id: 1, name: "Document", top: true }),
  NodeType.define({ id: 2, name: "formatting-math-begin" }),
  NodeType.define({ id: 3, name: "math" }),
  NodeType.define({ id: 4, name: "formatting-math-end" }),
  NodeType.define({ id: 5, name: "inline-code" }),
]);

function tokenizeMarkdownMath(text: string): SpanSpec[] {
  const spans: SpanSpec[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        spans.push({ typeId: 5, from: i, to: end + 1 });
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith("$$", i)) {
      const end = text.indexOf("$$", i + 2);
      if (end !== -1) {
        spans.push({ typeId: 2, from: i, to: i + 2 });
        if (end > i + 2) spans.push({ typeId: 3, from: i + 2, to: end });
        spans.push({ typeId: 4, from: end, to: end + 2 });
        i = end + 2;
        continue;
      }
    }

    if (text[i] === "$" && text[i - 1] !== "\\") {
      const end = text.indexOf("$", i + 1);
      if (end !== -1) {
        spans.push({ typeId: 2, from: i, to: i + 1 });
        if (end > i + 1) spans.push({ typeId: 3, from: i + 1, to: end });
        spans.push({ typeId: 4, from: end, to: end + 1 });
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith("\\(", i)) {
      const end = text.indexOf("\\)", i + 2);
      if (end !== -1) {
        spans.push({ typeId: 2, from: i, to: i + 2 });
        if (end > i + 2) spans.push({ typeId: 3, from: i + 2, to: end });
        spans.push({ typeId: 4, from: end, to: end + 2 });
        i = end + 2;
        continue;
      }
    }

    i++;
  }

  return spans;
}

class MockMathParser extends Parser {
  createParse(input: Input): PartialParse {
    const docText = input.read(0, input.length);
    const spans = tokenizeMarkdownMath(docText);
    const buffer: number[] = [];
    for (const s of spans) {
      buffer.push(s.typeId, s.from, s.to, 4);
    }
    const tree = Tree.build({
      buffer,
      nodeSet: NODE_SET,
      topID: 1,
      length: input.length,
    });
    return {
      parsedPos: input.length,
      stoppedAt: null,
      stopAt() {},
      advance: () => tree,
    };
  }
}

const mockMathLanguage = new Language(defineLanguageFacet(), new MockMathParser());

function makeState(
  doc: string,
  selection: number | EditorSelection,
  readOnly = false
): EditorState {
  const sel = typeof selection === "number" ? EditorSelection.single(selection) : selection;
  return EditorState.create({
    doc,
    selection: sel,
    extensions: [
      language.of(mockMathLanguage),
      EditorState.readOnly.of(readOnly),
      EditorState.allowMultipleSelections.of(true),
    ],
  });
}

describe("Inline Math Preview State Resolver", () => {
  it("resolves anchor span and normalized TeX for $...$ and \\(...\\)", () => {
    const doc = "Before $x^2 + \\frac{1}{2}$ after";
    const cursorInside = doc.indexOf("x^2") + 1;

    const below = resolveInlineMathPreviewTarget(makeState(doc, cursorInside), "below");
    assert.deepEqual(below, {
      blockFrom: 7,
      blockTo: 26,
      tex: "x^2 + \\frac{1}{2}",
      position: "below",
    });

    const above = resolveInlineMathPreviewTarget(makeState(doc, cursorInside), "above");
    assert.equal(above?.position, "above");
    assert.equal(above?.tex, "x^2 + \\frac{1}{2}");

    const parenDoc = "Test \\(a + b\\) end";
    const parenTarget = resolveInlineMathPreviewTarget(
      makeState(parenDoc, parenDoc.indexOf("a + b") + 2),
      "below"
    );
    assert.deepEqual(parenTarget, {
      blockFrom: 5,
      blockTo: 14,
      tex: "a + b",
      position: "below",
    });
  });

  it("normalizes Unicode math symbols back to canonical LaTeX for MathJax", () => {
    const doc = "$α + ∑_{k=1}^{n} k$";
    const target = resolveInlineMathPreviewTarget(makeState(doc, 3), "below");
    assert.equal(target?.tex, "\\alpha + \\sum_{k=1}^{n} k");
  });

  it("returns null for off setting, readOnly, non-empty selection, and multiple cursors", () => {
    const doc = "A $x^2 + y^2$ B";
    const start = doc.indexOf("x^2");

    assert.equal(resolveInlineMathPreviewTarget(makeState(doc, start), "off"), null);
    assert.equal(resolveInlineMathPreviewTarget(makeState(doc, start, true), "below"), null);
    assert.equal(
      resolveInlineMathPreviewTarget(
        makeState(doc, EditorSelection.single(start, start + 3)),
        "below"
      ),
      null
    );
    assert.equal(
      resolveInlineMathPreviewTarget(
        makeState(doc, EditorSelection.create([EditorSelection.cursor(start), EditorSelection.cursor(start + 4)])),
        "below"
      ),
      null
    );
  });

  it("returns null for block math, empty inline math, plain text, and inline code", () => {
    const blockDoc = "$$x^2 + 1$$";
    assert.equal(resolveInlineMathPreviewTarget(makeState(blockDoc, 4), "below"), null);

    const emptyDoc = "a $   $ b";
    assert.equal(resolveInlineMathPreviewTarget(makeState(emptyDoc, 4), "below"), null);

    const plainDoc = "plain $x$ text";
    assert.equal(resolveInlineMathPreviewTarget(makeState(plainDoc, 2), "below"), null);

    const codeDoc = "`$x^2$`";
    assert.equal(resolveInlineMathPreviewTarget(makeState(codeDoc, 3), "below"), null);
  });

  it("anchors below tooltips to the bottom and start of the last visual line when multiline", () => {
    const line1Start = { left: 260, right: 268, top: 100, bottom: 124 };
    const line1End = { left: 380, right: 388, top: 100, bottom: 124 };
    const line2Start = { left: 40, right: 48, top: 124, bottom: 148 };
    const line2End = { left: 180, right: 188, top: 124, bottom: 148 };

    assert.equal(isMultiLinePreviewSpan(line1Start, line1End), false);
    assert.equal(isMultiLinePreviewSpan(line1Start, line2End), true);

    assert.deepEqual(
      computeInlineMathPreviewAnchorRect(line1Start, line1End, null, "below"),
      { left: 260, right: 388, top: 100, bottom: 124 }
    );

    assert.deepEqual(
      computeInlineMathPreviewAnchorRect(line1Start, line2End, line2Start, "below"),
      { left: 40, right: 268, top: 100, bottom: 148 }
    );

    assert.deepEqual(
      computeInlineMathPreviewAnchorRect(line1Start, line2End, line2Start, "above"),
      { left: 260, right: 268, top: 100, bottom: 148 }
    );
  });

  it("handles partially off-viewport anchors cleanly", () => {
    const line2Start = { left: 40, right: 48, top: 124, bottom: 148 };
    const line2End = { left: 180, right: 188, top: 124, bottom: 148 };
    const line1Start = { left: 260, right: 268, top: 100, bottom: 124 };

    assert.deepEqual(
      computeInlineMathPreviewAnchorRect(null, line2End, line2Start, "below"),
      { left: 40, right: 188, top: 124, bottom: 148 }
    );
    assert.equal(computeInlineMathPreviewAnchorRect(null, line2End, line2Start, "above"), null);

    assert.deepEqual(
      computeInlineMathPreviewAnchorRect(line1Start, null, null, "above"),
      line1Start
    );
    assert.equal(computeInlineMathPreviewAnchorRect(line1Start, null, null, "below"), null);
    assert.equal(computeInlineMathPreviewAnchorRect(null, null, null, "below"), null);
  });
});
