import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMathTree } from "../../src/parser/builder";
import { collectJumpSegments, resolveStructuralJump } from "../../src/parser/jumpResolver";

const CARET = "▮";

function runJump(pattern: string): { result: string | null; exited: boolean } {
  const pos = pattern.indexOf(CARET);
  assert.notEqual(pos, -1, `Test pattern missing caret ${CARET}: ${pattern}`);
  const source = pattern.slice(0, pos) + pattern.slice(pos + CARET.length);
  const tree = buildMathTree(source);
  const segments = collectJumpSegments(tree);
  const target = resolveStructuralJump(tree, pos, segments);

  if (target === null) {
    return { result: null, exited: true };
  }

  return {
    result: source.slice(0, target) + CARET + source.slice(target),
    exited: false,
  };
}

function expectJump(input: string, expected: string): void {
  const { result, exited } = runJump(input);
  assert.equal(exited, false, `Expected in-block jump for: ${input}`);
  assert.equal(result, expected, `Input: ${input}`);
}

function expectExit(input: string): void {
  const { exited, result } = runJump(input);
  assert.equal(exited, true, `Expected math-block exit for: ${input}, got: ${result}`);
}

function expectJumpSequence(initial: string, steps: string[], exitAtEnd = true): void {
  let cur = initial;
  for (const next of steps) {
    expectJump(cur, next);
    cur = next;
  }
  if (exitAtEnd) {
    expectExit(cur);
  }
}

describe("Structural Jump — Solid Objects & Entity-vs-Whitespace Distinction", () => {
  it("jumps from left edge or entity interior to end of solid object including trailing spaces", () => {
    expectJump("▮\\sin   (1+2)", "\\sin   ▮(1+2)");
    expectJump("\\s▮in   (1+2)", "\\sin   ▮(1+2)");
    expectJump("\\si▮n   (1+2)", "\\sin   ▮(1+2)");
    expectJump("▮a   + b", "a   ▮+ b");
  });

  it("treats cursor inside trailing whitespace as already at end and jumps next object", () => {
    expectJump("\\sin▮   (1+2+3)", "\\sin   (▮1+2+3)");
    expectJump("\\sin ▮  (1+2+3)", "\\sin   (▮1+2+3)");
    expectJump("\\sin  ▮ (1+2+3)", "\\sin   (▮1+2+3)");
    expectJump("\\sin   ▮(1+2+3)", "\\sin   (▮1+2+3)");
    expectJump("\\sin   ▮   (1+2+3)", "\\sin      (▮1+2+3)");
  });

  it("treats brace-less scripts `_2`, `^n`, `_\\alpha` as single solid objects", () => {
    expectJumpSequence("▮a_2^n", ["a▮_2^n", "a_2▮^n", "a_2^n▮"]);
    expectJump("a_▮2 + 1", "a_2 ▮+ 1");
    expectJump("a▮_\\alpha + 1", "a_\\alpha ▮+ 1");
    expectJump("a_\\al▮pha + 1", "a_\\alpha ▮+ 1");
  });
});

describe("Structural Jump — Bracket Openers, Leading Whitespace & Nesting", () => {
  it("absorbs leading spaces into bracket opener and lands after leading spaces", () => {
    expectJump("\\sin ▮(   1+2+3)", "\\sin (   ▮1+2+3)");
    expectJump("▮\\left(   x\\right)", "\\left(   ▮x\\right)");
    expectJump("\\le▮ft(   x\\right)", "\\left(   ▮x\\right)");
  });

  it("treats cursor inside bracket leading whitespace as already past opener and jumps first child", () => {
    expectJump("\\sin (▮   1+2+3)", "\\sin (   1▮+2+3)");
    expectJump("\\sin (  ▮ 1+2+3)", "\\sin (   1▮+2+3)");
    expectJump("\\sin (   ▮1+2+3)", "\\sin (   1▮+2+3)");
  });

  it("lands after trailing spaces on bracket close and steps cleanly across nested brackets", () => {
    expectJump("(1+2▮)   + 3", "(1+2)   ▮+ 3");
    expectJump("(1+2) ▮  + 3", "(1+2)   + ▮3");
    expectJumpSequence("▮\\left(1+\\left[2\\right]\\right)", [
      "\\left(▮1+\\left[2\\right]\\right)",
      "\\left(1▮+\\left[2\\right]\\right)",
      "\\left(1+▮\\left[2\\right]\\right)",
      "\\left(1+\\left[▮2\\right]\\right)",
      "\\left(1+\\left[2▮\\right]\\right)",
      "\\left(1+\\left[2\\right]▮\\right)",
      "\\left(1+\\left[2\\right]\\right)▮",
    ]);
  });

  it("handles empty brackets and whitespace-only brackets without stalling", () => {
    expectJumpSequence("▮(   )", ["(   ▮)", "(   )▮"]);
    expectJump("( ▮  )", "(   )▮");
    expectJumpSequence("▮\\left(\\right)", ["\\left(▮\\right)", "\\left(\\right)▮"]);
  });
});

