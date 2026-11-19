export interface CommandSignature {
  /** Number of mandatory `{...}` slots */
  mandatory: number;
  /** Whether an optional `[...]` slot may precede the mandatory slot(s) */
  optionalBracket?: boolean;
  /** Whether the last mandatory slot is plain text (disables trailing-space merging) */
  textMode?: boolean;
}

export const COMMAND_SIGNATURES: ReadonlyMap<string, CommandSignature> = new Map([
  // Two mandatory linked slots
  ["\\frac", { mandatory: 2 }],
  ["\\dfrac", { mandatory: 2 }],
  ["\\tfrac", { mandatory: 2 }],
  ["\\cfrac", { mandatory: 2 }],
  ["\\binom", { mandatory: 2 }],
  ["\\dbinom", { mandatory: 2 }],
  ["\\tbinom", { mandatory: 2 }],
  ["\\overset", { mandatory: 2 }],
  ["\\underset", { mandatory: 2 }],
  ["\\stackrel", { mandatory: 2 }],
  ["\\textcolor", { mandatory: 2 }],
  ["\\color", { mandatory: 2 }],
  ["\\xrightarrow", { mandatory: 1, optionalBracket: true }],
  ["\\xleftarrow", { mandatory: 1, optionalBracket: true }],
  ["\\xRightarrow", { mandatory: 1, optionalBracket: true }],
  ["\\xLeftarrow", { mandatory: 1, optionalBracket: true }],
  ["\\xleftrightarrow", { mandatory: 1, optionalBracket: true }],
  ["\\sqrt", { mandatory: 1, optionalBracket: true }],

  // Single mandatory slot (math formatting / accents / operators)
  ["\\mathbf", { mandatory: 1 }],
  ["\\mathrm", { mandatory: 1 }],
  ["\\mathcal", { mandatory: 1 }],
  ["\\mathbb", { mandatory: 1 }],
  ["\\mathfrak", { mandatory: 1 }],
  ["\\mathsf", { mandatory: 1 }],
  ["\\mathtt", { mandatory: 1 }],
  ["\\mathit", { mandatory: 1 }],
  ["\\boldsymbol", { mandatory: 1 }],
  ["\\bm", { mandatory: 1 }],
  ["\\operatorname", { mandatory: 1 }],
  ["\\overline", { mandatory: 1 }],
  ["\\underline", { mandatory: 1 }],
  ["\\overbrace", { mandatory: 1 }],
  ["\\underbrace", { mandatory: 1 }],
  ["\\hat", { mandatory: 1 }],
  ["\\widehat", { mandatory: 1 }],
  ["\\tilde", { mandatory: 1 }],
  ["\\widetilde", { mandatory: 1 }],
  ["\\vec", { mandatory: 1 }],
  ["\\bar", { mandatory: 1 }],
  ["\\dot", { mandatory: 1 }],
  ["\\ddot", { mandatory: 1 }],
  ["\\boxed", { mandatory: 1 }],
  ["\\cancel", { mandatory: 1 }],
  ["\\phantom", { mandatory: 1 }],
  ["\\substack", { mandatory: 1 }],

  // Text-mode commands (spaces inside remain ordinary visible text spaces)
  ["\\text", { mandatory: 1, textMode: true }],
  ["\\textrm", { mandatory: 1, textMode: true }],
  ["\\textbf", { mandatory: 1, textMode: true }],
  ["\\textit", { mandatory: 1, textMode: true }],
  ["\\mbox", { mandatory: 1, textMode: true }],
]);

/** Single-char delimiters valid immediately after `\left` or `\right` */
export const SINGLE_CHAR_DELIMS = new Set([
  "(",
  ")",
  "[",
  "]",
  "|",
  ".",
  "/",
  "<",
  ">",
]);

/** Escaped / named command delimiters valid immediately after `\left` or `\right` */
export const COMMAND_DELIMS = new Set([
  "\\{",
  "\\}",
  "\\|",
  "\\backslash",
  "\\Vert",
  "\\vert",
  "\\lvert",
  "\\rvert",
  "\\lVert",
  "\\rVert",
  "\\langle",
  "\\rangle",
  "\\lfloor",
  "\\rfloor",
  "\\lceil",
  "\\rceil",
  "\\uparrow",
  "\\downarrow",
  "\\updownarrow",
  "\\Uparrow",
  "\\Downarrow",
  "\\Updownarrow",
  "\\ulcorner",
  "\\urcorner",
  "\\llcorner",
  "\\lrcorner",
]);

/** Environments that take a mandatory `{...}` header argument immediately after `\begin{env}` */
export const ENV_MANDATORY_HEADER_ARGS = new Set([
  "array",
  "alignat",
  "alignat*",
  "alignedat",
  "flalign",
]);

/** Environments that may take an optional `[t]` / `[b]` / `[c]` header argument */
export const ENV_OPTIONAL_HEADER_ARGS = new Set([
  "aligned",
  "gathered",
  "array",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "cases",
]);

/** Commands that attach as unidirectional postfix modifiers onto the preceding host */
export const POSTFIX_MODIFIER_COMMANDS = new Set([
  "\\limits",
  "\\nolimits",
]);

/** Relation symbols recognized inside composite align line-breaks like `\\ =&` or `\\ ⇔&` */
export const ALIGN_BREAK_RELATIONS = [
  "\\Leftrightarrow",
  "\\Rightarrow",
  "\\Leftarrow",
  "\\approx",
  "⇔",
  "⇒",
  "⇐",
  "≈",
  "=",
];
