import { ALIGN_BREAK_RELATIONS } from "../parser/commandTable";
import { tokenizeMath } from "../parser/tokenizer";
import { OutputDialect } from "./types";

const TEXT_MODE_COMMANDS = new Set(["\\text", "\\textrm", "\\textbf", "\\textit", "\\mbox"]);

const UPPER_BB: Readonly<Record<string, string>> = {
  A: "𝔸", B: "𝔹", C: "ℂ", D: "𝔻", E: "𝔼", F: "𝔽", G: "𝔾",
  H: "ℍ", I: "𝕀", J: "𝕁", K: "𝕂", L: "𝕃", M: "𝕄", N: "ℕ",
  O: "𝕆", P: "ℙ", Q: "ℚ", R: "ℝ", S: "𝕊", T: "𝕋", U: "𝕌",
  V: "𝕍", W: "𝕎", X: "𝕏", Y: "𝕐", Z: "ℤ",
};

const LOWER_BB: Readonly<Record<string, string>> = {
  a: "𝕒", b: "𝕓", c: "𝕔", d: "𝕕", e: "𝕖", f: "𝕗", g: "𝕘",
  h: "𝕙", i: "𝕚", j: "𝕛", k: "𝕜", l: "𝕝", m: "𝕞", n: "𝕟",
  o: "𝕠", p: "𝕡", q: "𝕢", r: "𝕣", s: "𝕤", t: "𝕥", u: "𝕦",
  v: "𝕧", w: "𝕨", x: "𝕩", y: "𝕪", z: "𝕫",
};

const UNICODE_TO_BB_CHAR: ReadonlyMap<string, string> = new Map([
  ...Object.entries(UPPER_BB).map(([k, v]) => [v, k] as const),
  ...Object.entries(LOWER_BB).map(([k, v]) => [v, k] as const),
]);

const LATEX_CMD_TO_UNICODE: ReadonlyMap<string, string> = new Map([
  // Greek letters
  ["\\alpha", "α"], ["\\beta", "β"], ["\\gamma", "γ"], ["\\Gamma", "Γ"],
  ["\\delta", "δ"], ["\\Delta", "Δ"], ["\\varepsilon", "ε"], ["\\epsilon", "ϵ"],
  ["\\zeta", "ζ"], ["\\eta", "η"], ["\\theta", "θ"], ["\\Theta", "Θ"],
  ["\\iota", "ι"], ["\\kappa", "κ"], ["\\lambda", "λ"], ["\\Lambda", "Λ"],
  ["\\mu", "μ"], ["\\nu", "ν"], ["\\xi", "ξ"], ["\\Xi", "Ξ"],
  ["\\pi", "π"], ["\\Pi", "Π"], ["\\rho", "ρ"], ["\\sigma", "σ"],
  ["\\Sigma", "Σ"], ["\\varsigma", "ς"], ["\\tau", "τ"], ["\\upsilon", "υ"],
  ["\\Upsilon", "Υ"], ["\\varphi", "φ"], ["\\Phi", "Φ"], ["\\phi", "ϕ"],
  ["\\chi", "χ"], ["\\psi", "ψ"], ["\\Psi", "Ψ"], ["\\omega", "ω"], ["\\Omega", "Ω"],
  // Big ops & calculus (intentionally excludes \bigcup / \bigcap for crisp MathJax sizing)
  ["\\sum", "∑"], ["\\prod", "∏"], ["\\int", "∫"], ["\\iint", "∬"],
  ["\\iiint", "∭"], ["\\oint", "∮"], ["\\partial", "∂"], ["\\nabla", "∇"],
  ["\\infty", "∞"], ["\\emptyset", "∅"], ["\\varnothing", "∅"], ["\\aleph", "ℵ"],
  // Operators, relations, sets, logic, dots, arrows
  ["\\cap", "∩"], ["\\cup", "∪"], ["\\cdot", "·"], ["\\pm", "±"], ["\\mp", "∓"],
  ["\\times", "×"], ["\\div", "÷"], ["\\circ", "∘"], ["\\oplus", "⊕"], ["\\otimes", "⊗"],
  ["\\angle", "∠"], ["\\parallel", "∥"], ["\\land", "∧"], ["\\lor", "∨"],
  ["\\therefore", "∴"], ["\\because", "∵"], ["\\sim", "∼"], ["\\nsim", "≁"],
  ["\\cong", "≅"], ["\\simeq", "≃"], ["\\approx", "≈"], ["\\ne", "≠"], ["\\neq", "≠"],
  ["\\equiv", "≡"], ["\\triangleq", "≜"], ["\\le", "≤"], ["\\leq", "≤"],
  ["\\ge", "≥"], ["\\geq", "≥"], ["\\subseteq", "⊆"], ["\\supseteq", "⊇"],
  ["\\nsubseteq", "⊈"], ["\\nsupseteq", "⊉"], ["\\perp", "⊥"], ["\\top", "⊤"],
  ["\\in", "∈"], ["\\notin", "∉"], ["\\ni", "∋"], ["\\forall", "∀"],
  ["\\exists", "∃"], ["\\nexists", "∄"], ["\\vdots", "⋮"], ["\\cdots", "⋯"],
  ["\\ddots", "⋱"], ["\\leftarrow", "←"], ["\\to", "→"], ["\\rightarrow", "→"],
  ["\\uparrow", "↑"], ["\\downarrow", "↓"], ["\\leftrightarrow", "↔"],
  ["\\Rightarrow", "⇒"], ["\\implies", "⇒"], ["\\Leftarrow", "⇐"],
  ["\\Leftrightarrow", "⇔"], ["\\iff", "⇔"], ["\\mapsto", "↦"],
  // Standalone delimiters (never applied inside \left / \right tokens)
  ["\\langle", "⟨"], ["\\rangle", "⟩"], ["\\lfloor", "⌊"], ["\\rfloor", "⌋"],
  ["\\lceil", "⌈"], ["\\rceil", "⌉"], ["\\|", "∥"], ["\\Vert", "∥"],
]);

