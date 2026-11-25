import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMathTree } from "../../src/parser/builder";
import { collectJumpSegments, resolveStructuralJump } from "../../src/parser/jumpResolver";

import { StructuralJumpMode } from "../../src/parser/types";

const CARET = "▮";

function runJump(
  pattern: string,
  mode: StructuralJumpMode = "rightSingle"
): { result: string | null; exited: boolean } {
  const pos = pattern.indexOf(CARET);
  assert.notEqual(pos, -1, `Test pattern missing caret ${CARET}: ${pattern}`);
  const source = pattern.slice(0, pos) + pattern.slice(pos + CARET.length);
  const tree = buildMathTree(source);
  const segments = collectJumpSegments(tree);
  const target = resolveStructuralJump(tree, pos, segments, mode);

  if (target === null) {
    return { result: null, exited: true };
  }

  return {
    result: source.slice(0, target) + CARET + source.slice(target),
    exited: false,
  };
}

function expectJump(
  input: string,
  expected: string,
  mode: StructuralJumpMode = "rightSingle"
): void {
  const { result, exited } = runJump(input, mode);
  assert.equal(exited, false, `Expected in-block jump for: ${input}`);
  assert.equal(result, expected, `Input: ${input}`);
}

function expectExit(input: string, mode: StructuralJumpMode = "rightSingle"): void {
  const { exited, result } = runJump(input, mode);
  assert.equal(exited, true, `Expected math-block exit for: ${input}, got: ${result}`);
}