describe("Structural Jump — Pure Object Philosophy (Scripts & Linked Commands)", () => {
  it("uses pure two-step object jumping for bracket/operator followed by scripts", () => {
    expectJumpSequence("\\left\\Vert x▮\\right\\Vert_{2}", [
      "\\left\\Vert x\\right\\Vert▮_{2}",
      "\\left\\Vert x\\right\\Vert_{▮2}",
      "\\left\\Vert x\\right\\Vert_{2▮}",
      "\\left\\Vert x\\right\\Vert_{2}▮",
    ]);
    expectJumpSequence("▮∑_{k}^{n}", [
      "∑▮_{k}^{n}",
      "∑_{▮k}^{n}",
      "∑_{k▮}^{n}",
      "∑_{k}▮^{n}",
      "∑_{k}^{▮n}",
      "∑_{k}^{n▮}",
      "∑_{k}^{n}▮",
    ]);
  });

  it("steps cleanly through multi-slot commands \\frac and \\sqrt", () => {
    expectJumpSequence("▮\\frac{a}{b}", [
      "\\frac{▮a}{b}",
      "\\frac{a▮}{b}",
      "\\frac{a}{▮b}",
      "\\frac{a}{b▮}",
      "\\frac{a}{b}▮",
    ]);
    expectJump("\\fr▮ac{a}{b}", "\\frac{▮a}{b}");
    expectJump("\\frac▮{a}{b}", "\\frac{▮a}{b}");
    expectJump("\\frac{a}▮{b}", "\\frac{a}{▮b}");
    expectJump("\\frac{  a  ▮}  {  b  }", "\\frac{  a  }  {  ▮b  }");
    expectJumpSequence("▮\\sqrt[n]{x}", [
      "\\sqrt[▮n]{x}",
      "\\sqrt[n▮]{x}",
      "\\sqrt[n]{▮x}",
      "\\sqrt[n]{x▮}",
      "\\sqrt[n]{x}▮",
    ]);
  });
});

describe("Structural Jump — Unified Newlines, Multiline Envs & Block Exit", () => {
  it("treats newlines and indentation identically to spaces inside multiline environments", () => {
    const src = "\\begin{cases}\n  x \\\\\n  y\n\\end{cases}";
    expectJumpSequence(`▮${src}`, [
      "\\begin{cases}\n  ▮x \\\\\n  y\n\\end{cases}",
      "\\begin{cases}\n  x ▮\\\\\n  y\n\\end{cases}",
      "\\begin{cases}\n  x \\\\\n  ▮y\n\\end{cases}",
      "\\begin{cases}\n  x \\\\\n  y\n▮\\end{cases}",
      "\\begin{cases}\n  x \\\\\n  y\n\\end{cases}▮",
    ]);
    expectJump("\\begin{cases}\n  x \\\\▮\n  y\n\\end{cases}", "\\begin{cases}\n  x \\\\\n  y\n▮\\end{cases}");
    expectJump("\\begin{cases}\n  x \\\\\n ▮ y\n\\end{cases}", "\\begin{cases}\n  x \\\\\n  y\n▮\\end{cases}");
  });

  it("handles environment header args like \\begin{array}{cc}", () => {
    expectJump("▮\\begin{array}{cc}  a\\end{array}", "\\begin{array}{cc}  ▮a\\end{array}");
    expectJump("\\begin{arr▮ay}{cc}  a\\end{array}", "\\begin{array}{cc}  ▮a\\end{array}");
    expectJump("\\begin{array}▮{cc}  a\\end{array}", "\\begin{array}{cc}  ▮a\\end{array}");
    expectJump("\\begin{array}{cc}▮  a\\end{array}", "\\begin{array}{cc}  a▮\\end{array}");
  });

  it("handles \\text{...} without breaking prose spaces", () => {
    expectJump("▮\\text{a b}", "\\text{▮a b}");
    expectJump("\\text{a▮ b}", "\\text{a b▮}");
    expectJump("\\text{a b▮}", "\\text{a b}▮");
  });

  it("signals math-block exit when cursor is at or past the last entity core", () => {
    expectExit("▮");
    expectExit("   ▮   ");
    expectExit("x▮");
    expectExit("x▮   ");
    expectExit("x ▮  ");
    expectExit("\n  a + b▮\n");
    expectExit("\n  a + b\n▮");
  });
});