const UNICODE_TO_LATEX_CMD: ReadonlyMap<string, string> = new Map([
  // Greek letters
  ["α", "\\alpha"], ["β", "\\beta"], ["γ", "\\gamma"], ["Γ", "\\Gamma"],
  ["δ", "\\delta"], ["Δ", "\\Delta"], ["ε", "\\varepsilon"], ["ϵ", "\\epsilon"],
  ["ζ", "\\zeta"], ["η", "\\eta"], ["θ", "\\theta"], ["Θ", "\\Theta"],
  ["ι", "\\iota"], ["κ", "\\kappa"], ["λ", "\\lambda"], ["Λ", "\\Lambda"],
  ["μ", "\\mu"], ["ν", "\\nu"], ["ξ", "\\xi"], ["Ξ", "\\Xi"],
  ["π", "\\pi"], ["Π", "\\Pi"], ["ρ", "\\rho"], ["σ", "\\sigma"],
  ["Σ", "\\Sigma"], ["ς", "\\varsigma"], ["τ", "\\tau"], ["υ", "\\upsilon"],
  ["Υ", "\\Upsilon"], ["φ", "\\varphi"], ["Φ", "\\Phi"], ["ϕ", "\\phi"],
  ["χ", "\\chi"], ["ψ", "\\psi"], ["Ψ", "\\Psi"], ["ω", "\\omega"], ["Ω", "\\Omega"],
  // Big ops & calculus
  ["∑", "\\sum"], ["∏", "\\prod"], ["∫", "\\int"], ["∬", "\\iint"],
  ["∭", "\\iiint"], ["∮", "\\oint"], ["∂", "\\partial"], ["∇", "\\nabla"],
  ["∞", "\\infty"], ["∅", "\\emptyset"], ["ℵ", "\\aleph"],
  // Operators, relations, sets, logic, dots, arrows
  ["∩", "\\cap"], ["∪", "\\cup"], ["·", "\\cdot"], ["±", "\\pm"], ["∓", "\\mp"],
  ["×", "\\times"], ["÷", "\\div"], ["∘", "\\circ"], ["⊕", "\\oplus"], ["⊗", "\\otimes"],
  ["∠", "\\angle"], ["∥", "\\|"], ["∧", "\\land"], ["∨", "\\lor"],
  ["∴", "\\therefore"], ["∵", "\\because"], ["∼", "\\sim"], ["≁", "\\nsim"],
  ["≅", "\\cong"], ["≃", "\\simeq"], ["≈", "\\approx"], ["≠", "\\ne"],
  ["≡", "\\equiv"], ["≜", "\\triangleq"], ["≤", "\\le"], ["≥", "\\ge"],
  ["⊆", "\\subseteq"], ["⊇", "\\supseteq"], ["⊈", "\\nsubseteq"], ["⊉", "\\nsupseteq"],
  ["⊥", "\\perp"], ["⊤", "\\top"], ["∈", "\\in"], ["∉", "\\notin"],
  ["∋", "\\ni"], ["∀", "\\forall"], ["∃", "\\exists"], ["∄", "\\nexists"],
  ["⋮", "\\vdots"], ["⋯", "\\cdots"], ["⋱", "\\ddots"],
  ["←", "\\leftarrow"], ["→", "\\to"], ["↑", "\\uparrow"], ["↓", "\\downarrow"],
  ["↔", "\\leftrightarrow"], ["⇒", "\\Rightarrow"], ["⇐", "\\Leftarrow"],
  ["⇔", "\\Leftrightarrow"], ["↦", "\\mapsto"],
  // Standalone delimiters
  ["⟨", "\\langle"], ["⟩", "\\rangle"], ["⌊", "\\lfloor"], ["⌋", "\\rfloor"],
  ["⌈", "\\lceil"], ["⌉", "\\rceil"],
]);

