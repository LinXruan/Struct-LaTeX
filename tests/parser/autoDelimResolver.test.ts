import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAutoDelimEditsToCursor,
  applyAutoDelimEditsToString,
  resolveAutoParenUpgrades,
} from "../../src/parser/autoDelimResolver";
import { buildMathTree } from "../../src/parser/builder";
import { MathParseOptions } from "../../src/parser/types";

const CARET = "▮";

function runAutoParen(exprWithCaret: string, options?: MathParseOptions): string {
  const relPos = exprWithCaret.indexOf(CARET);
  assert.notEqual(relPos, -1, `Missing caret marker in: ${exprWithCaret}`);
  const source = exprWithCaret.slice(0, relPos) + exprWithCaret.slice(relPos + CARET.length);
  const tree = buildMathTree(source, options);
  const edits = resolveAutoParenUpgrades(tree, relPos);
  if (edits.length === 0) return exprWithCaret;

  const upgraded = applyAutoDelimEditsToString(source, edits);
  const nextPos = applyAutoDelimEditsToCursor(edits, relPos);
  return upgraded.slice(0, nextPos) + CARET + upgraded.slice(nextPos);
}

describe("Auto Paren Sizing Resolver — Tall Symbols, Nesting & Transparent Bridging", () => {
  it("upgrades plain (...) containing tall operators, fractions, limits with \\limits, and environments", () => {
    assert.equal(runAutoParen("(\\sum▮)"), "\\left(\\sum▮\\right)");
    assert.equal(runAutoParen("(\\sum)▮"), "\\left(\\sum\\right)▮");
    assert.equal(runAutoParen("(∑_{k=1}^{n} a_k▮)"), "\\left(∑_{k=1}^{n} a_k▮\\right)");
    assert.equal(runAutoParen("(\\prod_{i=1}^{n} x_i▮)"), "\\left(\\prod_{i=1}^{n} x_i▮\\right)");
    assert.equal(runAutoParen("(\\int_{0}^{1} f(x) dx▮)"), "\\left(\\int_{0}^{1} f(x) dx▮\\right)");
    assert.equal(runAutoParen("(\\iint_D▮)"), "\\left(\\iint_D▮\\right)");
    assert.equal(runAutoParen("(\\oint_C▮)"), "\\left(\\oint_C▮\\right)");
    assert.equal(runAutoParen("(\\bigcup_{i} A_i▮)"), "\\left(\\bigcup_{i} A_i▮\\right)");
    assert.equal(runAutoParen("(\\frac{▮}{})"), "\\left(\\frac{▮}{}\\right)");
    assert.equal(runAutoParen("(\\dfrac{a}{b}▮)"), "\\left(\\dfrac{a}{b}▮\\right)");
    assert.equal(runAutoParen("(\\binom{n}{k}▮)"), "\\left(\\binom{n}{k}▮\\right)");
    assert.equal(runAutoParen("(\\overset{a}{b}▮)"), "\\left(\\overset{a}{b}▮\\right)");
    assert.equal(runAutoParen("(\\lim\\limits_{x \\to 0} f(x)▮)"), "\\left(\\lim\\limits_{x \\to 0} f(x)▮\\right)");
    assert.equal(
      runAutoParen("(\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}▮)"),
      "\\left(\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}▮\\right)"
    );
  });

  it("upgrades multi-level nested parentheses in a single pass across all 4 cursor positions", () => {
    // 1. Mid-typing inside inner parens: `((\su|))` + `m` -> `((\sum|))`
    assert.equal(runAutoParen("((\\sum▮))"), "\\left(\\left(\\sum▮\\right)\\right)");
    assert.equal(runAutoParen("(((\\sum▮)))"), "\\left(\\left(\\left(\\sum▮\\right)\\right)\\right)");

    // 2. Closing outer right paren or pasting at end: `((\sum))|`
    assert.equal(runAutoParen("((\\sum))▮"), "\\left(\\left(\\sum\\right)\\right)▮");

    // 3. Prepending outer left paren at start: `(|(\sum))`
    assert.equal(runAutoParen("(▮(\\sum))"), "\\left(▮\\left(\\sum\\right)\\right)");

    // 4. Plain nested delimiters without tall symbols: outer upgrades, inner flat paren stays plain
    assert.equal(runAutoParen("((▮))"), "\\left((▮)\\right)");
    assert.equal(runAutoParen("((x + y▮))"), "\\left((x + y▮)\\right)");
    assert.equal(runAutoParen("(([a, b]▮))"), "\\left(\\left([a, b]▮\\right)\\right)");
    assert.equal(runAutoParen("(\\{a, b\\}▮)"), "\\left(\\{a, b\\}▮\\right)");
    assert.equal(runAutoParen("(\\langle u, v \\rangle▮)"), "\\left(\\langle u, v \\rangle▮\\right)");
    assert.equal(runAutoParen("(\\lfloor x \\rfloor▮)"), "\\left(\\lfloor x \\rfloor▮\\right)");

    // Never mutates sibling parentheses outside the active cursor bracket
    assert.equal(
      runAutoParen("(\\sum) + ((\\sum▮))"),
      "(\\sum) + \\left(\\left(\\sum▮\\right)\\right)"
    );
    assert.equal(
      runAutoParen("\\frac{(\\int) + (\\sum▮)}{(\\prod)}"),
      "\\frac{(\\int) + \\left(\\sum▮\\right)}{(\\prod)}"
    );
  });

  it("bridges transparently through \\mathbb, \\mathbf, \\sqrt, {...}, and scripts without false positives", () => {
    // Flat wrappers stay untouched when their contents are ordinary height
    assert.equal(runAutoParen("(x + y▮)"), "(x + y▮)");
    assert.equal(runAutoParen("(\\alpha + \\sin x▮)"), "(\\alpha + \\sin x▮)");
    assert.equal(runAutoParen("(\\lim_{x \\to 0} x▮)"), "(\\lim_{x \\to 0} x▮)");
    assert.equal(runAutoParen("(\\mathbb{A}▮)"), "(\\mathbb{A}▮)");
    assert.equal(runAutoParen("(\\mathbf{x} + \\mathrm{d}t▮)"), "(\\mathbf{x} + \\mathrm{d}t▮)");
    assert.equal(runAutoParen("(x^{2} + y_{i+1}▮)"), "(x^{2} + y_{i+1}▮)");
    assert.equal(runAutoParen("({a + b}▮)"), "({a + b}▮)");
    assert.equal(runAutoParen("(\\sqrt{x + 1}▮)"), "(\\sqrt{x + 1}▮)");
    assert.equal(runAutoParen("(\\sqrt[3]{x}▮)"), "(\\sqrt[3]{x}▮)");
    assert.equal(runAutoParen("(\\overline{x + y}▮)"), "(\\overline{x + y}▮)");

    // Tall symbols or nested delimiters inside transparent wrappers penetrate and trigger upgrade
    assert.equal(runAutoParen("(\\sqrt{\\frac{1}{2}▮})"), "\\left(\\sqrt{\\frac{1}{2}▮}\\right)");
    assert.equal(runAutoParen("(\\sqrt[3]{\\frac{1}{2}▮})"), "\\left(\\sqrt[3]{\\frac{1}{2}▮}\\right)");
    assert.equal(runAutoParen("(\\overline{\\frac{a}{b}}▮)"), "\\left(\\overline{\\frac{a}{b}}▮\\right)");
    assert.equal(runAutoParen("(e^{\\frac{1}{2}▮})"), "\\left(e^{\\frac{1}{2}▮}\\right)");
    assert.equal(runAutoParen("(x_{\\sum_{i=1}^{n} i▮})"), "\\left(x_{\\sum_{i=1}^{n} i▮}\\right)");
    assert.equal(runAutoParen("({\\sum a_i}▮)"), "\\left({\\sum a_i}▮\\right)");
  });

  it("links with global parseAmbiguousBars setting for |x| and ∥x∥ while ignoring odd P(A|B)", () => {
    // When parseAmbiguousBars is enabled (default true), paired |x| / ∥x∥ / \|x\| are delim brackets
    assert.equal(runAutoParen("(|x|▮)", { parseAmbiguousBars: true }), "\\left(|x|▮\\right)");
    assert.equal(runAutoParen("(∥x∥▮)", { parseAmbiguousBars: true }), "\\left(∥x∥▮\\right)");
    assert.equal(runAutoParen("(\\|x\\|▮)", { parseAmbiguousBars: true }), "\\left(\\|x\\|▮\\right)");
    assert.equal(runAutoParen("(\\left|x\\right|▮)", { parseAmbiguousBars: true }), "\\left(\\left|x\\right|▮\\right)");

    // Odd pipe in conditional probability P(A|B) degrades to AtomObject and never triggers
    assert.equal(runAutoParen("P(A|B▮)", { parseAmbiguousBars: true }), "P(A|B▮)");
    assert.equal(runAutoParen("(a | b + c▮)", { parseAmbiguousBars: true }), "(a | b + c▮)");

    // When parseAmbiguousBars is disabled, plain |x| is AtomObject (does not trigger), while (|\sum|) triggers via \sum
    assert.equal(runAutoParen("(|x|▮)", { parseAmbiguousBars: false }), "(|x|▮)");
    assert.equal(runAutoParen("(|\\sum|▮)", { parseAmbiguousBars: false }), "\\left(|\\sum|▮\\right)");
    assert.equal(runAutoParen("(\\left|x\\right|▮)", { parseAmbiguousBars: false }), "\\left(\\left|x\\right|▮\\right)");
  });

  it("protects textMode slots, already-sized \\left(...\\right), manual \\bigl...\\bigr, and half-open intervals", () => {
    assert.equal(runAutoParen("(\\text{\\sum (a)}▮)"), "(\\text{\\sum (a)}▮)");
    assert.equal(runAutoParen("\\text{(\\sum▮)}"), "\\text{(\\sum▮)}");
    assert.equal(runAutoParen("\\left(\\sum▮\\right)"), "\\left(\\sum▮\\right)");
    assert.equal(runAutoParen("\\bigl(\\sum▮\\bigr)"), "\\bigl(\\sum▮\\bigr)");
    assert.equal(runAutoParen("\\Bigl(\\frac{a}{b}▮\\Bigr)"), "\\Bigl(\\frac{a}{b}▮\\Bigr)");
    assert.equal(runAutoParen("\\big(\\sum▮\\big)"), "\\big(\\sum▮\\big)");
    assert.equal(runAutoParen("[0, \\sum▮)"), "[0, \\sum▮)");
    assert.equal(runAutoParen("(0, \\sum▮]"), "(0, \\sum▮]");
    assert.equal(runAutoParen("(\\sum▮"), "(\\sum▮");
  });
});
