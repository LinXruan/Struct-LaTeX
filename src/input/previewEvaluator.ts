import { t } from "../i18n";
import { buildMathTree } from "../parser/builder";
import { MathParseOptions } from "../parser/types";
import { buildRuleContext, expandTemplate } from "./contextBuilder";
import { convertOutputDialect } from "./dialectConverter";
import { expandRegexTemplate } from "./ruleEngine";
import { InputRule, OutputDialect, RulePreviewResult } from "./types";
import { validateRule } from "./validation";

function formatTexForMathJax(rawTex: string): string {
  let tex = rawTex.trim();
  if (!tex) return "\\square";

  tex = tex.replace(/(^|[^\\])((?:\\\\)*)\{\}/g, "$1$2{\\square}");
  tex = tex.replace(/\[(\s*)\]/g, "[\\square]");
  tex = tex.replace(/_\{=\}/g, "_{\\square=}");

  tex = tex.replace(/\\left\(\\right\)/g, "\\left(\\square\\right)");
  tex = tex.replace(/\\left\[\\right\]/g, "\\left[\\square\\right]");
  tex = tex.replace(/\\left\\\{\\right\\\}/g, "\\left\\{\\square\\right\\}");
  tex = tex.replace(/\\left\|\\right\|/g, "\\left|\\square\\right|");
  tex = tex.replace(/\\left\.\\right\|/g, "\\left.\\square\\right|");
  tex = tex.replace(/\\left\|\\right\./g, "\\left|\\square\\right.");
  tex = tex.replace(/\\left\\langle\\right\\rangle/g, "\\left\\langle\\square\\right\\rangle");
  tex = tex.replace(/\\left\\lfloor\\right\\rfloor/g, "\\left\\lfloor\\square\\right\\rfloor");
  tex = tex.replace(/\\left\\lceil\\right\\rceil/g, "\\left\\lceil\\square\\right\\rceil");
  tex = tex.replace(/\\left\\Vert\\right\\Vert/g, "\\left\\Vert\\square\\right\\Vert");
  tex = tex.replace(/\(\)/g, "(\\square)");
  tex = tex.replace(/\|\|/g, "|\\square|");
  tex = tex.replace(/\\\{\\\}/g, "\\{\\square\\}");
  tex = tex.replace(/\\langle\s*\\rangle/g, "\\langle \\square \\rangle");
  tex = tex.replace(/\\lfloor\s*\\rfloor/g, "\\lfloor \\square \\rfloor");
  tex = tex.replace(/\\lceil\s*\\rceil/g, "\\lceil \\square \\rceil");
  tex = tex.replace(/\\\|\s*\\\|/g, "\\| \\square \\|");
  tex = tex.replace(/⟨⟩/g, "⟨\\square⟩");
  tex = tex.replace(/⌊⌋/g, "⌊\\square⌋");
  tex = tex.replace(/⌈⌉/g, "⌈\\square⌉");
  tex = tex.replace(/∥∥/g, "∥\\square∥");

  tex = tex.replace(
    /(\\begin\{(?:cases|align|[bpvBV]?matrix|smallmatrix)\})\s*(\\end\{(?:cases|align|[bpvBV]?matrix|smallmatrix)\})/g,
    "$1\\square$2"
  );
  tex = tex.replace(
    /(\\begin\{(?:[bpvBV]?matrix|smallmatrix)\}|\\begin\{array\}\{[^}]*\})([\s\S]*?)(\\end\{(?:[bpvBV]?matrix|smallmatrix|array)\})/g,
    (_, open: string, body: string, close: string) => {
      const filled = body
        .split("\\\\")
        .map((row) =>
          row
            .split("&")
            .map((cell) => (cell.trim().length === 0 ? " \\square " : cell))
            .join("&")
        )
        .join("\\\\");
      return `${open}${filled}${close}`;
    }
  );

  if (tex.includes("&") && !tex.includes("\\begin{")) {
    tex = `\\begin{aligned}x ${tex} y\\end{aligned}`;
  }

  if (/^[_^]/.test(tex)) {
    tex = `x${tex}`;
  }

  return tex;
}

function toCanonicalLatex(
  rawSource: string,
  convertedText: string,
  rule: InputRule,
  inMath: boolean,
  dialect: OutputDialect
): string {
  if (rule.skipDialect || !inMath) return convertedText;
  // Already normalized to canonical LaTeX when dialect is "latex"
  if (dialect === "latex") return convertedText;
  return convertOutputDialect(rawSource, rawSource.length, "latex").insert;
}

