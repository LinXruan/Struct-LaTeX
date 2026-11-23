import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMathTree } from "../../src/parser/builder";
import { resolveStructuralDelete } from "../../src/parser/deleteResolver";
import { MathParseOptions } from "../../src/parser/types";

const CARET = "▮";

function runDelete(
  pattern: string,
  options?: MathParseOptions
): { result: string; intercepted: boolean } {
  const pos = pattern.indexOf(CARET);
  assert.notEqual(pos, -1, `Test pattern missing caret ${CARET}: ${pattern}`);
  const source = pattern.slice(0, pos) + pattern.slice(pos + CARET.length);
  const tree = buildMathTree(source, options);
  const span = resolveStructuralDelete(tree, pos);

  if (!span) {
    // Simulate native single-char Backspace
    const from = Math.max(0, pos - 1);
    return {
      result: source.slice(0, from) + CARET + source.slice(pos),
      intercepted: false,
    };
  }

  return {
    result: source.slice(0, span.from) + CARET + source.slice(span.to),
    intercepted: true,
  };
}

function expectDelete(input: string, expected: string, options?: MathParseOptions): void {
  const { result, intercepted } = runDelete(input, options);
  assert.equal(intercepted, true, `Expected structural delete for: ${input}`);
  assert.equal(result, expected, `Input: ${input}`);
}

function expectNative(input: string, options?: MathParseOptions): void {
  const { intercepted } = runDelete(input, options);
  assert.equal(intercepted, false, `Expected native Backspace fallback for: ${input}`);
}

describe("Structural Delete — Matrix & Unidirectional Association (6 canonical cases)", () => {
  it("(1) deletes trailing superscript only", () => {
    expectDelete(
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}_{1}^{2}▮",
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}_{1}▮"
    );
  });

  it("(2) deletes superscript from its slot opening", () => {
    expectDelete(
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}_{1}^{▮2}",
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}_{1}▮"
    );
  });

  it("(3) deletes subscript only without affecting parallel superscript", () => {
    expectDelete(
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}_{1}▮^{2}",
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}▮^{2}"
    );
  });

  it("(4) deletes subscript from its slot opening without affecting superscript", () => {
    expectDelete(
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}_{▮1}^{2}",
      "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}▮^{2}"
    );
  });

  it("(5) deletes host and cascades to all attached scripts from host end", () => {
    expectDelete("\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}▮_{1}^{2}", "▮");
  });

  it("(6) deletes host and cascades to all attached scripts from host opening", () => {
    expectDelete("\\begin{bmatrix}▮1&2\\\\3&4\\end{bmatrix}_{1}^{2}", "▮");
  });
});

describe("Structural Delete — Uniform Objects, Single-Char Hosts & Transitivity", () => {
  it("treats single char `a` as host with unidirectional scripts", () => {
    expectDelete("a▮_{2}^{3}", "▮");
    expectDelete("a_{2}^{3}▮", "a_{2}▮");
    expectDelete("a_{2}▮^{3}", "a▮^{3}");
    expectDelete("ab▮_{2}", "a▮");
  });

  it("treats brace-less single-token scripts `a_1^2` and `a_\\alpha` as solid word dependents", () => {
    expectDelete("a▮_1^2", "▮");
    expectDelete("a_1^2▮", "a_1▮");
    expectNative("a_1^▮2");
    expectDelete("a_1▮^2", "a▮^2");
    expectNative("a_▮1^2");
    expectDelete("a_\\alpha▮", "a▮");
    expectDelete("a▮_\\alpha", "▮");
    expectNative("a_\\alp▮ha");
  });

  it("handles big operators, \\limits, and prime chains", () => {
    expectDelete("∑_{k=1}^{n}▮", "∑_{k=1}▮");
    expectDelete("∑▮_{k=1}^{n}", "▮");
    expectDelete("\\lim▮\\limits_{x→0}", "▮");
    expectDelete("\\lim\\limits▮_{x→0}", "\\lim▮_{x→0}");
    expectDelete("\\lim\\limits_{x→0}▮", "\\lim\\limits▮");
    expectDelete("\\left(f\\right)▮'_{0}", "▮");
    expectDelete("\\left(▮f\\right)'_{0}", "▮");
    expectDelete("\\left(f\\right)'_{0}▮", "\\left(f\\right)'▮");
  });

  it("propagates transitively through nested scripts", () => {
    expectDelete("a▮_{b_{1}}^{2}", "▮");
    expectDelete("a_{b▮_{1}}^{2}", "a_{▮}^{2}");
    expectDelete("a_{b_{1}}▮^{2}", "a▮^{2}");
  });
});

