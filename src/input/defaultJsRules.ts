import { JsInputRule } from "./types";

const MATH_DELIM_CODE = `if (ctx.inCode) return null;
if (ctx.key !== "$" && ctx.key !== "￥") return null;

// Ignore escaped \\$ or \\￥
var bs = 0;
for (var i = ctx.before.length - 1; i >= 0 && ctx.before[i] === "\\\\"; i--) bs++;
if (bs % 2 === 1) return null;

// Empty inline $|$ (either recognized by syntaxTree with empty tree, or unparsed odd $) upgrades to $$...$$
var isSingleBefore = ctx.before.endsWith("$") && !ctx.before.endsWith("$$");
var isSingleAfter = ctx.after.startsWith("$") && !ctx.after.startsWith("$$");
if (!ctx.inBlockMath && isSingleBefore && isSingleAfter) {
  var isEmptyMathPair = ctx.inMath
    ? ctx.tree !== null && ctx.tree.source.length === 0
    : countUnescapedDollars(ctx.before) % 2 === 1;
  if (isEmptyMathPair) {
    return { replaceLength: 2, deleteAfter: 1, insert: "$$\\n\\n$$", cursorOffset: 3 };
  }
}

if (ctx.inMath) return null;

function countUnescapedDollars(str) {
  var count = 0;
  for (var idx = 0; idx < str.length; idx++) {
    if (str[idx] === "\\\\") { idx++; continue; }
    if (str[idx] === "$") count++;
  }
  return count;
}

var needSpace = ctx.before.length > 0 && !/\\s$/.test(ctx.before);
return needSpace
  ? { replaceLength: 1, insert: " $$", cursorOffset: 2 }
  : { replaceLength: 1, insert: "$$", cursorOffset: 1 };`;

const BOLD_GREEK_CODE = `var map = {
  a: "alpha", b: "beta", g: "gamma", G: "Gamma", d: "delta", D: "Delta",
  e: "varepsilon", E: "epsilon", z: "zeta", h: "eta", q: "theta", Q: "Theta",
  i: "iota", k: "kappa", l: "lambda", L: "Lambda", m: "mu", n: "nu",
  x: "xi", X: "Xi", p: "pi", P: "Pi", r: "rho", s: "sigma",
  S: "Sigma", v: "varsigma", t: "tau", u: "upsilon", U: "Upsilon",
  f: "varphi", F: "Phi", j: "phi", c: "chi", y: "psi", Y: "Psi",
  w: "omega", W: "Omega"
};
var m = /;;([a-zA-Z])$/.exec(ctx.text);
if (!m || !map[m[1]]) return null;
return { replaceLength: 3, insert: "\\\\boldsymbol{\\\\" + map[m[1]] + "}" };`;

const FONT_BB_CODE = `var m = /bb([a-zA-Z])$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
return { replaceLength: 3, insert: "\\\\mathbb{" + m[1].toUpperCase() + "}" };`;

const FONT_CAL_CODE = `var m = /cal([a-zA-Z])$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
return { replaceLength: 4, insert: "\\\\mathcal{" + m[1].toUpperCase() + "}" };`;

const BIG_OP_5MODE_CODE = `var ops = { sm: "\\\\sum", pd: "\\\\prod", bu: "\\\\bigcup", bn: "\\\\bigcap" };
var m = /(sm|pd|bu|bn)(?:(=)|([0-9])([a-zA-Z])|([a-zA-Z]),([a-zA-Z])|([a-zA-Z])([0-9])([a-zA-Z])|([a-zA-Z])([a-zA-Z]))$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
var cmd = ops[m[1]];
if (m[2]) {
  var tpl = cmd + "_{$0=}^{}";
  return Object.assign({ replaceLength: m[0].length }, ctx.helpers.expandTemplate(tpl));
}
if (m[3]) return { replaceLength: m[0].length, insert: cmd + "_{" + m[4] + "=" + m[3] + "}^{\\\\infty}" };
if (m[5]) return { replaceLength: m[0].length, insert: cmd + "_{" + m[5] + "," + m[6] + "}" };
if (m[7]) return { replaceLength: m[0].length, insert: cmd + "_{" + m[7] + "=" + m[8] + "}^{" + m[9] + "}" };
return { replaceLength: m[0].length, insert: cmd + "_{" + m[10] + "=1}^{" + m[11] + "}" };`;

const INTEGRAL_CODE = `var m = /it(?:(=)|(-\\+)|-([a-zA-Z0-9])|([a-zA-Z0-9])\\+|([a-zA-Z0-9])([a-zA-Z0-9]))$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
if (m[1]) return Object.assign({ replaceLength: m[0].length }, ctx.helpers.expandTemplate("\\\\int_{$0}^{}"));
if (m[2]) return { replaceLength: m[0].length, insert: "\\\\int_{-\\\\infty}^{+\\\\infty}" };
if (m[3]) return { replaceLength: m[0].length, insert: "\\\\int_{-\\\\infty}^{" + m[3] + "}" };
if (m[4]) return { replaceLength: m[0].length, insert: "\\\\int_{" + m[4] + "}^{+\\\\infty}" };
return { replaceLength: m[0].length, insert: "\\\\int_{" + m[5] + "}^{" + m[6] + "}" };`;