function toDialectOutput(
  text: string,
  cursor: number,
  rule: InputRule,
  inMath: boolean,
  dialect: OutputDialect
): { insert: string; cursorOffset: number } {
  if (rule.skipDialect || !inMath || dialect === "raw") {
    return { insert: text, cursorOffset: cursor };
  }
  return convertOutputDialect(text, cursor, dialect);
}

/**
 * Computes the MathJax preview TeX and dialect-converted output string for any rule.
 * Used both by the Settings UI MathJax preview and automated smoke tests.
 */
export function evaluateRulePreview(
  rule: InputRule,
  dialect: OutputDialect,
  parseOptions?: MathParseOptions
): RulePreviewResult {
  const validation = validateRule(rule);
  if (!validation.valid) {
    return { tex: "", rawOutput: "", error: validation.errors[0] };
  }

  const inMath = rule.scope !== "text";

  if (rule.preview && rule.preview.trim().length > 0) {
    const rawOutput = toDialectOutput(rule.preview, rule.preview.length, rule, inMath, dialect).insert;
    return { tex: rule.preview, rawOutput };
  }

  if (rule.type === "text") {
    const expanded = expandTemplate(rule.replacement);
    const converted = toDialectOutput(expanded.insert, expanded.cursorOffset, rule, inMath, dialect);
    const canonical = toCanonicalLatex(expanded.insert, converted.insert, rule, inMath, dialect);
    return {
      tex: formatTexForMathJax(canonical),
      rawOutput: converted.insert,
    };
  }

  if (rule.type === "regex") {
    let rawExpanded: string;
    if (rule.exampleInput && rule.exampleInput.length > 0) {
      const re = new RegExp(`(?:${rule.trigger})$`, rule.flags ?? "");
      const m = re.exec(rule.exampleInput);
      if (!m) {
        return { tex: "", rawOutput: "", error: t("preview.regexMismatch", { sample: rule.exampleInput }) };
      }
      rawExpanded = expandTemplate(expandRegexTemplate(rule.replacement, m)).insert;
    } else {
      rawExpanded = expandTemplate(expandRegexTemplate(rule.replacement, ["", "x", "n", "k"])).insert;
    }

    const converted = toDialectOutput(rawExpanded, rawExpanded.length, rule, inMath, dialect).insert;
    const canonical = toCanonicalLatex(rawExpanded, converted, rule, inMath, dialect);
    return {
      tex: formatTexForMathJax(canonical),
      rawOutput: converted,
    };
  }

  const sample = rule.exampleInput ?? "";
  if (sample.length === 0) {
    return { tex: "\\text{JS}", rawOutput: t("preview.jsNoSample") };
  }

  try {
    const fn = new Function("ctx", rule.code);
    const isAuto = rule.triggerMode === "auto";
    const before = isAuto ? sample.slice(0, -1) : sample;
    const key = isAuto ? sample.slice(-1) : "";
    const tree = inMath
      ? buildMathTree(before, { parseAmbiguousBars: parseOptions?.parseAmbiguousBars ?? true })
      : null;
    const ctx = buildRuleContext({
      key,
      before,
      after: "",
      inMath,
      inBlockMath: false,
      inCode: false,
      tree,
      relPos: before.length,
    });
    const res = fn(ctx);
    if (!res) {
      return { tex: "", rawOutput: "", error: t("preview.jsReturnedNull", { sample }) };
    }
    const prefixKeep = sample.slice(0, Math.max(0, sample.length - (res.replaceLength ?? 0)));
    const rawInsert = String(res.insert ?? "");
    const cursor = res.cursorOffset ?? rawInsert.length;
    const finalInsert = toDialectOutput(rawInsert, cursor, rule, inMath, dialect).insert;
    const combinedRaw = prefixKeep + rawInsert;
    const combinedFinal = prefixKeep + finalInsert;
    const canonical = toCanonicalLatex(combinedRaw, combinedFinal, rule, inMath, dialect);
    return {
      tex: formatTexForMathJax(canonical),
      rawOutput: combinedFinal,
    };
  } catch (err) {
    return { tex: "", rawOutput: "", error: (err as Error).message || String(err) };
  }
}
