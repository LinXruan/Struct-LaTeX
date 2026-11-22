import { TextInputRule } from "./types";

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

const GREEK_ENTRIES: ReadonlyArray<readonly [string, string, string]> = [
  ["alpha", ";a", "\\alpha"], ["beta", ";b", "\\beta"],
  ["gamma", ";g", "\\gamma"], ["Gamma", ";G", "\\Gamma"],
  ["delta", ";d", "\\delta"], ["Delta", ";D", "\\Delta"],
  ["varepsilon", ";e", "\\varepsilon"], ["epsilon", ";E", "\\epsilon"],
  ["zeta", ";z", "\\zeta"], ["eta", ";h", "\\eta"],
  ["theta", ";q", "\\theta"], ["Theta", ";Q", "\\Theta"],
  ["iota", ";i", "\\iota"], ["kappa", ";k", "\\kappa"],
  ["lambda", ";l", "\\lambda"], ["Lambda", ";L", "\\Lambda"],
  ["mu", ";m", "\\mu"], ["nu", ";n", "\\nu"],
  ["xi", ";x", "\\xi"], ["Xi", ";X", "\\Xi"],
  ["pi", ";p", "\\pi"], ["Pi", ";P", "\\Pi"],
  ["rho", ";r", "\\rho"], ["sigma", ";s", "\\sigma"],
  ["Sigma", ";S", "\\Sigma"], ["varsigma", ";v", "\\varsigma"],
  ["tau", ";t", "\\tau"], ["upsilon", ";u", "\\upsilon"],
  ["Upsilon", ";U", "\\Upsilon"], ["varphi", ";f", "\\varphi"],
  ["Phi", ";F", "\\Phi"], ["phi", ";j", "\\phi"],
  ["chi", ";c", "\\chi"], ["psi", ";y", "\\psi"],
  ["Psi", ";Y", "\\Psi"], ["omega", ";w", "\\omega"],
  ["Omega", ";W", "\\Omega"],
];

export const GREEK_TEXT_RULES: TextInputRule[] = [
  ...GREEK_ENTRIES.map(([label, trigger, cmd]) =>
    mathText(`greek-${label}`, "希腊字母", label, trigger, cmd)
  ),
  mathText("greek-pi-word", "希腊字母", "pi", "pi", "\\pi", { wordBoundary: true }),
];

const WB = { wordBoundary: true } as const;