const ALIGN_REL_TO_UNICODE: Readonly<Record<string, string>> = {
  "\\Leftrightarrow": "⇔",
  "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",
  "\\approx": "≈",
};

const ALIGN_REL_TO_LATEX: Readonly<Record<string, string>> = {
  "⇔": "\\Leftrightarrow",
  "⇒": "\\Rightarrow",
  "⇐": "\\Leftarrow",
  "≈": "\\approx",
};

function convertAlignBreak(text: string, dialect: "latex" | "unicode"): string {
  const table = dialect === "unicode" ? ALIGN_REL_TO_UNICODE : ALIGN_REL_TO_LATEX;
  for (const rel of ALIGN_BREAK_RELATIONS) {
    const mapped = table[rel];
    if (mapped && text.includes(rel)) {
      return text.replace(rel, mapped);
    }
  }
  return text;
}

function needsTrailingSpaceAfterCmd(cmd: string, nextSourceChar: string | undefined): boolean {
  if (!nextSourceChar || !/[a-zA-Z]/.test(nextSourceChar)) return false;
  return /^\\[a-zA-Z]+$/.test(cmd);
}

interface EmittedChunk {
  from: number;
  to: number;
  text: string;
}

function buildConvertedChunks(source: string, dialect: "latex" | "unicode"): EmittedChunk[] {
  const tokens = tokenizeMath(source);
  const chunks: EmittedChunk[] = [];
  let textBraceDepth = 0;
  let expectingTextBrace = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (expectingTextBrace) {
      expectingTextBrace = false;
      if (tok.kind === "brace_open") {
        textBraceDepth = 1;
        chunks.push({ from: tok.from, to: tok.to, text: tok.text });
        continue;
      }
    }

    if (textBraceDepth > 0) {
      if (tok.kind === "brace_open") textBraceDepth++;
      else if (tok.kind === "brace_close") textBraceDepth--;
      chunks.push({ from: tok.from, to: tok.to, text: tok.text });
      continue;
    }

    if (tok.kind === "command" && TEXT_MODE_COMMANDS.has(tok.text)) {
      expectingTextBrace = true;
      chunks.push({ from: tok.from, to: tok.to, text: tok.text });
      continue;
    }

    // Never touch \left/\right delimiters or \begin/\end environment headers
    if (
      tok.kind === "left_delim" ||
      tok.kind === "right_delim" ||
      tok.kind === "env_begin" ||
      tok.kind === "env_end"
    ) {
      chunks.push({ from: tok.from, to: tok.to, text: tok.text });
      continue;
    }

    // Fold \mathbb{X} -> blackboard-bold Unicode in unicode mode
    if (
      dialect === "unicode" &&
      tok.kind === "command" &&
      tok.text === "\\mathbb" &&
      i + 3 < tokens.length &&
      tokens[i + 1].kind === "brace_open" &&
      tokens[i + 2].kind === "atom" &&
      tokens[i + 3].kind === "brace_close"
    ) {
      const letter = tokens[i + 2].text;
      const bb = UPPER_BB[letter] ?? LOWER_BB[letter];
      if (bb) {
        chunks.push({ from: tok.from, to: tokens[i + 3].to, text: bb });
        i += 3;
        continue;
      }
    }

    if (tok.kind === "align_break") {
      chunks.push({ from: tok.from, to: tok.to, text: convertAlignBreak(tok.text, dialect) });
      continue;
    }

    if (dialect === "unicode") {
      if (tok.kind === "command" || tok.kind === "delim_open" || tok.kind === "delim_close" || tok.kind === "sym_delim") {
        const mapped = LATEX_CMD_TO_UNICODE.get(tok.text);
        if (mapped) {
          // Consume a single redundant space separating a letter-named command from a letter atom
          const next = tokens[i + 1];
          const afterNext = tokens[i + 2];
          if (
            /^\\[a-zA-Z]+$/.test(tok.text) &&
            next?.kind === "whitespace" &&
            next.text === " " &&
            afterNext &&
            /^[a-zA-Z]/.test(afterNext.text)
          ) {
            chunks.push({ from: tok.from, to: next.to, text: mapped });
            i++;
            continue;
          }
          chunks.push({ from: tok.from, to: tok.to, text: mapped });
          continue;
        }
      }
      chunks.push({ from: tok.from, to: tok.to, text: tok.text });
      continue;
    }

    // dialect === "latex"
    if (tok.kind === "atom") {
      const bbLetter = UNICODE_TO_BB_CHAR.get(tok.text);
      if (bbLetter) {
        chunks.push({ from: tok.from, to: tok.to, text: `\\mathbb{${bbLetter}}` });
        continue;
      }
    }

    if (tok.kind === "atom" || tok.kind === "delim_open" || tok.kind === "delim_close" || tok.kind === "sym_delim") {
      const cmd = UNICODE_TO_LATEX_CMD.get(tok.text);
      if (cmd) {
        const nextChar = source[tok.to];
        const emitted = needsTrailingSpaceAfterCmd(cmd, nextChar) ? `${cmd} ` : cmd;
        chunks.push({ from: tok.from, to: tok.to, text: emitted });
        continue;
      }
    }

    chunks.push({ from: tok.from, to: tok.to, text: tok.text });
  }

  return chunks;
}