const LIMIT_CODE = `var m = /lm(?:(=)|\\+([a-zA-Z0-9])|([a-zA-Z0-9])\\+|([a-zA-Z0-9])-|([a-zA-Z0-9])([a-zA-Z0-9]))$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
if (m[1]) return Object.assign({ replaceLength: m[0].length }, ctx.helpers.expandTemplate("\\\\lim\\\\limits_{$0 \\\\to }"));
if (m[2]) return { replaceLength: m[0].length, insert: "\\\\lim\\\\limits_{" + m[2] + " \\\\to \\\\infty}" };
if (m[3]) return { replaceLength: m[0].length, insert: "\\\\lim\\\\limits_{" + m[3] + " \\\\to +\\\\infty}" };
if (m[4]) return { replaceLength: m[0].length, insert: "\\\\lim\\\\limits_{" + m[4] + " \\\\to -\\\\infty}" };
return { replaceLength: m[0].length, insert: "\\\\lim\\\\limits_{" + m[5] + " \\\\to " + m[6] + "}" };`;

const EVAL_BAR_CODE = `var m = /(er|el)\\|(?:(\\|)|(-\\+)|-([a-zA-Z0-9])|([a-zA-Z0-9])\\+|([a-zA-Z0-9])([a-zA-Z0-9]))$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
var body = m[1] === "er" ? "\\\\left.$0\\\\right|" : "\\\\left|$0\\\\right.";
var suffix = "";
if (m[3]) suffix = "_{-\\\\infty}^{+\\\\infty}";
else if (m[4]) suffix = "_{-\\\\infty}^{" + m[4] + "}";
else if (m[5]) suffix = "_{" + m[5] + "}^{+\\\\infty}";
else if (m[6]) suffix = "_{" + m[6] + "}^{" + m[7] + "}";
return Object.assign({ replaceLength: m[0].length }, ctx.helpers.expandTemplate(body + suffix));`;

const CMD_AUTO_SPACE_CODE = `if (!/^[a-zA-Z]$/.test(ctx.key)) return null;
var m = /(?:^|[^\\\\])(?:\\\\\\\\)*(\\\\[a-zA-Z]+)$/.exec(ctx.before);
if (!m) return null;
var cmd = m[1];
if (!ctx.helpers.isKnownCommand(cmd)) return null;
if (ctx.helpers.isCommandPrefix(cmd + ctx.key)) return null;
return { replaceLength: 1, insert: " " + ctx.key };`;

export const DEFAULT_JS_PRE_RULES: JsInputRule[] = [
  {
    id: "js-math-delim",
    name: "数学定界符入口 ($ / $$ / ￥)",
    group: "定界符入口",
    type: "js",
    enabled: true,
    scope: "any",
    triggerMode: "auto",
    guards: {
      excludeInTextMode: false,
      excludeInCommand: false,
      excludeInEnvName: false,
    },
    skipDialect: true,
    exampleInput: "$",
    preview: "x + y",
    code: MATH_DELIM_CODE,
  },
  {
    id: "js-bold-greek",
    name: "粗体希腊字母族 (;;a 等)",
    group: "字母与字体",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    exampleInput: ";;a",
    code: BOLD_GREEK_CODE,
  },
  {
    id: "js-font-bb",
    name: "黑板粗体字母 (bb<L> 自动大写)",
    group: "字母与字体",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    guards: { wordBoundary: true },
    exampleInput: "bbr",
    code: FONT_BB_CODE,
  },
  {
    id: "js-font-cal",
    name: "花体字母 (cal<L> 自动大写)",
    group: "字母与字体",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    guards: { wordBoundary: true },
    exampleInput: "calf",
    code: FONT_CAL_CODE,
  },
  {
    id: "js-big-op-5mode",
    name: "五模式大型算子 (sm/pd/bu/bn)",
    group: "大型算子与微积分",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    guards: { wordBoundary: true },
    exampleInput: "sm0n",
    code: BIG_OP_5MODE_CODE,
  },
  {
    id: "js-integral",
    name: "参数化积分 (it=/it01/it-+ 等)",
    group: "大型算子与微积分",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    guards: { wordBoundary: true },
    exampleInput: "it01",
    code: INTEGRAL_CODE,
  },
  {
    id: "js-limit",
    name: "参数化极限 (lm=/lmx0/lmx+ 等)",
    group: "大型算子与微积分",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    guards: { wordBoundary: true },
    exampleInput: "lmx0",
    code: LIMIT_CODE,
  },
  {
    id: "js-eval-bar",
    name: "参数化求值竖线 (er|/el| 族)",
    group: "大型算子与微积分",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    guards: { wordBoundary: true },
    exampleInput: "er|01",
    code: EVAL_BAR_CODE,
  },
];

export const DEFAULT_JS_POST_RULES: JsInputRule[] = [
  {
    id: "js-cmd-space",
    name: "命令后防打断自动补空格",
    group: "结构保护",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    guards: {
      excludeInCommand: false,
      excludeInTextMode: true,
      excludeInEnvName: true,
    },
    skipDialect: true,
    exampleInput: "\\sinx",
    preview: "\\sin x",
    code: CMD_AUTO_SPACE_CODE,
  },
];
