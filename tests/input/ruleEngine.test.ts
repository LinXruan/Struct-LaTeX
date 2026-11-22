import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRuleContext } from "../../src/input/contextBuilder";
import { convertOutputDialect } from "../../src/input/dialectConverter";
import { compileRules } from "../../src/input/ruleCompiler";
import {
  evaluateAutoInput,
  evaluateConfirmKey,
  evaluateHotkey,
  evaluateRulePreview,
} from "../../src/input/ruleEngine";
import { InputRule, OutputDialect } from "../../src/input/types";
import { validateRule, validateRulesFile } from "../../src/input/validation";
import { buildMathTree } from "../../src/parser/builder";

function makeMathCtx(before: string, key: string, after = "") {
  const tree = buildMathTree(before);
  return buildRuleContext({
    key,
    before,
    after,
    inMath: true,
    inBlockMath: false,
    inCode: false,
    tree,
    relPos: before.length,
  });
}

describe("Rule Validation — Completeness & Syntax Guards", () => {
  it("rejects incomplete or syntactically invalid rules", () => {
    assert.equal(
      validateRule({
        id: "t1",
        name: "empty trigger",
        group: "g",
        type: "text",
        enabled: true,
        scope: "math",
        triggerMode: "auto",
        trigger: "",
        replacement: "\\alpha",
      }).valid,
      false
    );

    assert.equal(
      validateRule({
        id: "t2",
        name: "empty replacement",
        group: "g",
        type: "text",
        enabled: true,
        scope: "math",
        triggerMode: "auto",
        trigger: "aa",
        replacement: "",
      }).valid,
      false
    );

    assert.equal(
      validateRule({
        id: "r1",
        name: "bad regex",
        group: "g",
        type: "regex",
        enabled: true,
        scope: "math",
        triggerMode: "auto",
        trigger: "([unclosed",
        replacement: "$1",
      }).valid,
      false
    );

    assert.equal(
      validateRule({
        id: "r2",
        name: "stateful g flag disallowed",
        group: "g",
        type: "regex",
        enabled: true,
        scope: "math",
        triggerMode: "auto",
        trigger: "a",
        flags: "g",
        replacement: "b",
      }).valid,
      false
    );

    assert.equal(
      validateRule({
        id: "j1",
        name: "bad js",
        group: "g",
        type: "js",
        enabled: true,
        scope: "math",
        triggerMode: "auto",
        code: "return {;",
      }).valid,
      false
    );

    assert.equal(
      validateRule({
        id: "c1",
        name: "missing confirm key",
        group: "g",
        type: "text",
        enabled: true,
        scope: "math",
        triggerMode: "confirm",
        trigger: "sin",
        replacement: "\\sin",
      }).valid,
      false
    );

    assert.equal(
      validateRule({
        id: "h1",
        name: "missing hotkey",
        group: "g",
        type: "text",
        enabled: true,
        scope: "math",
        triggerMode: "hotkey",
        trigger: "",
        replacement: "\\frac{$0}{}",
        hotkey: "Ctrl+",
      }).valid,
      false
    );
  });

  it("allows hotkey rules with empty text trigger and rejects duplicate rule IDs", () => {
    const hotkeyRule: InputRule = {
      id: "hk-frac",
      name: "分式快捷键",
      group: "g",
      type: "text",
      enabled: true,
      scope: "math",
      triggerMode: "hotkey",
      hotkey: "Alt+F",
      trigger: "",
      replacement: "\\frac{$0}{}",
    };
    assert.equal(validateRule(hotkeyRule).valid, true);
    assert.equal(
      validateRulesFile({ version: 1, rules: [hotkeyRule, { ...hotkeyRule }] }).valid,
      false
    );
  });
});

