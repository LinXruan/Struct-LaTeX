import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRuleContext } from "../../src/input/contextBuilder";
import { createDefaultRules, createDefaultRulesFile } from "../../src/input/defaultRules";
import { compileRules } from "../../src/input/ruleCompiler";
import { evaluateAutoInput, evaluateRulePreview } from "../../src/input/ruleEngine";
import { OutputDialect, TextInputRule } from "../../src/input/types";
import { validateRulesFile } from "../../src/input/validation";
import { buildMathTree } from "../../src/parser/builder";
import { resolveStructuralJump } from "../../src/parser/jumpResolver";

const CARET = "▮";
const compiledDefaults = compileRules(createDefaultRules());

function simulateTyping(
  keys: string,
  dialect: OutputDialect,
  opts: { initial?: string; inMath?: boolean; inCode?: boolean } = {}
): string {
  const initial = opts.initial ?? "";
  const caretPos = initial.indexOf(CARET);
  let before = caretPos >= 0 ? initial.slice(0, caretPos) : initial;
  let after = caretPos >= 0 ? initial.slice(caretPos + CARET.length) : "";
  const inMath = opts.inMath ?? true;
  const inCode = opts.inCode ?? false;

  for (const ch of keys) {
    const mathInner =
      inMath && before.startsWith("$") && after.endsWith("$")
        ? before.slice(1) + after.slice(0, -1)
        : before + after;
    const tree = inMath && !inCode ? buildMathTree(mathInner) : null;
    const ctx = buildRuleContext({
      key: ch,
      before,
      after,
      inMath,
      inBlockMath: false,
      inCode,
      tree,
      relPos: before.length,
    });
    const match = evaluateAutoInput(compiledDefaults, ctx, dialect);
    if (!match) {
      before += ch;
      continue;
    }

    const docDeleteBefore = Math.max(0, match.action.replaceLength - ch.length);
    const keepBefore = before.slice(0, before.length - docDeleteBefore);
    const keepAfter = after.slice(match.action.deleteAfter);
    const inserted = match.action.insert;
    const cOff = match.action.cursorOffset;

    before = keepBefore + inserted.slice(0, cOff);
    after = inserted.slice(cOff) + keepAfter;
  }

  return `${before}${CARET}${after}`;
}

describe("Official Default Rules — Integrity, Prefix Audit & Preview Smoke Tests", () => {
  it("passes strict rules.json schema & syntax validation with zero compile errors", () => {
    const file = createDefaultRulesFile();
    const res = validateRulesFile(file);
    assert.equal(res.valid, true, res.errors.join("\n"));
    assert.deepEqual(compiledDefaults.compileErrors, []);
  });

  it("has zero strict prefix collisions among auto text rules in compatible scopes", () => {
    const autoText = createDefaultRules().filter(
      (r): r is TextInputRule => r.enabled && r.type === "text" && r.triggerMode === "auto"
    );

    const collisions: string[] = [];
    for (let i = 0; i < autoText.length; i++) {
      for (let j = 0; j < autoText.length; j++) {
        if (i === j) continue;
        const a = autoText[i];
        const b = autoText[j];
        const scopeOverlap = a.scope === b.scope || a.scope === "any" || b.scope === "any";
        if (!scopeOverlap) continue;
        if (b.trigger.startsWith(a.trigger) && b.trigger !== a.trigger) {
          collisions.push(`${a.id}("${a.trigger}") is a strict prefix of ${b.id}("${b.trigger}")`);
        }
      }
    }
    assert.deepEqual(collisions, []);
  });

  it("renders valid non-empty previews for every official rule across all 3 dialects", () => {
    for (const locale of ["zh", "en"] as const) {
      const rules = createDefaultRules(locale);
      const dialects: OutputDialect[] = ["latex", "unicode", "raw"];

      for (const rule of rules) {
        for (const dialect of dialects) {
          const preview = evaluateRulePreview(rule, dialect);
          assert.equal(
            preview.error,
            undefined,
            `Rule ${rule.id} (${locale}) failed preview in ${dialect}: ${preview.error}`
          );
          assert.ok(preview.tex.trim().length > 0, `Rule ${rule.id} (${locale}) produced empty tex`);
          assert.ok(preview.rawOutput.length > 0, `Rule ${rule.id} (${locale}) produced empty rawOutput`);
        }
      }
    }
  });

  it("localizes all English rule groups and names without leftover CJK characters while keeping rule logic identical", () => {
    const zhRules = createDefaultRules("zh");
    const enRules = createDefaultRules("en");
    assert.equal(enRules.length, zhRules.length);

    const zhFile = createDefaultRulesFile("zh");
    const enFile = createDefaultRulesFile("en");
    assert.equal(validateRulesFile(zhFile).valid, true);
    assert.equal(validateRulesFile(enFile).valid, true);
    assert.deepEqual(compileRules(enRules).compileErrors, []);

    const hasCjk = /[\u4e00-\u9fff]/;
    for (let i = 0; i < zhRules.length; i++) {
      const zh = zhRules[i];
      const en = enRules[i];
      assert.equal(en.id, zh.id);
      assert.equal(en.type, zh.type);
      assert.equal(en.scope, zh.scope);
      assert.equal(en.triggerMode, zh.triggerMode);
      assert.equal(hasCjk.test(en.name), false, `English rule ${en.id} still has CJK in name: ${en.name}`);
      assert.equal(hasCjk.test(en.group), false, `English rule ${en.id} still has CJK in group: ${en.group}`);
      assert.ok(en.name.trim().length > 0, `English rule ${en.id} has empty name`);
      assert.ok(en.group.trim().length > 0, `English rule ${en.id} has empty group`);

      if (zh.type === "text" && en.type === "text") {
        assert.equal(en.trigger, zh.trigger);
        assert.equal(en.replacement, zh.replacement);
      } else if (zh.type === "regex" && en.type === "regex") {
        assert.equal(en.trigger, zh.trigger);
        assert.equal(en.replacement, zh.replacement);
      } else if (zh.type === "js" && en.type === "js") {
        assert.equal(en.code, zh.code);
      }
    }
  });
});