/**
 * Converts a math output snippet between `latex`, `unicode`, and `raw` at the token level,
 * accurately remapping `cursorOffset` across UTF-16 length changes (including surrogate pairs).
 */
export function convertOutputDialect(
  insert: string,
  cursorOffset: number,
  dialect: OutputDialect
): { insert: string; cursorOffset: number } {
  const clampedCursor = Math.max(0, Math.min(cursorOffset, insert.length));
  if (dialect === "raw" || insert.length === 0) {
    return { insert, cursorOffset: clampedCursor };
  }

  const chunks = buildConvertedChunks(insert, dialect);
  let out = "";
  let mappedCursor = -1;

  for (const chunk of chunks) {
    if (mappedCursor === -1 && clampedCursor <= chunk.from) {
      mappedCursor = out.length;
    }
    const origSlice = insert.slice(chunk.from, chunk.to);
    if (mappedCursor === -1 && clampedCursor <= chunk.to && chunk.text === origSlice) {
      mappedCursor = out.length + (clampedCursor - chunk.from);
    }
    out += chunk.text;
    if (mappedCursor === -1 && clampedCursor <= chunk.to) {
      mappedCursor = out.length;
    }
  }

  if (mappedCursor === -1) mappedCursor = out.length;
  return { insert: out, cursorOffset: mappedCursor };
}