function expectJumpSequence(
  initial: string,
  steps: string[],
  exitAtEnd = true,
  mode: StructuralJumpMode = "rightSingle"
): void {
  let cur = initial;
  for (const next of steps) {
    expectJump(cur, next, mode);
    cur = next;
  }
  if (exitAtEnd) {
    expectExit(cur, mode);
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

  it("steps flatly across same-level even `|` and `∥` brackets and degrades odd bars", () => {
    expectJumpSequence("▮(|a|+|b|+|c|)", [
      "(▮|a|+|b|+|c|)",
      "(|▮a|+|b|+|c|)",
      "(|a▮|+|b|+|c|)",
      "(|a|▮+|b|+|c|)",
      "(|a|+▮|b|+|c|)",
      "(|a|+|▮b|+|c|)",
      "(|a|+|b▮|+|c|)",
      "(|a|+|b|▮+|c|)",
      "(|a|+|b|+▮|c|)",
      "(|a|+|b|+|▮c|)",
      "(|a|+|b|+|c▮|)",
      "(|a|+|b|+|c|▮)",
      "(|a|+|b|+|c|)▮",
    ]);

    expectJumpSequence("▮∥a∥+∥b∥", [
      "∥▮a∥+∥b∥",
      "∥a▮∥+∥b∥",
      "∥a∥▮+∥b∥",
      "∥a∥+▮∥b∥",
      "∥a∥+∥▮b∥",
      "∥a∥+∥b▮∥",
      "∥a∥+∥b∥▮",
    ]);

    // Odd count: `|` degrades to plain atoms (no bracket opening/closing segment)
    expectJumpSequence("▮|a|+|b", [
      "|▮a|+|b",
      "|a▮|+|b",
      "|a|▮+|b",
      "|a|+▮|b",
      "|a|+|▮b",
      "|a|+|b▮",
    ]);
  });

  it("stops before root-end newlines on Tab and then exits the math block", () => {
    expectJump("\n  a + ▮b\n", "\n  a + b▮\n");
    expectJump("\n  a + ▮b  \n", "\n  a + b  ▮\n");
    expectJump("\n  \\frac{a}{b▮}\n", "\n  \\frac{a}{b}▮\n");
    expectExit("\n  \\frac{a}{b}▮\n");
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

describe("Structural Jump — Right Multi-Object (Solid Run Without Crossing Nesting)", () => {
  it("jumps directly to the end of contiguous same-level solid objects", () => {
    expectJump("▮1234 + 5678", "1234 + 5678▮", "rightMulti");
    expectJump("\\si▮n x + b_2^n", "\\sin x + b_2^n▮", "rightMulti");
    expectJump("▮a + \\sin x + b_2^n", "a + \\sin x + b_2^n▮", "rightMulti");
    expectExit("1234 + 5678▮", "rightMulti");
  });

  it("stops before nested brackets and matches single-object stepping inside/across nesting", () => {
    expectJumpSequence(
      "▮a + b + \\frac{1 + 2}{3 + 4} + c + d",
      [
        "a + b + ▮\\frac{1 + 2}{3 + 4} + c + d",
        "a + b + \\frac{▮1 + 2}{3 + 4} + c + d",
        "a + b + \\frac{1 + 2▮}{3 + 4} + c + d",
        "a + b + \\frac{1 + 2}{▮3 + 4} + c + d",
        "a + b + \\frac{1 + 2}{3 + 4▮} + c + d",
        "a + b + \\frac{1 + 2}{3 + 4} ▮+ c + d",
        "a + b + \\frac{1 + 2}{3 + 4} + c + d▮",
      ],
      true,
      "rightMulti"
    );
  });

  it("respects whitespace vs entity boundary and trailing space absorption", () => {
    expectJump("a  ▮ \\frac{1}{2}", "a   \\frac{▮1}{2}", "rightMulti");
    expectJump("a ▮  + b", "a   + b▮", "rightMulti");
    expectJump("a▮   + b", "a   + b▮", "rightMulti");
    expectJump("▮a +   (x)", "a +   ▮(x)", "rightMulti");
  });

  it("keeps bracket boundaries for braced scripts while jumping solid runs after brackets", () => {
    expectJumpSequence(
      "\\left(x▮\\right)_{2}^{n} + y",
      [
        "\\left(x\\right)▮_{2}^{n} + y",
        "\\left(x\\right)_{▮2}^{n} + y",
        "\\left(x\\right)_{2▮}^{n} + y",
        "\\left(x\\right)_{2}▮^{n} + y",
        "\\left(x\\right)_{2}^{▮n} + y",
        "\\left(x\\right)_{2}^{n▮} + y",
        "\\left(x\\right)_{2}^{n} ▮+ y",
        "\\left(x\\right)_{2}^{n} + y▮",
      ],
      true,
      "rightMulti"
    );

    expectJumpSequence(
      "(x▮)_2^n + y",
      ["(x)▮_2^n + y", "(x)_2^n + y▮"],
      true,
      "rightMulti"
    );
  });

  it("handles multiline environments, align breaks, \\text{} slots, and paired vs odd bars uniformly", () => {
    expectJumpSequence(
      "▮\\begin{cases}\n  x = 1 \\\\\n  y = 2\n\\end{cases}",
      [
        "\\begin{cases}\n  ▮x = 1 \\\\\n  y = 2\n\\end{cases}",
        "\\begin{cases}\n  x = 1 \\\\\n  y = 2\n▮\\end{cases}",
        "\\begin{cases}\n  x = 1 \\\\\n  y = 2\n\\end{cases}▮",
      ],
      true,
      "rightMulti"
    );

    expectJumpSequence(
      "▮\\text{hello world}",
      ["\\text{▮hello world}", "\\text{hello world▮}", "\\text{hello world}▮"],
      true,
      "rightMulti"
    );

    expectJumpSequence(
      "▮(|a+b| + |c+d|)",
      [
        "(▮|a+b| + |c+d|)",
        "(|▮a+b| + |c+d|)",
        "(|a+b▮| + |c+d|)",
        "(|a+b| ▮+ |c+d|)",
        "(|a+b| + ▮|c+d|)",
        "(|a+b| + |▮c+d|)",
        "(|a+b| + |c+d▮|)",
        "(|a+b| + |c+d|▮)",
        "(|a+b| + |c+d|)▮",
      ],
      true,
      "rightMulti"
    );

    // Odd count (3 bars): degrades to plain atoms so the whole sequence is one solid run
    expectJump("▮|a| + |b", "|a| + |b▮", "rightMulti");
  });
});

describe("Structural Jump — Left Single-Object & Exact Inverse Symmetry", () => {
  it("steps leftward across entities, whitespace, and nested brackets as exact reverse of rightSingle", () => {
    expectJumpSequence(
      "a + \\sin   (   1 + 2)   + b▮",
      [
        "a + \\sin   (   1 + 2)   + ▮b",
        "a + \\sin   (   1 + 2)   ▮+ b",
        "a + \\sin   (   1 + 2▮)   + b",
        "a + \\sin   (   1 + ▮2)   + b",
        "a + \\sin   (   1 ▮+ 2)   + b",
        "a + \\sin   (   ▮1 + 2)   + b",
        "a + \\sin   ▮(   1 + 2)   + b",
        "a + ▮\\sin   (   1 + 2)   + b",
        "a ▮+ \\sin   (   1 + 2)   + b",
        "▮a + \\sin   (   1 + 2)   + b",
      ],
      true,
      "leftSingle"
    );
  });

  it("jumps from interior or trailing whitespace back to entity core start", () => {
    expectJump("\\si▮n   + b", "▮\\sin   + b", "leftSingle");
    expectJump("\\sin▮   + b", "▮\\sin   + b", "leftSingle");
    expectJump("\\sin  ▮ + b", "▮\\sin   + b", "leftSingle");
    expectJump("\\sin (  ▮ 1+2)", "\\sin ▮(   1+2)", "leftSingle");
    expectJump("a_2^▮n", "a_2▮^n", "leftSingle");
    expectJump("a_▮2^n", "a▮_2^n", "leftSingle");
  });

  it("steps cleanly backward across multi-slot commands, scripts, and multiline cases", () => {
    expectJumpSequence(
      "\\frac{  a  }{  b  }▮",
      [
        "\\frac{  a  }{  b  ▮}",
        "\\frac{  a  }{  ▮b  }",
        "\\frac{  a  ▮}{  b  }",
        "\\frac{  ▮a  }{  b  }",
        "▮\\frac{  a  }{  b  }",
      ],
      true,
      "leftSingle"
    );

    expectJumpSequence(
      "\\begin{cases}\n  x \\\\\n  y\n\\end{cases}▮",
      [
        "\\begin{cases}\n  x \\\\\n  y\n▮\\end{cases}",
        "\\begin{cases}\n  x \\\\\n  ▮y\n\\end{cases}",
        "\\begin{cases}\n  x ▮\\\\\n  y\n\\end{cases}",
        "\\begin{cases}\n  ▮x \\\\\n  y\n\\end{cases}",
        "▮\\begin{cases}\n  x \\\\\n  y\n\\end{cases}",
      ],
      true,
      "leftSingle"
    );
  });

  it("signals left math-block exit at leading whitespace or start", () => {
    expectExit("▮", "leftSingle");
    expectExit("   ▮   ", "leftSingle");
    expectExit("\n  ▮a + b\n", "leftSingle");
    expectExit("\n ▮ a + b\n", "leftSingle");
  });
});

describe("Structural Jump — Left Multi-Object (Solid Run Start Without Crossing Nesting)", () => {
  it("jumps directly to the start of contiguous same-level solid objects", () => {
    expectJump("1234 + 5678▮", "▮1234 + 5678", "leftMulti");
    expectJump("\\si▮n x + b_2^n", "▮\\sin x + b_2^n", "leftMulti");
    expectJump("a + b ▮+ c + d", "▮a + b + c + d", "leftMulti");
    expectJump("a + b +▮ c + d", "▮a + b + c + d", "leftMulti");
    expectExit("▮1234 + 5678", "leftMulti");
  });

  it("is the exact inverse of rightMulti across nested brackets", () => {
    expectJumpSequence(
      "a + b + \\frac{1 + 2}{3 + 4} + c + d▮",
      [
        "a + b + \\frac{1 + 2}{3 + 4} ▮+ c + d",
        "a + b + \\frac{1 + 2}{3 + 4▮} + c + d",
        "a + b + \\frac{1 + 2}{▮3 + 4} + c + d",
        "a + b + \\frac{1 + 2▮}{3 + 4} + c + d",
        "a + b + \\frac{▮1 + 2}{3 + 4} + c + d",
        "a + b + ▮\\frac{1 + 2}{3 + 4} + c + d",
        "▮a + b + \\frac{1 + 2}{3 + 4} + c + d",
      ],
      true,
      "leftMulti"
    );
  });

  it("handles whitespace between brackets and solid runs, multiline envs, \\text{}, and bars", () => {
    expectJump("\\frac{1}{2}  ▮+ a + b", "\\frac{1}{2▮}  + a + b", "leftMulti");
    expectJump("\\frac{1}{2} ▮ + a + b", "\\frac{1}{2▮}  + a + b", "leftMulti");
    expectJump("a + b +  ▮\\frac{1}{2}", "▮a + b +  \\frac{1}{2}", "leftMulti");

    expectJumpSequence(
      "(x)_2^n + y▮",
      ["(x)▮_2^n + y", "(x▮)_2^n + y", "(▮x)_2^n + y", "▮(x)_2^n + y"],
      true,
      "leftMulti"
    );

    expectJumpSequence(
      "\\begin{cases}\n  x = 1 \\\\\n  y = 2\n\\end{cases}▮",
      [
        "\\begin{cases}\n  x = 1 \\\\\n  y = 2\n▮\\end{cases}",
        "\\begin{cases}\n  ▮x = 1 \\\\\n  y = 2\n\\end{cases}",
        "▮\\begin{cases}\n  x = 1 \\\\\n  y = 2\n\\end{cases}",
      ],
      true,
      "leftMulti"
    );

    expectJumpSequence(
      "\\text{hello world}▮",
      ["\\text{hello world▮}", "\\text{▮hello world}", "▮\\text{hello world}"],
      true,
      "leftMulti"
    );

    expectJump("|a| + |b▮", "▮|a| + |b", "leftMulti");
  });
});