describe("Structural Delete — Linked Brackets & Nesting", () => {
  it("deletes \\frac completely from all skeleton triggers including head end (3e2 fix)", () => {
    expectDelete("\\frac{a}{b}▮", "▮");
    expectDelete("\\frac{▮a}{b}", "▮");
    expectDelete("\\frac{a}{▮b}", "▮");
    expectDelete("\\frac{a}▮{b}", "▮");
    expectDelete("\\frac▮{a}{b}", "▮");
    expectNative("\\frac{a▮}{b}");
    expectNative("\\f▮rac{a}{b}");
    expectDelete("\\frac{\\left(1+2\\right)}{3}▮", "▮");
  });

  it("treats \\sqrt[n]{x} as bidirectional linked bracket", () => {
    expectDelete("\\sqrt[n]{x}▮", "▮");
    expectDelete("\\sqrt[▮n]{x}", "▮");
    expectDelete("\\sqrt[n]{▮x}", "▮");
    expectDelete("\\sqrt[n]▮{x}", "▮");
    expectDelete("\\sqrt▮[n]{x}", "▮");
    expectDelete("\\sqrt{x}▮", "▮");
    expectDelete("\\sqrt{▮x}", "▮");
  });

  it("handles nested \\left...\\right, single-slot commands, and half-delimiters", () => {
    expectDelete("\\left(1+\\left[2+3\\right]+4\\right)▮", "▮");
    expectDelete("\\left(1+\\left[2+3\\right]▮+4\\right)", "\\left(1+▮+4\\right)");
    expectDelete("\\left(1+\\left[▮2+3\\right]+4\\right)", "\\left(1+▮+4\\right)");
    expectNative("\\left(1+2▮+3\\right)");
    expectDelete("\\mathbf{s}▮", "▮");
    expectDelete("\\mathbf{▮s}", "▮");
    expectNative("\\mathbf{s▮}");
    expectDelete("\\left. f(x)\\right|▮_{0}^{1}", "▮");
    expectDelete("\\left.▮ f(x)\\right|_{0}^{1}", "▮");
    expectDelete("\\left\\Vert x\\right\\Vert_{2}▮", "\\left\\Vert x\\right\\Vert▮");
    expectDelete("\\left\\Vert ▮x\\right\\Vert_{2}", "▮");
    expectDelete("\\left\\Vert▮ x\\right\\Vert_{2}", "▮");
    expectDelete("\\left\\Vert ▮\\right\\Vert_{2}", "▮");
    expectNative("\\left\\Vert x▮\\right\\Vert_{2}");
    expectDelete("\\langle ▮x\\rangle", "▮");
  });
});

