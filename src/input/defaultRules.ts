import { Locale } from "../i18n/types";
import { DEFAULT_JS_POST_RULES, DEFAULT_JS_PRE_RULES } from "./defaultJsRules";
import { localizeDefaultRule } from "./defaultRuleLabels";
import { GREEK_TEXT_RULES, SYMBOL_AND_ENV_TEXT_RULES } from "./defaultSymbolRules";
import { InputRule, RegexInputRule, RulesFileData, TextInputRule } from "./types";

const WB = { wordBoundary: true } as const;

function mathText(
  id: string,
  group: string,
  name: string,
  trigger: string,
  replacement: string,
  guards?: TextInputRule["guards"]
): TextInputRule {
  return {
    id,
    name,
    group,
    type: "text",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    trigger,
    replacement,
    guards,
  };
}

function mathRegex(
  id: string,
  group: string,
  name: string,
  trigger: string,
  replacement: string,
  exampleInput: string,
  guards?: RegexInputRule["guards"]
): RegexInputRule {
  return {
    id,
    name,
    group,
    type: "regex",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    trigger,
    replacement,
    exampleInput,
    guards,
  };
}

const REGEX_CHAIN_ARROW_RULES: RegexInputRule[] = [
  mathRegex(
    "rx-chain-leftrightarrow",
    "箭头",
    "链式双向箭头 (<->)",
    "(?:\\\\leftarrow|←)>",
    "\\leftrightarrow",
    "\\leftarrow>",
    { excludeInCommand: false }
  ),
  mathRegex(
    "rx-chain-iff",
    "箭头",
    "链式双向等价 (<=>)",
    "(?:\\\\le|≤)>",
    "\\Leftrightarrow",
    "\\le>",
    { excludeInCommand: false }
  ),
  mathRegex(
    "rx-chain-Leftarrow",
    "箭头",
    "链式左推出 (<==)",
    "(?:\\\\le|≤)=",
    "\\Leftarrow",
    "\\le=",
    { excludeInCommand: false }
  ),
];

const REGEX_PARAM_RULES: RegexInputRule[] = [
  mathRegex("rx-bf", "字母与字体", "单字母粗直体", "bf([a-zA-Z])", "\\mathbf{$1}", "bfx", WB),
  mathRegex("rx-bm", "字母与字体", "单字母粗斜体", "bm([a-zA-Z])", "\\boldsymbol{$1}", "bmx", WB),
  mathRegex("rx-rm", "字母与字体", "单字母正体", "rm([a-zA-Z])", "\\mathrm{$1}", "rmd", WB),
  mathRegex("rx-deriv-1", "大型算子与微积分", "一阶导数算子", "dd([a-zA-Z])", "\\frac{\\mathrm{d}}{\\mathrm{d}$1}", "ddx", WB),
  mathRegex(
    "rx-deriv-n",
    "大型算子与微积分",
    "高阶导数算子",
    "dd([0-9])([a-zA-Z])",
    "\\frac{\\mathrm{d}^{$1}}{\\mathrm{d}$2^{$1}}",
    "dd2x",
    WB
  ),
  mathRegex("rx-pderiv-1", "大型算子与微积分", "一阶偏导算子", "pp([a-zA-Z])", "\\frac{\\partial}{\\partial $1}", "ppx", WB),
  mathRegex(
    "rx-pderiv-n",
    "大型算子与微积分",
    "高阶偏导算子",
    "pp([0-9])([a-zA-Z])",
    "\\frac{\\partial^{$1}}{\\partial $2^{$1}}",
    "pp2x",
    WB
  ),
  mathRegex("rx-norm-auto", "定界符", "带下标伸缩范数", "lv([a-zA-Z0-9])", "\\left\\Vert $0 \\right\\Vert_{$1}", "lv2", WB),
  mathRegex("rx-norm-plain", "定界符", "带下标普通范数", "nv([a-zA-Z0-9])", "\\| $0 \\|_{$1}", "nvp", WB),
  mathRegex("rx-fast-sup", "分式与上下标", "快捷单字上标", "pw([a-zA-Z0-9])", "^{$1}", "pw2"),
  mathRegex("rx-fast-sub", "分式与上下标", "快捷单字下标", "sb([a-zA-Z0-9])", "_{$1}", "sbk"),
  mathRegex(
    "rx-op-std",
    "数学函数",
    "标准内置数学算子",
    "(dim|deg|gcd|ker|det|max|min|sup|inf)",
    "\\$1",
    "det",
    WB
  ),
  mathRegex(
    "rx-op-name",
    "数学函数",
    "文本型数学算子",
    "(rank|Im|adj|span|card)",
    "\\operatorname{$1}",
    "rank",
    WB
  ),
];

