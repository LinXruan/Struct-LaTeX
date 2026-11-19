import {
  ALIGN_BREAK_RELATIONS,
  COMMAND_DELIMS,
  SINGLE_CHAR_DELIMS,
} from "./commandTable";

export type TokenKind =
  | "left_delim"
  | "right_delim"
  | "env_begin"
  | "env_end"
  | "brace_open"
  | "brace_close"
  | "bracket_open"
  | "bracket_close"
  | "paren_open"
  | "paren_close"
  | "delim_open"
  | "delim_close"
  | "sym_delim"
  | "script_op"
  | "prime"
  | "align_break"
  | "command"
  | "hspace"
  | "newline"
  | "atom";

export interface Token {
  kind: TokenKind;
  from: number;
  to: number;
  text: string;
  envName?: string;
  pairKey?: string;
}

const SINGLE_CHAR_TOKEN_KINDS: ReadonlyMap<string, TokenKind> = new Map([
  ["{", "brace_open"],
  ["}", "brace_close"],
  ["[", "bracket_open"],
  ["]", "bracket_close"],
  ["(", "paren_open"],
  [")", "paren_close"],
  ["_", "script_op"],
  ["^", "script_op"],
  ["'", "prime"],
]);

const ASYMMETRIC_OPEN: ReadonlyMap<string, string> = new Map([
  ["\\{", "escaped_brace"],
  ["⟨", "angle"],
  ["⌊", "floor"],
  ["⌈", "ceil"],
  ["\\langle", "cmd_angle"],
  ["\\lfloor", "cmd_floor"],
  ["\\lceil", "cmd_ceil"],
]);

const ASYMMETRIC_CLOSE: ReadonlyMap<string, string> = new Map([
  ["\\}", "escaped_brace"],
  ["⟩", "angle"],
  ["⌋", "floor"],
  ["⌉", "ceil"],
  ["\\rangle", "cmd_angle"],
  ["\\rfloor", "cmd_floor"],
  ["\\rceil", "cmd_ceil"],
]);

const SYMMETRIC_DELIM: ReadonlyMap<string, string> = new Map([
  ["\\|", "escaped_bar"],
  ["∥", "unicode_norm"],
]);

function isAsciiLetter(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isHorizontalSpace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function skipHspace(src: string, idx: number): number {
  let i = idx;
  while (i < src.length && isHorizontalSpace(src[i])) i++;
  return i;
}

function readControlSequence(src: string, start: number): { end: number; text: string } {
  const next = start + 1;
  if (next >= src.length) return { end: next, text: "\\" };
  if (isAsciiLetter(src[next])) {
    let i = next + 1;
    while (i < src.length && isAsciiLetter(src[i])) i++;
    return { end: i, text: src.slice(start, i) };
  }
  return { end: next + 1, text: src.slice(start, next + 1) };
}

function tryReadLeftRight(
  src: string,
  cmdStart: number,
  cmdEnd: number,
  cmdText: string
): Token | null {
  if (cmdText !== "\\left" && cmdText !== "\\right") return null;
  const delimStart = skipHspace(src, cmdEnd);
  if (delimStart >= src.length) return null;

  let delimEnd = -1;
  if (src[delimStart] === "\\") {
    const cs = readControlSequence(src, delimStart);
    if (COMMAND_DELIMS.has(cs.text)) delimEnd = cs.end;
  } else if (SINGLE_CHAR_DELIMS.has(src[delimStart])) {
    delimEnd = delimStart + 1;
  }

  if (delimEnd === -1) return null;
  return {
    kind: cmdText === "\\left" ? "left_delim" : "right_delim",
    from: cmdStart,
    to: delimEnd,
    text: src.slice(cmdStart, delimEnd),
  };
}

function tryReadEnv(
  src: string,
  cmdStart: number,
  cmdEnd: number,
  cmdText: string
): Token | null {
  if (cmdText !== "\\begin" && cmdText !== "\\end") return null;
  const openPos = skipHspace(src, cmdEnd);
  if (openPos >= src.length || src[openPos] !== "{") return null;

  let i = openPos + 1;
  while (i < src.length && /[a-zA-Z0-9*]/.test(src[i])) i++;
  if (i === openPos + 1 || i >= src.length || src[i] !== "}") return null;

  return {
    kind: cmdText === "\\begin" ? "env_begin" : "env_end",
    from: cmdStart,
    to: i + 1,
    text: src.slice(cmdStart, i + 1),
    envName: src.slice(openPos + 1, i),
  };
}

function readAlignBreak(src: string, start: number): Token {
  const afterSlash = skipHspace(src, start + 2);
  for (const rel of ALIGN_BREAK_RELATIONS) {
    if (src.startsWith(rel, afterSlash)) {
      const afterRel = skipHspace(src, afterSlash + rel.length);
      if (afterRel < src.length && src[afterRel] === "&") {
        return {
          kind: "align_break",
          from: start,
          to: afterRel + 1,
          text: src.slice(start, afterRel + 1),
        };
      }
    }
  }
  return { kind: "align_break", from: start, to: start + 2, text: "\\\\" };
}

function classifyDelimiter(text: string, from: number, to: number): Token | null {
  const asymOpen = ASYMMETRIC_OPEN.get(text);
  if (asymOpen) return { kind: "delim_open", from, to, text, pairKey: asymOpen };
  const asymClose = ASYMMETRIC_CLOSE.get(text);
  if (asymClose) return { kind: "delim_close", from, to, text, pairKey: asymClose };
  const sym = SYMMETRIC_DELIM.get(text);
  if (sym) return { kind: "sym_delim", from, to, text, pairKey: sym };
  return null;
}

function readBackslashToken(src: string, start: number): Token {
  const cs = readControlSequence(src, start);
  if (cs.text === "\\\\") return readAlignBreak(src, start);
  const lr = tryReadLeftRight(src, start, cs.end, cs.text);
  if (lr) return lr;
  const env = tryReadEnv(src, start, cs.end, cs.text);
  if (env) return env;
  const delim = classifyDelimiter(cs.text, start, cs.end);
  if (delim) return delim;
  return { kind: "command", from: start, to: cs.end, text: cs.text };
}

export function tokenizeMath(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\r" || ch === "\n") {
      const end = ch === "\r" && src[i + 1] === "\n" ? i + 2 : i + 1;
      tokens.push({ kind: "newline", from: i, to: end, text: src.slice(i, end) });
      i = end;
      continue;
    }

    if (isHorizontalSpace(ch)) {
      const end = skipHspace(src, i);
      tokens.push({ kind: "hspace", from: i, to: end, text: src.slice(i, end) });
      i = end;
      continue;
    }

    if (ch === "\\") {
      const tok = readBackslashToken(src, i);
      tokens.push(tok);
      i = tok.to;
      continue;
    }

    const simpleKind = SINGLE_CHAR_TOKEN_KINDS.get(ch);
    if (simpleKind) {
      tokens.push({ kind: simpleKind, from: i, to: i + 1, text: ch });
      i++;
      continue;
    }

    const delim = classifyDelimiter(ch, i, i + 1);
    if (delim) {
      tokens.push(delim);
      i++;
      continue;
    }

    const code = src.codePointAt(i);
    const step = code !== undefined && code > 0xffff ? 2 : 1;
    tokens.push({ kind: "atom", from: i, to: i + step, text: src.slice(i, i + step) });
    i += step;
  }

  return tokens;
}