describe("Structural Delete — Delimiters, Mixed Intervals, Bare Bars & Align Breaks", () => {
  it("handles escaped braces, norms, Unicode brackets, and mixed intervals", () => {
    expectDelete("\\{a,b\\}▮", "▮");
    expectDelete("\\frac{\\{a\\}▮}{\\{b\\}}", "\\frac{▮}{\\{b\\}}");
    expectDelete("\\|x\\|▮", "▮");
    expectDelete("∥x∥▮", "▮");
    expectDelete("⟨x,y⟩▮", "▮");
    expectDelete("⌊x⌋▮", "▮");
    expectDelete("⌈x⌉▮", "▮");
    expectDelete("[0, 1)▮", "▮");
    expectDelete("(0, 1]▮", "▮");
    expectDelete("f([0, 1)▮)", "f(▮)");
  });

  it("ignores bare `|` when disabled and always ignores `<` `>` as brackets", () => {
    expectDelete("P(A|B)▮", "P▮");
    expectNative("|x|▮", { parseAmbiguousBars: false });
    expectDelete("a < b▮", "a <▮");
  });

  it("supports partial non-nested parsing for even `|` and `∥` and exposes odd bars", () => {
    // Same-level even `|` pairs sequentially without nesting
    expectDelete("|x|▮", "▮");
    expectDelete("|▮x|", "▮");
    expectDelete("||▮", "▮");
    expectDelete("(|a|+|b|+|c|)▮", "▮");
    expectDelete("(|a|+|b|+|c|▮)", "(|a|+|b|+▮)");
    expectDelete("(|a|▮+|b|+|c|)", "(▮+|b|+|c|)");
    expectDelete("(|▮a|+|b|+|c|)", "(▮+|b|+|c|)");
    expectDelete("|a|▮_{2}^{3}", "▮");
    expectDelete("|a|_{2}^{3}▮", "|a|_{2}▮");

    // Same-level even `∥` pairs sequentially without nesting
    expectDelete("(∥a∥+∥b∥+∥c∥▮)", "(∥a∥+∥b∥+▮)");
    expectDelete("| ∥x∥ |▮", "▮");
    expectDelete("| ∥x∥▮ |", "| ▮|");
    expectDelete("∥ |a| + |b| ∥▮", "▮");
    expectDelete("\\left|a\\right| + |b|▮", "\\left|a\\right| +▮");

    // Same-level odd `|` or `∥`: none parsed, all recorded in oddBarSpans
    expectNative("(|a|▮+|b)");
    assert.deepEqual(buildMathTree("(|a|+|b)").oddBarSpans, [
      { from: 1, to: 2 },
      { from: 3, to: 4 },
      { from: 5, to: 6 },
    ]);
    expectNative("(∥a∥▮+∥b)");
    assert.deepEqual(buildMathTree("(∥a∥+∥b)").oddBarSpans, [
      { from: 1, to: 2 },
      { from: 3, to: 4 },
      { from: 5, to: 6 },
    ]);

    // Ordinary brackets isolate levels independently
    assert.deepEqual(buildMathTree("(A | B) + |c|").oddBarSpans, [{ from: 3, to: 4 }]);
    expectDelete("(A | B) + |c|▮", "(A | B) +▮");
    assert.deepEqual(buildMathTree("|P(A|B)|").oddBarSpans, [{ from: 4, to: 5 }]);
    expectDelete("|P(A|B)|▮", "▮");

    // Skips env header args (`\begin{array}{c|c}`), `\text{...}`, and keeps `\|` untouched
    assert.deepEqual(buildMathTree("\\begin{array}{c|c} a & b \\end{array}").oddBarSpans, []);
    assert.deepEqual(buildMathTree("\\begin{array}{c|c} |a| & |b").oddBarSpans, [
      { from: 19, to: 20 },
      { from: 21, to: 22 },
      { from: 25, to: 26 },
    ]);
    assert.deepEqual(buildMathTree("\\text{a | b} + |c|").oddBarSpans, []);
    expectDelete("\\text{a | b} + |c|▮", "\\text{a | b} +▮");
    assert.deepEqual(buildMathTree("\\|a\\| + \\|b").oddBarSpans, []);
    assert.deepEqual(buildMathTree("(|a|+|b)", { parseAmbiguousBars: false }).oddBarSpans, []);
  });

  it("deletes composite align breaks as atomic words (with Scheme 1 trailing space)", () => {
    expectDelete("a \\\\ =&▮ b", "a ▮b");
    expectDelete("a \\\\ ⇔&▮", "a▮");
    expectDelete("1&2\\\\▮3&4", "1&2▮3&4");
  });
});

