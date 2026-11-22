import { COMMAND_SIGNATURES } from "./commandTable";
import { resolveEnvHeaderEndIdx, skipWhitespaceTokens } from "./objectFactory";
import { Token } from "./tokenizer";
import { MathParseOptions, TextSpan } from "./types";

interface StrongFrame {
  openIdx: number;
  kind: "root" | "env" | "left" | "brace";
  envName?: string;
  weakStack: WeakEntry[];
}

interface WeakEntry {
  openIdx: number;
  family: "paren_bracket" | "delim" | "sym";
  pairKey?: string;
}

export interface DelimiterMatchResult {
  matches: Map<number, number>;
  oddBarSpans: TextSpan[];
}

const AMBIGUOUS_BAR_KEYS = new Set(["pipe", "unicode_norm"]);

function resolvePass2AmbiguousBars(
  tokens: readonly Token[],
  source: string,
  matches: Map<number, number>
): TextSpan[] {
  const oddBarSpans: TextSpan[] = [];

  const applyEvenOrRecordOdd = (indices: readonly number[]): void => {
    if (indices.length === 0) return;
    if (indices.length % 2 === 1) {
      for (const idx of indices) {
        oddBarSpans.push({ from: tokens[idx].from, to: tokens[idx].to });
      }
      return;
    }
    for (let k = 0; k < indices.length; k += 2) {
      matches.set(indices[k], indices[k + 1]);
    }
  };

  const scanLevel = (startIdx: number, endIdx: number): void => {
    const pipeIndices: number[] = [];
    const normIndices: number[] = [];
    let i = startIdx;

    while (i < endIdx) {
      const tok = tokens[i];
      const matchedClose = matches.get(i);

      if (matchedClose !== undefined && matchedClose < endIdx) {
        const innerStart =
          tok.kind === "env_begin"
            ? resolveEnvHeaderEndIdx(source, tokens, matches, i, matchedClose)
            : i + 1;
        scanLevel(innerStart, matchedClose);
        i = matchedClose + 1;
        continue;
      }

      if (tok.kind === "env_begin") {
        // Even for an unclosed env like `\begin{array}{c|c}...`, skip its header `{c|c}`
        i = resolveEnvHeaderEndIdx(source, tokens, matches, i, endIdx);
        continue;
      }

      if (tok.kind === "command" && COMMAND_SIGNATURES.get(tok.text)?.textMode) {
        const braceIdx = skipWhitespaceTokens(tokens, i + 1, endIdx);
        const braceClose = matches.get(braceIdx);
        if (
          braceIdx < endIdx &&
          tokens[braceIdx].kind === "brace_open" &&
          braceClose !== undefined &&
          braceClose < endIdx
        ) {
          i = braceClose + 1;
          continue;
        }
      }

      if (tok.kind === "sym_delim") {
        if (tok.pairKey === "pipe") pipeIndices.push(i);
        else if (tok.pairKey === "unicode_norm") normIndices.push(i);
      }

      i++;
    }

    applyEvenOrRecordOdd(pipeIndices);
    applyEvenOrRecordOdd(normIndices);
  };

  scanLevel(0, tokens.length);
  oddBarSpans.sort((a, b) => a.from - b.from);
  return oddBarSpans;
}

/**
 * Computes matching delimiter pairs (`openTokenIndex -> closeTokenIndex`) in O(N).
 * - Strong scopes (`\begin...\end`, `\left...\right`, `{...}`) isolate weak delimiters.
 * - Mixed `(...)` / `[...]` / `[...)` / `(...]` are allowed within the same strong scope.
 * - When `parseAmbiguousBars` is enabled, Pass 2 evaluates `|` and `∥` per closed bracket level:
 *   even occurrences pair sequentially without nesting, while odd occurrences stay plain atoms
 *   and are returned in `oddBarSpans`.
 */
export function matchDelimiters(
  tokens: readonly Token[],
  source: string,
  options?: MathParseOptions
): DelimiterMatchResult {
  const parseAmbiguousBars = options?.parseAmbiguousBars ?? true;
  const matches = new Map<number, number>();
  const strongStack: StrongFrame[] = [{ openIdx: -1, kind: "root", weakStack: [] }];

  const topFrame = (): StrongFrame => strongStack[strongStack.length - 1];

  const closeStrong = (
    closeIdx: number,
    expectedKind: "env" | "left" | "brace",
    envName?: string
  ): void => {
    for (let s = strongStack.length - 1; s >= 1; s--) {
      const frame = strongStack[s];
      if (frame.kind === expectedKind && (expectedKind !== "env" || frame.envName === envName)) {
        matches.set(frame.openIdx, closeIdx);
        strongStack.length = s;
        return;
      }
    }
  };

  const closeWeak = (
    closeIdx: number,
    family: "paren_bracket" | "delim" | "sym",
    pairKey?: string
  ): boolean => {
    const stack = topFrame().weakStack;
    for (let w = stack.length - 1; w >= 0; w--) {
      const entry = stack[w];
      if (entry.family === family && entry.pairKey === pairKey) {
        matches.set(entry.openIdx, closeIdx);
        stack.length = w;
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    switch (tok.kind) {
      case "env_begin":
        strongStack.push({ openIdx: i, kind: "env", envName: tok.envName, weakStack: [] });
        break;
      case "env_end":
        closeStrong(i, "env", tok.envName);
        break;
      case "left_delim":
        strongStack.push({ openIdx: i, kind: "left", weakStack: [] });
        break;
      case "right_delim":
        closeStrong(i, "left");
        break;
      case "brace_open":
        strongStack.push({ openIdx: i, kind: "brace", weakStack: [] });
        break;
      case "brace_close":
        closeStrong(i, "brace");
        break;
      case "paren_open":
      case "bracket_open":
        topFrame().weakStack.push({ openIdx: i, family: "paren_bracket" });
        break;
      case "paren_close":
      case "bracket_close":
        closeWeak(i, "paren_bracket");
        break;
      case "delim_open":
        topFrame().weakStack.push({ openIdx: i, family: "delim", pairKey: tok.pairKey });
        break;
      case "delim_close":
        closeWeak(i, "delim", tok.pairKey);
        break;
      case "sym_delim": {
        const deferToPass2 = parseAmbiguousBars && AMBIGUOUS_BAR_KEYS.has(tok.pairKey ?? "");
        const disabledPipe = !parseAmbiguousBars && tok.pairKey === "pipe";
        if (!deferToPass2 && !disabledPipe && !closeWeak(i, "sym", tok.pairKey)) {
          topFrame().weakStack.push({ openIdx: i, family: "sym", pairKey: tok.pairKey });
        }
        break;
      }
      default:
        break;
    }
  }

  const oddBarSpans = parseAmbiguousBars ? resolvePass2AmbiguousBars(tokens, source, matches) : [];
  return { matches, oddBarSpans };
}
