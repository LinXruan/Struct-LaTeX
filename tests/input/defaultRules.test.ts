import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRuleContext } from "../../src/input/contextBuilder";
import { createDefaultRules, createDefaultRulesFile } from "../../src/input/defaultRules";
import { compileRules } from "../../src/input/ruleCompiler";
import { evaluateAutoInput, evaluateRulePreview } from "../../src/input/ruleEngine";
import { OutputDialect, TextInputRule } from "../../src/input/types";
import { validateRulesFile } from "../../src/input/validation";
import { buildMathTree } from "../../src/parser/builder";

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

  it("handles command auto-space without interrupting hand-typed prefixes like \\left or \\sinh", () => {
    assert.equal(simulateTyping("\\sinx", "latex"), "\\sin x▮");
    assert.equal(simulateTyping("\\sinhx", "latex"), "\\sinh x▮");
    assert.equal(simulateTyping("\\left", "latex"), "\\left▮");
    assert.equal(simulateTyping("arcsin", "latex"), "\\arcsin▮");
    assert.equal(simulateTyping("sin", "latex"), "\\sin▮");
    assert.equal(simulateTyping("\\text{sin}", "latex"), "\\text{sin}▮");
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
});