describe("Output Dialect Converter — Token-Level & Cursor Remapping", () => {
  it("converts between latex and unicode safely without harming protected scopes", () => {
    const res1 = convertOutputDialect("\\sum_{}^{}", 7, "unicode");
    assert.equal(res1.insert, "∑_{}^{}");
    assert.equal(res1.cursorOffset, 4);

    // BMP blackboard bold ℝ (length 1) and surrogate-pair 𝔸 (length 2) cursor remapping
    const resBB = convertOutputDialect("\\mathbb{R}", 10, "unicode");
    assert.equal(resBB.insert, "ℝ");
    assert.equal(resBB.cursorOffset, 1);

    const resSurr = convertOutputDialect("\\mathbb{A} + x", 10, "unicode");
    assert.equal(resSurr.insert, "𝔸 + x");
    assert.equal(resSurr.cursorOffset, 2);

    const resBack = convertOutputDialect("ℝ", 1, "latex");
    assert.equal(resBack.insert, "\\mathbb{R}");
    assert.equal(resBack.cursorOffset, 10);

    // Preserves inner cursor offset inside unchanged whitespace chunk
    const resWs = convertOutputDialect("\\left\\Vert  \\right\\Vert_{2}", 11, "latex");
    assert.equal(resWs.insert, "\\left\\Vert  \\right\\Vert_{2}");
    assert.equal(resWs.cursorOffset, 11);

    // Preserves \left\langle...\right\rangle, \begin{...}, \text{...}, and \bigcup/\bigcap
    const protectedSrc = "\\left\\langle\\alpha\\right\\rangle + \\text{\\alpha} + \\bigcup";
    const protUni = convertOutputDialect(protectedSrc, protectedSrc.length, "unicode");
    assert.equal(protUni.insert, "\\left\\langleα\\right\\rangle + \\text{\\alpha} + \\bigcup");

    // Separates letter command from following letter atom when converting Unicode -> LaTeX
    const sep = convertOutputDialect("αx", 1, "latex");
    assert.equal(sep.insert, "\\alpha x");
    assert.equal(sep.cursorOffset, 7);

    // Raw preserves untouched
    assert.equal(convertOutputDialect("α + \\beta", 2, "raw").insert, "α + \\beta");
  });
});