describe("Official Default Rules — JS Rules & Non-Matrix Input Flows", () => {
  it("handles math delimiter entry ($, $$, ￥) outside/inside math and protects escapes & code", () => {
    assert.equal(simulateTyping("$", "latex", { inMath: false }), "$▮$");
    assert.equal(simulateTyping("$", "latex", { initial: "你好▮", inMath: false }), "你好 $▮$");
    assert.equal(simulateTyping("$", "latex", { initial: "$▮$", inMath: true }), "$$\n▮\n$$");
    assert.equal(simulateTyping("￥", "latex", { inMath: false }), "$▮$");
    assert.equal(simulateTyping("$", "latex", { initial: "\\▮", inMath: false }), "\\$▮");
    assert.equal(simulateTyping("$", "latex", { inMath: false, inCode: true }), "$▮");
  });

  it("handles Greek, bold Greek, blackboard bold, calligraphic, and font wrappers", () => {
    assert.equal(simulateTyping(";a", "latex"), "\\alpha▮");
    assert.equal(simulateTyping(";a", "unicode"), "α▮");
    assert.equal(simulateTyping(";;a", "latex"), "\\boldsymbol{\\alpha}▮");
    assert.equal(simulateTyping(";;a", "unicode"), "\\boldsymbol{α}▮");
    assert.equal(simulateTyping("bbr", "latex"), "\\mathbb{R}▮");
    assert.equal(simulateTyping("bbr", "unicode"), "ℝ▮");
    assert.equal(simulateTyping("calf", "latex"), "\\mathcal{F}▮");
    assert.equal(simulateTyping("bfx", "latex"), "\\mathbf{x}▮");
    assert.equal(simulateTyping("bmx", "latex"), "\\boldsymbol{x}▮");
    assert.equal(simulateTyping("rmd", "latex"), "\\mathrm{d}▮");
    assert.equal(simulateTyping("mbf", "latex"), "\\mathbf{▮}");
    assert.equal(simulateTyping("mcal", "latex"), "\\mathcal{▮}");
  });

  it("handles 5-mode big operators, integrals, limits, and evaluation bars", () => {
    assert.equal(simulateTyping("sm=", "latex"), "\\sum_{▮=}^{}");
    assert.equal(simulateTyping("sm=", "unicode"), "∑_{▮=}^{}");
    assert.equal(simulateTyping("smkn", "latex"), "\\sum_{k=1}^{n}▮");
    assert.equal(simulateTyping("smk0n", "latex"), "\\sum_{k=0}^{n}▮");
    assert.equal(simulateTyping("smi,j", "latex"), "\\sum_{i,j}▮");
    assert.equal(simulateTyping("sm0n", "latex"), "\\sum_{n=0}^{\\infty}▮");
    assert.equal(simulateTyping("pd0n", "unicode"), "∏_{n=0}^{∞}▮");
    assert.equal(simulateTyping("bu1n", "latex"), "\\bigcup_{n=1}^{\\infty}▮");
    assert.equal(simulateTyping("bnkn", "latex"), "\\bigcap_{k=1}^{n}▮");

    assert.equal(simulateTyping("it=", "latex"), "\\int_{▮}^{}");
    assert.equal(simulateTyping("it-+", "unicode"), "∫_{-∞}^{+∞}▮");
    assert.equal(simulateTyping("it01", "latex"), "\\int_{0}^{1}▮");
    assert.equal(simulateTyping("it-a", "latex"), "\\int_{-\\infty}^{a}▮");
    assert.equal(simulateTyping("it0+", "latex"), "\\int_{0}^{+\\infty}▮");

    assert.equal(simulateTyping("lm=", "latex"), "\\lim\\limits_{▮ \\to }");
    assert.equal(simulateTyping("lmx0", "unicode"), "\\lim\\limits_{x → 0}▮");
    assert.equal(simulateTyping("lmx+", "latex"), "\\lim\\limits_{x \\to +\\infty}▮");
    assert.equal(simulateTyping("lmx-", "latex"), "\\lim\\limits_{x \\to -\\infty}▮");
    assert.equal(simulateTyping("lm+n", "latex"), "\\lim\\limits_{n \\to \\infty}▮");

    assert.equal(simulateTyping("er||", "latex"), "\\left.▮\\right|");
    assert.equal(simulateTyping("er|01", "latex"), "\\left.▮\\right|_{0}^{1}");
    assert.equal(simulateTyping("el|-+", "unicode"), "\\left|▮\\right._{-∞}^{+∞}");
  });

  it("handles command auto-space without interrupting hand-typed prefixes like \\left, \\sinh, \\dots, or \\texttt", () => {
    assert.equal(simulateTyping("\\sinx", "latex"), "\\sin x▮");
    assert.equal(simulateTyping("\\sinhx", "latex"), "\\sinh x▮");
    assert.equal(simulateTyping("\\left", "latex"), "\\left▮");
    assert.equal(simulateTyping("arcsin", "latex"), "\\arcsin▮");
    assert.equal(simulateTyping("sin", "latex"), "\\sin▮");
    assert.equal(simulateTyping("\\text{sin}", "latex"), "\\text{sin}▮");
    assert.equal(simulateTyping("\\dots", "latex"), "\\dots▮");
    assert.equal(simulateTyping("\\texttt", "latex"), "\\texttt▮");
    assert.equal(simulateTyping("\\textsf", "latex"), "\\textsf▮");
    assert.equal(simulateTyping("\\bigl", "latex"), "\\bigl▮");
    assert.equal(simulateTyping("\\Bigl", "latex"), "\\Bigl▮");
    assert.equal(simulateTyping("\\leqslant", "latex"), "\\leqslant▮");
    assert.equal(simulateTyping("\\geqslant", "latex"), "\\geqslant▮");
    assert.equal(simulateTyping("\\sech", "latex"), "\\sech▮");
    assert.equal(simulateTyping("\\csch", "latex"), "\\csch▮");
    assert.equal(simulateTyping("\\subsetneq", "latex"), "\\subsetneq▮");
    assert.equal(simulateTyping("\\rightharpoonup", "latex"), "\\rightharpoonup▮");
  });

  it("expands post-command scripts and fractions uniformly while protecting escaped symbols and backslash tokens", () => {
    // Post-command _, ^, / work after both hand-typed and auto-expanded commands in latex & unicode
    assert.equal(simulateTyping("\\sum_", "latex"), "\\sum_{▮}");
    assert.equal(simulateTyping("sum_", "latex"), "\\sum_{▮}");
    assert.equal(simulateTyping("sum_", "unicode"), "∑_{▮}");
    assert.equal(simulateTyping("\\sum^", "latex"), "\\sum^{▮}");
    assert.equal(simulateTyping("sum^", "latex"), "\\sum^{▮}");
    assert.equal(simulateTyping("\\int_", "latex"), "\\int_{▮}");
    assert.equal(simulateTyping("\\lim_", "latex"), "\\lim_{▮}");
    assert.equal(simulateTyping("\\alpha_", "latex"), "\\alpha_{▮}");
    assert.equal(simulateTyping(";a_", "latex"), "\\alpha_{▮}");
    assert.equal(simulateTyping(";a^", "latex"), "\\alpha^{▮}");
    assert.equal(simulateTyping("\\sin^", "latex"), "\\sin^{▮}");
    assert.equal(simulateTyping("\\log_", "latex"), "\\log_{▮}");
    assert.equal(simulateTyping("\\max_", "latex"), "\\max_{▮}");
    assert.equal(simulateTyping("limsup_", "latex"), "\\limsup_{▮}");
    assert.equal(simulateTyping("\\pi/", "latex"), "\\pi\\frac{▮}{}");
    assert.equal(simulateTyping("pi/", "latex"), "\\pi\\frac{▮}{}");
    assert.equal(simulateTyping("\\pi/", "unicode"), "\\pi\\frac{▮}{}");

    // Escaped control symbols and delimiter slashes stay intact; even `\\` still allows `_`
    assert.equal(simulateTyping("\\_", "latex"), "\\_▮");
    assert.equal(simulateTyping("\\^", "latex"), "\\^▮");
    assert.equal(simulateTyping("\\/", "latex"), "\\/▮");
    assert.equal(simulateTyping("\\left/", "latex"), "\\left/▮");
    assert.equal(simulateTyping("\\right/", "latex"), "\\right/▮");
    assert.equal(simulateTyping("\\\\_", "latex"), "\\\\_{▮}");

    // Multi-char rules never slice through preceding backslash tokens to leak orphan `\`
    assert.equal(simulateTyping("\\;a", "latex"), "\\;a▮");
    assert.equal(simulateTyping("\\;(", "latex"), "\\;(▮");
    assert.equal(simulateTyping("\\!=", "latex"), "\\!=▮");
    assert.equal(simulateTyping("\\sm=", "latex"), "\\sm=▮");
    assert.equal(simulateTyping("\\sm0n", "latex"), "\\sm0n▮");
    assert.equal(simulateTyping("\\it=", "latex"), "\\it=▮");
    assert.equal(simulateTyping("\\it01", "latex"), "\\it01▮");
    assert.equal(simulateTyping("\\lm=", "latex"), "\\lm=▮");
    assert.equal(simulateTyping("\\er||", "latex"), "\\er||▮");
    assert.equal(simulateTyping("\\er|01", "latex"), "\\er|01▮");
    assert.equal(simulateTyping("\\lr(", "latex"), "\\lr(▮");
    assert.equal(simulateTyping("\\o+", "latex"), "\\o+▮");
    assert.equal(simulateTyping("\\l[)", "latex"), "\\l[)▮");
    assert.equal(simulateTyping("\\...", "latex"), "\\...▮");
    assert.equal(simulateTyping("\\;;a", "latex"), "\\;\\alpha▮");
    assert.equal(simulateTyping("\\|->", "latex"), "\\|\\to▮");
  });

  it("handles derivatives, directional dots, delimiters, scripts, and cross-dialect chained arrows", () => {
    assert.equal(simulateTyping("ddx", "latex"), "\\frac{\\mathrm{d}}{\\mathrm{d}x}▮");
    assert.equal(simulateTyping("dd2x", "latex"), "\\frac{\\mathrm{d}^{2}}{\\mathrm{d}x^{2}}▮");
    assert.equal(simulateTyping("ppx", "latex"), "\\frac{\\partial}{\\partial x}▮");
    assert.equal(simulateTyping("pp2x", "unicode"), "\\frac{∂^{2}}{∂x^{2}}▮");
    assert.equal(simulateTyping("d...", "latex"), "\\ddots▮");
    assert.equal(simulateTyping("v...", "unicode"), "⋮▮");
    assert.equal(simulateTyping("...", "latex"), "\\cdots▮");

    assert.equal(simulateTyping("lr(", "latex"), "\\left(▮\\right)");
    assert.equal(simulateTyping("l[)", "latex"), "\\left[▮\\right)");
    assert.equal(simulateTyping(";(", "latex"), "(▮)");
    assert.equal(simulateTyping("lv2", "latex"), "\\left\\Vert ▮ \\right\\Vert_{2}");
    assert.equal(simulateTyping("nvp", "unicode"), "∥ ▮ ∥_{p}");

    assert.equal(simulateTyping("/", "latex"), "\\frac{▮}{}");
    assert.equal(simulateTyping("nsq", "latex"), "\\sqrt[▮]{}");
    assert.equal(simulateTyping("sq", "latex"), "\\sqrt{▮}");
    assert.equal(simulateTyping("xpw2", "latex"), "x^{2}▮");
    assert.equal(simulateTyping("asbk", "latex"), "a_{k}▮");

    // Chained arrows work in BOTH latex and unicode modes!
    assert.equal(simulateTyping("<->", "latex"), "\\leftrightarrow▮");
    assert.equal(simulateTyping("<->", "unicode"), "↔▮");
    assert.equal(simulateTyping("<=>", "latex"), "\\Leftrightarrow▮");
    assert.equal(simulateTyping("<=>", "unicode"), "⇔▮");
    assert.equal(simulateTyping("<==", "latex"), "\\Leftarrow▮");
    assert.equal(simulateTyping("<==", "unicode"), "⇐▮");
    assert.equal(simulateTyping("|->", "unicode"), "↦▮");

    // Environments & align breaks
    assert.equal(simulateTyping("cases", "latex"), "\\begin{cases}\n▮\n\\end{cases}");
    assert.equal(simulateTyping("\\\\=", "latex"), "\\\\ =& ▮");
    assert.equal(simulateTyping("\\\\e", "unicode"), "\\\\ ⇔& ▮");
  });

  it("handles dedicated Matrix group rules (shells, R×C grids, determinants, vectors, identity, symbolic & previews)", () => {
    const zhMatrixRules = createDefaultRules("zh").filter((r) => r.group === "矩阵类");
    const enMatrixRules = createDefaultRules("en").filter((r) => r.group === "Matrix");
    assert.equal(zhMatrixRules.length, 16);
    assert.equal(enMatrixRules.length, 16);

    // Empty shells
    assert.equal(simulateTyping("matb", "latex"), "\\begin{bmatrix}\n▮\n\\end{bmatrix}");
    assert.equal(simulateTyping("matp", "latex"), "\\begin{pmatrix}\n▮\n\\end{pmatrix}");
    assert.equal(simulateTyping("matv", "latex"), "\\begin{vmatrix}\n▮\n\\end{vmatrix}");
    assert.equal(simulateTyping("matB", "latex"), "\\begin{Bmatrix}\n▮\n\\end{Bmatrix}");
    assert.equal(simulateTyping("matV", "latex"), "\\begin{Vmatrix}\n▮\n\\end{Vmatrix}");
    assert.equal(simulateTyping("matm", "latex"), "\\begin{matrix}\n▮\n\\end{matrix}");
    assert.equal(simulateTyping("mats", "latex"), "\\begin{smallmatrix}▮\\end{smallmatrix}");
    assert.equal(simulateTyping("mata", "latex"), "\\left[\\begin{array}{c|c}\n  ▮ & \n\\end{array}\\right]");
    assert.equal(
      simulateTyping("dmat", "latex"),
      "\\begin{bmatrix}\n  ▮ &  &  \\\\\n   & \\ddots &  \\\\\n   &  & \n\\end{bmatrix}"
    );

    // Dimensioned R×C grid matrices, determinants, smallmatrix, and augmented matrices
    assert.equal(simulateTyping("mb22", "latex"), "\\begin{bmatrix}\n  ▮ &  \\\\\n   & \n\\end{bmatrix}");
    assert.equal(simulateTyping("mv33", "latex"), "\\begin{vmatrix}\n  ▮ &  &  \\\\\n   &  &  \\\\\n   &  & \n\\end{vmatrix}");
    assert.equal(simulateTyping("ms22", "latex"), "\\begin{smallmatrix} ▮ &  \\\\  &  \\end{smallmatrix}");
    assert.equal(
      simulateTyping("ma23", "latex"),
      "\\left[\\begin{array}{cc|c}\n  ▮ &  &  \\\\\n   &  & \n\\end{array}\\right]"
    );
    // Word boundary guard prevents firing inside words like `amb22`
    assert.equal(simulateTyping("amb22", "latex"), "amb22▮");

    // Tab traversal visits every cell of generated mb22 in row-major order before exiting
    let grid = simulateTyping("mb22", "latex");
    const visited: number[] = [];
    for (let step = 0; step < 4; step++) {
      const pos = grid.indexOf(CARET);
      const src = grid.slice(0, pos) + grid.slice(pos + 1);
      const next = resolveStructuralJump(buildMathTree(src), pos);
      assert.notEqual(next, null);
      visited.push(next!);
      grid = src.slice(0, next!) + CARET + src.slice(next!);
    }
    assert.equal(grid, "\\begin{bmatrix}\n   &  \\\\\n   & \n\\end{bmatrix}▮");
    assert.equal(visited.length, 4);

    // Identity matrices
    assert.equal(simulateTyping("eye2", "latex"), "\\begin{bmatrix}\n  1 & 0 \\\\\n  0 & 1\n\\end{bmatrix}▮");
    assert.equal(
      simulateTyping("eyen", "unicode"),
      "\\begin{bmatrix}\n  1 & 0 & ⋯ & 0 \\\\\n  0 & 1 & ⋯ & 0 \\\\\n  ⋮ & ⋮ & ⋱ & ⋮ \\\\\n  0 & 0 & ⋯ & 1\n\\end{bmatrix}▮"
    );

    // Symbolic matrices, determinants, vectors, diagonal, Vandermonde, Jacobian
    assert.equal(
      simulateTyping("ju<a>", "latex"),
      "\\begin{bmatrix}\n  a_{11} & a_{12} & \\cdots & a_{1n} \\\\\n  a_{21} & a_{22} & \\cdots & a_{2n} \\\\\n  \\vdots & \\vdots & \\ddots & \\vdots \\\\\n  a_{n1} & a_{n2} & \\cdots & a_{nn}\n\\end{bmatrix}▮"
    );
    assert.equal(
      simulateTyping("juv<;a,m,n>", "unicode"),
      "\\begin{vmatrix}\n  α_{11} & α_{12} & ⋯ & α_{1n} \\\\\n  α_{21} & α_{22} & ⋯ & α_{2n} \\\\\n  ⋮ & ⋮ & ⋱ & ⋮ \\\\\n  α_{m1} & α_{m2} & ⋯ & α_{mn}\n\\end{vmatrix}▮"
    );
    assert.equal(
      simulateTyping("vx<x>", "latex"),
      "\\begin{bmatrix}\n  x_{1} \\\\\n  x_{2} \\\\\n  \\vdots \\\\\n  x_{n}\n\\end{bmatrix}▮"
    );
    assert.equal(
      simulateTyping("cxp<x>", "unicode"),
      "\\begin{pmatrix} x_{1} & x_{2} & ⋯ & x_{n} \\end{pmatrix}▮"
    );
    assert.equal(
      simulateTyping("diag<;l>", "latex"),
      "\\begin{bmatrix}\n  \\lambda_{1} & 0 & \\cdots & 0 \\\\\n  0 & \\lambda_{2} & \\cdots & 0 \\\\\n  \\vdots & \\vdots & \\ddots & \\vdots \\\\\n  0 & 0 & \\cdots & \\lambda_{n}\n\\end{bmatrix}▮"
    );
    assert.equal(
      simulateTyping("vdm<x>", "latex"),
      "\\begin{vmatrix}\n  1 & 1 & \\cdots & 1 \\\\\n  x_{1} & x_{2} & \\cdots & x_{n} \\\\\n  x_{1}^{2} & x_{2}^{2} & \\cdots & x_{n}^{2} \\\\\n  \\vdots & \\vdots & \\ddots & \\vdots \\\\\n  x_{1}^{n-1} & x_{2}^{n-1} & \\cdots & x_{n}^{n-1}\n\\end{vmatrix}▮"
    );
    assert.equal(
      simulateTyping("jacv<y,x>", "unicode"),
      "\\begin{vmatrix}\n  \\frac{∂y_{1}}{∂x_{1}} & ⋯ & \\frac{∂y_{1}}{∂x_{n}} \\\\\n  ⋮ & ⋱ & ⋮ \\\\\n  \\frac{∂y_{m}}{∂x_{1}} & ⋯ & \\frac{∂y_{m}}{∂x_{n}}\n\\end{vmatrix}▮"
    );

    // MathJax preview renders empty matrix cells as \square without altering rawOutput
    const gridRule = zhMatrixRules.find((r) => r.id === "js-matrix-grid")!;
    const gridPreview = evaluateRulePreview(gridRule, "latex");
    assert.ok(gridPreview.tex.includes("\\square"));
    assert.equal(gridPreview.rawOutput.includes("\\square"), false);
  });
});
