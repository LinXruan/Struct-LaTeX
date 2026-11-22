import { InputRule, JsInputRule, TextInputRule } from "./types";

const MATRIX_GROUP = "矩阵类";
const WB = { wordBoundary: true } as const;

function matrixText(
  id: string,
  name: string,
  trigger: string,
  replacement: string
): TextInputRule {
  return {
    id,
    name,
    group: MATRIX_GROUP,
    type: "text",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    trigger,
    replacement,
    guards: WB,
  };
}

function matrixJs(
  id: string,
  name: string,
  exampleInput: string,
  code: string
): JsInputRule {
  return {
    id,
    name,
    group: MATRIX_GROUP,
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    guards: WB,
    exampleInput,
    code,
  };
}

const MATRIX_GRID_CODE = `var envs = {
  b: "bmatrix", p: "pmatrix", v: "vmatrix",
  B: "Bmatrix", V: "Vmatrix", m: "matrix", s: "smallmatrix"
};
var m = /m([bpvBVmsa])([1-9])([1-9])$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
var kind = m[1];
var rows = Number(m[2]);
var cols = Number(m[3]);
var rowList = [];
for (var r = 0; r < rows; r++) {
  var cells = [];
  for (var c = 0; c < cols; c++) {
    cells.push(r === 0 && c === 0 ? "$0" : "");
  }
  rowList.push(cells.join(" & "));
}
var tpl;
if (kind === "s") {
  tpl = "\\\\begin{smallmatrix} " + rowList.join(" \\\\\\\\ ") + " \\\\end{smallmatrix}";
} else if (kind === "a") {
  var spec = cols <= 1 ? "c" : new Array(cols).join("c") + "|c";
  tpl = "\\\\left[\\\\begin{array}{" + spec + "}\\n  " + rowList.join(" \\\\\\\\\\n  ") + "\\n\\\\end{array}\\\\right]";
} else {
  var env = envs[kind];
  tpl = "\\\\begin{" + env + "}\\n  " + rowList.join(" \\\\\\\\\\n  ") + "\\n\\\\end{" + env + "}";
}
return Object.assign({ replaceLength: m[0].length }, ctx.helpers.expandTemplate(tpl));`;

const MATRIX_IDENTITY_CODE = `var m = /eye([2-6]|n)$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
if (m[1] === "n") {
  return {
    replaceLength: m[0].length,
    insert: "\\\\begin{bmatrix}\\n  1 & 0 & \\\\cdots & 0 \\\\\\\\\\n  0 & 1 & \\\\cdots & 0 \\\\\\\\\\n  \\\\vdots & \\\\vdots & \\\\ddots & \\\\vdots \\\\\\\\\\n  0 & 0 & \\\\cdots & 1\\n\\\\end{bmatrix}"
  };
}
var n = Number(m[1]);
var rows = [];
for (var r = 0; r < n; r++) {
  var row = [];
  for (var c = 0; c < n; c++) row.push(r === c ? "1" : "0");
  rows.push("  " + row.join(" & "));
}
return {
  replaceLength: m[0].length,
  insert: "\\\\begin{bmatrix}\\n" + rows.join(" \\\\\\\\\\n") + "\\n\\\\end{bmatrix}"
};`;

const MATRIX_SYMBOLIC_CODE = `var m = /ju([pv]?)<([^<>\\n]+)>$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
var parts = m[2].split(",");
var s = parts[0].trim();
if (!s) return null;
var rn = (parts[1] || "n").trim() || "n";
var cn = parts.length >= 3 ? ((parts[2] || "n").trim() || "n") : rn;
var env = m[1] === "p" ? "pmatrix" : m[1] === "v" ? "vmatrix" : "bmatrix";
var body = [
  "  " + s + "_{11} & " + s + "_{12} & \\\\cdots & " + s + "_{1" + cn + "}",
  "  " + s + "_{21} & " + s + "_{22} & \\\\cdots & " + s + "_{2" + cn + "}",
  "  \\\\vdots & \\\\vdots & \\\\ddots & \\\\vdots",
  "  " + s + "_{" + rn + "1} & " + s + "_{" + rn + "2} & \\\\cdots & " + s + "_{" + rn + cn + "}"
].join(" \\\\\\\\\\n");
return {
  replaceLength: m[0].length,
  insert: "\\\\begin{" + env + "}\\n" + body + "\\n\\\\end{" + env + "}"
};`;

const MATRIX_VECTOR_CODE = `var m = /(vx|cx)(p?)<([^<>\\n]+)>$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
var parts = m[3].split(",");
var s = parts[0].trim();
if (!s) return null;
var n = (parts[1] || "n").trim() || "n";
var env = m[2] === "p" ? "pmatrix" : "bmatrix";
if (m[1] === "cx") {
  return {
    replaceLength: m[0].length,
    insert: "\\\\begin{" + env + "} " + s + "_{1} & " + s + "_{2} & \\\\cdots & " + s + "_{" + n + "} \\\\end{" + env + "}"
  };
}
var body = [
  "  " + s + "_{1}",
  "  " + s + "_{2}",
  "  \\\\vdots",
  "  " + s + "_{" + n + "}"
].join(" \\\\\\\\\\n");
return {
  replaceLength: m[0].length,
  insert: "\\\\begin{" + env + "}\\n" + body + "\\n\\\\end{" + env + "}"
};`;