describe("Structural Delete — Unified Whitespace & Text Mode Boundary", () => {
  it("attaches trailing horizontal spaces to preceding object and links across spaces", () => {
    expectDelete("a   ▮", "▮");
    expectDelete("a ▮  ", "▮");
    expectDelete("a▮   ", "▮");
    expectDelete("a ▮_{2}   ^{3}", "▮");
    expectDelete("a▮ _{2}   ^{3}", "▮");
    expectDelete("a _{2}   ▮^{3}", "a ▮^{3}");
    expectDelete("a _{2} ▮ ^{3}", "a ▮^{3}");
    expectDelete("a _{2}   ^{3}▮", "a _{2}▮");
    expectDelete("\\sin ▮", "▮");
    expectDelete("\\sin ▮a", "▮a");
    expectDelete("\\begin{bmatrix}1&2\\end{bmatrix} ▮", "▮");
  });

  it("treats newlines identically to spaces for trailing whitespace absorption", () => {
    expectDelete("a + b\n    ▮c", "a + ▮c");
    expectDelete("a + b▮\n    c", "a + ▮c");
    expectDelete("a\n_{2}▮", "a▮");
    expectDelete("a▮\n_{2}", "▮");
  });

  it("does not absorb trailing newlines at the end of root math blocks", () => {
    expectNative("\n123456▮\n");
    expectNative("\n123456▮\r\n");
    expectNative("\n123456▮\n  ");
    expectNative("\n123456\n▮");
    expectNative("\n123456\n▮\n");
    expectDelete("\n123456   ▮\n", "\n12345▮\n");
    expectDelete("\n123456▮   \n", "\n12345▮\n");
    expectNative("\n123456   \n▮");
    expectDelete("\n\\sin ▮\n", "\n▮\n");
    expectDelete("\n\\sin▮\n", "\n▮\n");
    expectDelete("\n\\frac{a}{b}▮\n", "\n▮\n");
    expectDelete("\n\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}▮\n", "\n▮\n");
    expectDelete("\na_{2}▮\n", "\na▮\n");
    expectDelete("\na▮\n_{2}\n", "\n▮\n");
  });

  it("absorbs the predecessor's dangling separator when deleting the last entities of a container", () => {
    // Root level (inline `$\sin \sum|$` stays renderable)
    expectDelete("\\sin \\sum▮", "\\sin▮");
    expectDelete("\\sin \\sum ▮", "\\sin▮");
    expectDelete("a + b▮", "a +▮");
    expectDelete("a + b\n    \\sum▮", "a + b▮");
    // Successor survives: separator is kept
    expectDelete("\\sin \\sum▮ x", "\\sin ▮x");
    expectDelete("a + b▮ + c", "a + ▮+ c");
    // Slot ends
    expectDelete("\\frac{a}{b \\sum▮}", "\\frac{a}{b▮}");
    expectDelete("\\left( a + \\frac{1}{2}▮\\right)", "\\left( a +▮\\right)");
    // Root block math: protected trailing newline stays intact
    expectDelete("\n\\sin \\sum▮\n", "\n\\sin▮\n");
    expectDelete("\na + b\n    \\sum▮\n", "\na + b▮\n");
    // Text-mode slots own no separators
    expectDelete("\\text{a \\alpha▮}", "\\text{a ▮}");
  });

  it("absorbs leading whitespace (spaces & newlines) into bracket openers uniformly", () => {
    expectDelete("\\left(   ▮a\\right)", "▮");
    expectDelete("\\left( ▮  a\\right)", "▮");
    expectDelete("\\left(▮   a\\right)", "▮");
    expectDelete("(   ▮1+2)", "▮");
    expectDelete("\\begin{bmatrix}\n  ▮1 & 2\n\\end{bmatrix}", "▮");
  });

  it("preserves text-mode boundary: disables whitespace merging inside \\text{...}", () => {
    expectNative("\\text{hello ▮world}");
    expectNative("\\text{  ▮hello}");
    expectDelete("\\text{▮hello world}", "▮");
    expectDelete("\\text{hello world}▮", "▮");
  });
});

describe("Structural Delete — Guards, Whitelist & Unmatched Degradation", () => {
  it("does not mis-absorb `[...]` onto non-optional commands like \\sin[0, 1]", () => {
    expectDelete("\\sin[0, 1]▮", "\\sin▮");
    expectDelete("\\sin▮[0, 1]", "▮[0, 1]");
    expectDelete("\\mycmd{x}▮", "▮");
    expectDelete("\\mycmd [0, 1]▮", "\\mycmd▮");
  });

  it("preserves editability inside environment names, command spellings, and numbers", () => {
    expectNative("\\begin{bmat▮rix}1&2\\end{bmatrix}");
    expectDelete("\\begin{array}{cc}▮a&b\\end{array}", "▮");
    expectDelete("\\begin{array}▮{cc}a&b\\end{array}", "▮");
    expectNative("\\si▮n");
    expectDelete("\\sin▮", "▮");
    expectNative("1234▮");
  });

  it("degrades unmatched brackets to plain single-char atoms without harming nested valid brackets", () => {
    expectNative("1 + (▮2 + 3");
    expectDelete("1 + (▮ 2 + 3", "1 + ▮2 + 3");
    expectNative("1 + \\left(▮2 + 3");
    expectDelete("1 + \\left(▮ 2 + 3", "1 + \\left▮2 + 3");
    expectDelete("\\left( 1 + \\frac{a}{b}▮", "\\left( 1 +▮");
  });

  it("handles UTF-16 surrogate-pair math symbols cleanly", () => {
    expectDelete("𝔸▮_{2}", "▮");
    expectDelete("𝔸 + 𝔹▮", "𝔸 +▮");
  });
});