export const SYMBOL_AND_ENV_TEXT_RULES: TextInputRule[] = [
  // Isolated big operators (longest suffix first)
  mathText("op-iiint", "符号与算子", "三重积分", "iiint", "\\iiint", WB),
  mathText("op-iint", "符号与算子", "二重积分", "iint", "\\iint", WB),
  mathText("op-oint", "符号与算子", "环路积分", "oint", "\\oint", WB),
  mathText("op-int", "符号与算子", "积分", "int", "\\int", WB),
  mathText("op-sum", "符号与算子", "求和", "sum", "\\sum", WB),
  mathText("op-prod", "符号与算子", "求积", "prod", "\\prod", WB),
  mathText("op-bcup", "符号与算子", "大并集", "bcup", "\\bigcup", WB),
  mathText("op-bcap", "符号与算子", "大交集", "bcap", "\\bigcap", WB),
  mathText("op-lim", "符号与算子", "极限", "lim", "\\lim", WB),
  mathText("op-cup", "符号与算子", "并集", "cup", "\\cup", WB),
  mathText("op-cap", "符号与算子", "交集", "cap", "\\cap", WB),

  // Arithmetic, calculus constants & misc symbols
  mathText("sym-pm", "符号与算子", "正负号", "+-", "\\pm"),
  mathText("sym-mp", "符号与算子", "负正号", "-+", "\\mp"),
  mathText("sym-cdot", "符号与算子", "点乘", "**", "\\cdot"),
  mathText("sym-times", "符号与算子", "叉乘", "xx", "\\times", WB),
  mathText("sym-div", "符号与算子", "除号", "div", "\\div", WB),
  mathText("sym-oplus", "符号与算子", "直和", "o+", "\\oplus", WB),
  mathText("sym-otimes", "符号与算子", "张量积", "ox", "\\otimes", WB),
  mathText("sym-circ", "符号与算子", "复合", "o.", "\\circ", WB),
  mathText("sym-infty", "符号与算子", "无穷", "oo", "\\infty", WB),
  mathText("sym-partial", "符号与算子", "偏导符号", "part", "\\partial", WB),
  mathText("sym-nabla", "符号与算子", "梯度算子", "nabl", "\\nabla", WB),
  mathText("sym-emptyset", "符号与算子", "空集", "emp", "\\emptyset", WB),
  mathText("sym-aleph", "符号与算子", "阿列夫", "ale", "\\aleph", WB),
  mathText("sym-angle", "符号与算子", "角", "ang", "\\angle", WB),
  mathText("sym-parallel", "符号与算子", "平行", "para", "\\parallel", WB),

  // Relations & sets
  mathText("rel-ne", "关系与逻辑", "不等于", "!=", "\\ne"),
  mathText("rel-le", "关系与逻辑", "小于等于", "<=", "\\le"),
  mathText("rel-ge", "关系与逻辑", "大于等于", ">=", "\\ge"),
  mathText("rel-approx", "关系与逻辑", "约等于", "~=", "\\approx"),
  mathText("rel-sim", "关系与逻辑", "相似", "~~", "\\sim"),
  mathText("rel-cong", "关系与逻辑", "全等", "=~", "\\cong"),
  mathText("rel-simeq", "关系与逻辑", "渐近相等", "-~", "\\simeq"),
  mathText("rel-nsim", "关系与逻辑", "不相似", "!~", "\\nsim"),
  mathText("rel-equiv", "关系与逻辑", "恒等", "===", "\\equiv"),
  mathText("rel-triangleq", "关系与逻辑", "定义为", ":=", "\\triangleq"),
  mathText("rel-in", "关系与逻辑", "属于", "inn", "\\in", WB),
  mathText("rel-notin", "关系与逻辑", "不属于", "nin", "\\notin", WB),
  mathText("rel-ni", "关系与逻辑", "包含元素", "nii", "\\ni", WB),
  mathText("rel-nsse", "关系与逻辑", "非子集", "nsse", "\\nsubseteq", WB),
  mathText("rel-sse", "关系与逻辑", "子集", "sse", "\\subseteq", WB),
  mathText("rel-nspe", "关系与逻辑", "非超集", "nspe", "\\nsupseteq", WB),
  mathText("rel-spe", "关系与逻辑", "超集", "spe", "\\supseteq", WB),
  mathText("rel-perp", "关系与逻辑", "垂直", "perp", "\\perp", WB),
  mathText("rel-top", "关系与逻辑", "永真/转置", "top", "\\top", WB),

  // Logic & quantifiers
  mathText("log-and", "关系与逻辑", "逻辑与", "land", "\\land", WB),
  mathText("log-or", "关系与逻辑", "逻辑或", "lor", "\\lor", WB),
  mathText("log-therefore", "关系与逻辑", "所以", "thf", "\\therefore", WB),
  mathText("log-because", "关系与逻辑", "因为", "bec", "\\because", WB),
  mathText("log-forall", "关系与逻辑", "全称量词", "AA", "\\forall", WB),
  mathText("log-nexists", "关系与逻辑", "不存在", "nEE", "\\nexists", WB),
  mathText("log-exists", "关系与逻辑", "存在量词", "EE", "\\exists", WB),

  // Dots (directional prefixes placed strictly before `...`)
  mathText("dots-vdots", "符号与算子", "竖省略号", "v...", "\\vdots"),
  mathText("dots-ddots", "符号与算子", "右下斜省略号", "d...", "\\ddots"),
  mathText("dots-udots", "符号与算子", "右上斜省略号", "u...", "⋰"),
  mathText("dots-cdots", "符号与算子", "横省略号", "...", "\\cdots"),

  // Arrows (`|->` before `->`)
  mathText("arr-mapsto", "箭头", "映射", "|->", "\\mapsto"),
  mathText("arr-to", "箭头", "右箭头", "->", "\\to"),
  mathText("arr-leftarrow", "箭头", "左箭头", "<-", "\\leftarrow"),
  mathText("arr-Rightarrow", "箭头", "推出", "=>", "\\Rightarrow"),
  mathText("arr-up", "箭头", "上箭头", "uarr", "\\uparrow", WB),
  mathText("arr-down", "箭头", "下箭头", "darr", "\\downarrow", WB),

  // Multiline environments (empty shell only, no matrix fill templates)
  mathText("env-cases", "多行环境与对齐", "分段函数 cases", "cases", "\\begin{cases}\n$0\n\\end{cases}", WB),
  mathText("env-align", "多行环境与对齐", "对齐环境 align", "align", "\\begin{align}\n$0\n\\end{align}", WB),
  mathText("env-bmatrix", "多行环境与对齐", "方括号矩阵环境", "matb", "\\begin{bmatrix}\n$0\n\\end{bmatrix}", WB),
  mathText("env-vmatrix", "多行环境与对齐", "行列式环境", "matv", "\\begin{vmatrix}\n$0\n\\end{vmatrix}", WB),
  mathText("env-pmatrix", "多行环境与对齐", "圆括号矩阵环境", "matp", "\\begin{pmatrix}\n$0\n\\end{pmatrix}", WB),

  // Composite align line breaks (`excludeInCommand: false` since `\\` is not a `\cmd`)
  mathText("brk-eq", "多行环境与对齐", "换行等号对齐", "\\\\=", "\\\\ =& ", { excludeInCommand: false }),
  mathText("brk-approx", "多行环境与对齐", "换行约等对齐", "\\\\~", "\\\\ \\approx& ", { excludeInCommand: false }),
  mathText("brk-implies", "多行环境与对齐", "换行推出对齐", "\\\\>", "\\\\ \\Rightarrow& ", { excludeInCommand: false }),
  mathText("brk-impliedby", "多行环境与对齐", "换行被推出对齐", "\\\\<", "\\\\ \\Leftarrow& ", { excludeInCommand: false }),
  mathText("brk-iff", "多行环境与对齐", "换行等价对齐", "\\\\e", "\\\\ \\Leftrightarrow& ", { excludeInCommand: false }),
];