const CORE_STRUCTURE_TEXT_RULES: TextInputRule[] = [
  // Empty font/decoration wrappers
  mathText("wrap-mbf", "字母与字体", "粗直体容器", "mbf", "\\mathbf{$0}", WB),
  mathText("wrap-mrm", "字母与字体", "正体容器", "mrm", "\\mathrm{$0}", WB),
  mathText("wrap-mbm", "字母与字体", "粗斜体容器", "mbm", "\\boldsymbol{$0}", WB),
  mathText("wrap-mcal", "字母与字体", "花体容器", "mcal", "\\mathcal{$0}", WB),
  mathText("wrap-mbb", "字母与字体", "黑板粗体容器", "mbb", "\\mathbb{$0}", WB),
  mathText("wrap-bar", "字母与字体", "上划线", "bar", "\\overline{$0}", WB),
  mathText("wrap-hat", "字母与字体", "尖帽", "hat", "\\hat{$0}", WB),
  mathText("wrap-vec", "字母与字体", "向量箭头", "vec", "\\vec{$0}", WB),

  // Auto-sizing \left...\right delimiters
  mathText("delim-lr-paren", "定界符", "伸缩圆括号", "lr(", "\\left($0\\right)"),
  mathText("delim-lr-bracket", "定界符", "伸缩方括号", "lr[", "\\left[$0\\right]"),
  mathText("delim-lr-brace", "定界符", "伸缩花括号", "lr{", "\\left\\{$0\\right\\}"),
  mathText("delim-lr-bar", "定界符", "伸缩绝对值", "lr|", "\\left|$0\\right|"),
  mathText("delim-lr-angle", "定界符", "伸缩尖括号", "lra", "\\left\\langle$0\\right\\rangle", WB),
  mathText("delim-lr-floor", "定界符", "伸缩下取整", "lrf", "\\left\\lfloor$0\\right\\rfloor", WB),
  mathText("delim-lr-ceil", "定界符", "伸缩上取整", "lrc", "\\left\\lceil$0\\right\\rceil", WB),
  mathText("delim-lr-norm", "定界符", "伸缩双竖线范数", "lrv", "\\left\\Vert$0\\right\\Vert", WB),
  mathText("delim-half-lbr", "定界符", "左闭右开伸缩区间", "l[)", "\\left[$0\\right)"),
  mathText("delim-half-lpr", "定界符", "左开右闭伸缩区间", "l(]", "\\left($0\\right]"),

  // Plain paired delimiters
  mathText("delim-paren", "定界符", "普通圆括号", ";(", "($0)"),
  mathText("delim-bracket", "定界符", "普通方括号", ";[", "[$0]"),
  mathText("delim-brace", "定界符", "转义花括号", ";{", "\\{$0\\}"),
  mathText("delim-bar", "定界符", "绝对值竖线", ";|", "|$0|"),
  mathText("delim-angle", "定界符", "尖括号", ";<", "\\langle $0 \\rangle"),
  mathText("delim-floor", "定界符", "下取整", "flr", "\\lfloor $0 \\rfloor", WB),
  mathText("delim-ceil", "定界符", "上取整", "cel", "\\lceil $0 \\rceil", WB),
  mathText("delim-norm", "定界符", "普通范数", "nrm", "\\| $0 \\|", WB),

  // Fractions, roots & scripts
  mathText("frac-slash", "分式与上下标", "分式", "/", "\\frac{$0}{}"),
  mathText("root-n", "分式与上下标", "n 次根式", "nsq", "\\sqrt[$0]{}", WB),
  mathText("root-2", "分式与上下标", "平方根", "sq", "\\sqrt{$0}", WB),
  mathText("script-sup", "分式与上下标", "上标槽位", "^", "^{$0}"),
  mathText("script-sub", "分式与上下标", "下标槽位", "_", "_{$0}"),
  mathText("script-inv", "分式与上下标", "逆/倒数幂", "inv", "^{-1}", WB),

  // Trig / log / inverse trig (`arcsin` etc. listed before `sin` etc.)
  mathText("fn-arcsin", "数学函数", "arcsin", "arcsin", "\\arcsin", WB),
  mathText("fn-arccos", "数学函数", "arccos", "arccos", "\\arccos", WB),
  mathText("fn-arctan", "数学函数", "arctan", "arctan", "\\arctan", WB),
  mathText("fn-sin", "数学函数", "sin", "sin", "\\sin", WB),
  mathText("fn-cos", "数学函数", "cos", "cos", "\\cos", WB),
  mathText("fn-tan", "数学函数", "tan", "tan", "\\tan", WB),
  mathText("fn-cot", "数学函数", "cot", "cot", "\\cot", WB),
  mathText("fn-sec", "数学函数", "sec", "sec", "\\sec", WB),
  mathText("fn-csc", "数学函数", "csc", "csc", "\\csc", WB),
  mathText("fn-ln", "数学函数", "ln", "ln", "\\ln", WB),
  mathText("fn-log", "数学函数", "log", "log", "\\log", WB),
  mathText("fn-exp", "数学函数", "exp", "exp", "\\exp", WB),
  mathText("fn-mod", "数学函数", "bmod", "mod", "\\bmod", WB),
  mathText("fn-id", "数学函数", "单位映射 id", "ide", "\\mathrm{id}", WB),
];

export function createDefaultRules(locale: Locale = "zh"): InputRule[] {
  return [
    ...DEFAULT_JS_PRE_RULES,
    ...REGEX_CHAIN_ARROW_RULES,
    ...GREEK_TEXT_RULES,
    ...CORE_STRUCTURE_TEXT_RULES,
    ...SYMBOL_AND_ENV_TEXT_RULES,
    ...REGEX_PARAM_RULES,
    ...DEFAULT_JS_POST_RULES,
  ].map((r) => localizeDefaultRule(r, locale));
}

export function createDefaultRulesFile(locale: Locale = "zh"): RulesFileData {
  return {
    version: 1,
    rules: createDefaultRules(locale),
  };
}