const MATRIX_DIAG_CODE = `var m = /diag(p?)<([^<>\\n]+)>$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
var parts = m[2].split(",");
var s = parts[0].trim();
if (!s) return null;
var n = (parts[1] || "n").trim() || "n";
var env = m[1] === "p" ? "pmatrix" : "bmatrix";
var body = [
  "  " + s + "_{1} & 0 & \\\\cdots & 0",
  "  0 & " + s + "_{2} & \\\\cdots & 0",
  "  \\\\vdots & \\\\vdots & \\\\ddots & \\\\vdots",
  "  0 & 0 & \\\\cdots & " + s + "_{" + n + "}"
].join(" \\\\\\\\\\n");
return {
  replaceLength: m[0].length,
  insert: "\\\\begin{" + env + "}\\n" + body + "\\n\\\\end{" + env + "}"
};`;

const DET_VANDERMONDE_CODE = `var m = /vdm<([^<>\\n]+)>$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
var parts = m[1].split(",");
var s = parts[0].trim();
if (!s) return null;
var n = (parts[1] || "n").trim() || "n";
var body = [
  "  1 & 1 & \\\\cdots & 1",
  "  " + s + "_{1} & " + s + "_{2} & \\\\cdots & " + s + "_{" + n + "}",
  "  " + s + "_{1}^{2} & " + s + "_{2}^{2} & \\\\cdots & " + s + "_{" + n + "}^{2}",
  "  \\\\vdots & \\\\vdots & \\\\ddots & \\\\vdots",
  "  " + s + "_{1}^{" + n + "-1} & " + s + "_{2}^{" + n + "-1} & \\\\cdots & " + s + "_{" + n + "}^{" + n + "-1}"
].join(" \\\\\\\\\\n");
return {
  replaceLength: m[0].length,
  insert: "\\\\begin{vmatrix}\\n" + body + "\\n\\\\end{vmatrix}"
};`;

const MATRIX_JACOBIAN_CODE = `var m = /jac(v?)<([^<>\\n]+)>$/.exec(ctx.text);
if (!m) return null;
if (m.index > 0 && /[a-zA-Z]/.test(ctx.text[m.index - 1])) return null;
var parts = m[2].split(",");
var y = parts[0].trim();
if (!y) return null;
var x = parts.length >= 2 ? ((parts[1] || "x").trim() || "x") : "x";
var rn = parts.length >= 3 ? ((parts[2] || "m").trim() || "m") : "m";
var cn = parts.length >= 4 ? ((parts[3] || "n").trim() || "n") : "n";
var env = m[1] === "v" ? "vmatrix" : "bmatrix";
function pd(i, j) {
  return "\\\\frac{\\\\partial " + y + "_{" + i + "}}{\\\\partial " + x + "_{" + j + "}}";
}
var body = [
  "  " + pd("1", "1") + " & \\\\cdots & " + pd("1", cn),
  "  \\\\vdots & \\\\ddots & \\\\vdots",
  "  " + pd(rn, "1") + " & \\\\cdots & " + pd(rn, cn)
].join(" \\\\\\\\\\n");
return {
  replaceLength: m[0].length,
  insert: "\\\\begin{" + env + "}\\n" + body + "\\n\\\\end{" + env + "}"
};`;

export const MATRIX_RULES: InputRule[] = [
  // Parameterized matrix & determinant generators
  matrixJs("js-matrix-grid", "指定维数矩阵与行列式 (mb23/mv33/ma34 等)", "mb22", MATRIX_GRID_CODE),
  matrixJs("js-matrix-identity", "单位矩阵 (eye2~eye6 / eyen)", "eye3", MATRIX_IDENTITY_CODE),
  matrixJs("js-matrix-symbolic", "符号矩阵与行列式 (ju<a>/jup<a>/juv<a>)", "ju<a>", MATRIX_SYMBOLIC_CODE),
  matrixJs("js-matrix-vector", "符号列向量与行向量 (vx<x>/cx<x>)", "vx<x>", MATRIX_VECTOR_CODE),
  matrixJs("js-matrix-diag", "符号对角矩阵 (diag<a>/diagp<a>)", "diag<\\lambda>", MATRIX_DIAG_CODE),
  matrixJs("js-det-vandermonde", "范德蒙德行列式 (vdm<x>)", "vdm<x>", DET_VANDERMONDE_CODE),
  matrixJs("js-matrix-jacobian", "雅可比矩阵与行列式 (jac<y,x>/jacv<y,x>)", "jac<y,x>", MATRIX_JACOBIAN_CODE),

  // Empty matrix & determinant environment shells
  matrixText("env-bmatrix", "方括号矩阵环境", "matb", "\\begin{bmatrix}\n$0\n\\end{bmatrix}"),
  matrixText("env-pmatrix", "圆括号矩阵环境", "matp", "\\begin{pmatrix}\n$0\n\\end{pmatrix}"),
  matrixText("env-vmatrix", "行列式环境", "matv", "\\begin{vmatrix}\n$0\n\\end{vmatrix}"),
  matrixText("env-Bmatrix", "花括号矩阵环境", "matB", "\\begin{Bmatrix}\n$0\n\\end{Bmatrix}"),
  matrixText("env-Vmatrix", "双竖线范数矩阵环境", "matV", "\\begin{Vmatrix}\n$0\n\\end{Vmatrix}"),
  matrixText("env-matrix", "无括号矩阵环境", "matm", "\\begin{matrix}\n$0\n\\end{matrix}"),
  matrixText("env-smallmatrix", "行内小矩阵环境", "mats", "\\begin{smallmatrix}$0\\end{smallmatrix}"),
  matrixText("env-augmatrix", "增广矩阵环境", "mata", "\\left[\\begin{array}{c|c}\n  $0 & \n\\end{array}\\right]"),
  matrixText(
    "mat-diag-shell",
    "对角矩阵骨架",
    "dmat",
    "\\begin{bmatrix}\n  $0 &  &  \\\\\n   & \\ddots &  \\\\\n   &  & \n\\end{bmatrix}"
  ),
];