describe("Rule Engine — Triggers, Guards, Structural JS Context & Error Isolation", () => {
  it("supports confirm key, single hotkey, and 2-step chord triggers", () => {
    const rules: InputRule[] = [
      {
        id: "confirm-sin",
        name: "sin confirm",
        group: "fn",
        type: "text",
        enabled: true,
        scope: "math",
        triggerMode: "confirm",
        confirmKey: "Tab",
        trigger: "sin",
        replacement: "\\sin",
        guards: { wordBoundary: true },
      },
      {
        id: "hk-frac",
        name: "frac hotkey",
        group: "struct",
        type: "text",
        enabled: true,
        scope: "math",
        triggerMode: "hotkey",
        hotkey: "Alt+F",
        trigger: "",
        replacement: "\\frac{$0}{}",
      },
      {
        id: "chord-mat",
        name: "chord bmatrix",
        group: "env",
        type: "text",
        enabled: true,
        scope: "math",
        triggerMode: "hotkey",
        hotkey: "Mod+K M",
        trigger: "",
        replacement: "\\begin{bmatrix}$0\\end{bmatrix}",
      },
    ];
    const compiled = compileRules(rules);
    assert.equal(compiled.chordPrefixes.has("Mod+K"), true);

    const ctxConfirm = makeMathCtx("sin", "");
    const m1 = evaluateConfirmKey(compiled, ctxConfirm, "Tab", "latex");
    assert.ok(m1);
    assert.equal(m1.action.insert, "\\sin");
    assert.equal(evaluateConfirmKey(compiled, makeMathCtx("arcsin", ""), "Tab", "latex"), null);

    const m2 = evaluateHotkey(compiled, makeMathCtx("x+", ""), "Alt+F", "latex");
    assert.ok(m2);
    assert.equal(m2.action.insert, "\\frac{}{}");
    assert.equal(m2.action.cursorOffset, 6);

    const m3 = evaluateHotkey(compiled, makeMathCtx("", ""), "Mod+K M", "latex");
    assert.ok(m3);
    assert.equal(m3.action.insert, "\\begin{bmatrix}\\end{bmatrix}");

    // Hotkey rules (empty key) right after a complete LaTeX command must not be blocked
    const mAfterCmd = evaluateHotkey(compiled, makeMathCtx("\\sum", ""), "Alt+F", "latex");
    assert.ok(mAfterCmd);
    assert.equal(mAfterCmd.action.insert, "\\frac{}{}");
  });

  it("enforces textMode, envName, commandTyping guards and exposes prevObject to JS rules", () => {
    const wrapPrevJs: InputRule = {
      id: "js-wrap-prev",
      name: "wrap prev object",
      group: "custom",
      type: "js",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      exampleInput: "\\frac{a}{b}!",
      code: [
        'if (ctx.key !== "!" || !ctx.prevObject) return null;',
        "var len = ctx.before.length - ctx.prevObject.from + 1;",
        'var body = ctx.before.slice(ctx.prevObject.from, ctx.prevObject.coreTo);',
        'return { replaceLength: len, insert: "\\\\boxed{" + body + "}" };',
      ].join("\n"),
    };
    const textRule: InputRule = {
      id: "t-alpha",
      name: "alpha",
      group: "g",
      type: "text",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      trigger: "aa",
      replacement: "\\alpha",
    };
    const subRule: InputRule = {
      id: "t-sub",
      name: "sub",
      group: "g",
      type: "text",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      trigger: "_",
      replacement: "_{$0}",
    };
    const sliceTextRule: InputRule = {
      id: "t-slice",
      name: "slice",
      group: "g",
      type: "text",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      trigger: "m_",
      replacement: "X",
    };

    const compiled = compileRules([wrapPrevJs, textRule, subRule, sliceTextRule]);

    // prevObject wraps nested \frac{a}{b}
    const wrapped = evaluateAutoInput(compiled, makeMathCtx("\\frac{a}{b}", "!"), "latex");
    assert.ok(wrapped);
    assert.equal(wrapped.action.insert, "\\boxed{\\frac{a}{b}}");

    // Guard blocks inside \text{...}, \begin{...}, while typing \cmd letters, and escaped \_
    assert.equal(evaluateAutoInput(compiled, makeMathCtx("\\text{a", "a"), "latex"), null);
    assert.equal(evaluateAutoInput(compiled, makeMathCtx("\\begin{aa", "a"), "latex"), null);
    assert.equal(evaluateAutoInput(compiled, makeMathCtx("\\a", "a"), "latex"), null);
    assert.equal(evaluateAutoInput(compiled, makeMathCtx("\\", "_"), "latex"), null);

    // Non-letter operator `_` triggers after complete `\sum`, while `m_` cannot slice `\sum`
    const subAfterCmd = evaluateAutoInput(compiled, makeMathCtx("\\sum", "_"), "latex");
    assert.ok(subAfterCmd);
    assert.equal(subAfterCmd.rule.id, "t-sub");
    assert.equal(subAfterCmd.action.insert, "_{}");
  });

  it("isolates JS runtime errors without crashing evaluation", () => {
    const buggy: InputRule = {
      id: "js-bug",
      name: "buggy",
      group: "g",
      type: "js",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      exampleInput: "x",
      code: "throw new Error('boom');",
    };
    const fallback: InputRule = {
      id: "t-ok",
      name: "ok",
      group: "g",
      type: "text",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      trigger: "x",
      replacement: "\\chi",
    };

    const compiled = compileRules([buggy, fallback]);
    const reported: string[] = [];
    const res = evaluateAutoInput(compiled, makeMathCtx("", "x"), "latex", (r, msg) =>
      reported.push(`${r.id}:${msg}`)
    );

    assert.deepEqual(reported, ["js-bug:boom"]);
    assert.ok(res);
    assert.equal(res.action.insert, "\\chi");

    const previewErr = evaluateRulePreview(buggy, "latex" as OutputDialect);
    assert.ok(previewErr.error?.includes("boom"));
  });

  it("syncs ambiguous-bar parsing option into rule preview sandbox (enabled by default)", () => {
    const checkPrevBracketJs: InputRule = {
      id: "js-check-bar",
      name: "check prev bracket",
      group: "custom",
      type: "js",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      exampleInput: "|x|!",
      code: [
        'if (ctx.key !== "!") return null;',
        'var kind = ctx.prevObject ? ctx.prevObject.kind : "none";',
        'return { replaceLength: 1, insert: kind };',
      ].join("\n"),
    };

    const defaultPreview = evaluateRulePreview(checkPrevBracketJs, "latex");
    assert.equal(defaultPreview.rawOutput, "|x|bracket");

    const disabledPreview = evaluateRulePreview(checkPrevBracketJs, "latex", {
      parseAmbiguousBars: false,
    });
    assert.equal(disabledPreview.rawOutput, "|x|atom");
  });
});
