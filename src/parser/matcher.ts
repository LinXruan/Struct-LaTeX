import { Token } from "./tokenizer";

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

/**
 * Computes matching delimiter pairs (`openTokenIndex -> closeTokenIndex`) in O(N).
 * - Strong scopes (`\begin...\end`, `\left...\right`, `{...}`) isolate weak delimiters.
 * - Mixed `(...)` / `[...]` / `[...)` / `(...]` are allowed within the same strong scope.
 * - Any unmatched opener or closer is omitted from the returned map and degrades to plain atoms.
 */
export function matchDelimiters(tokens: readonly Token[]): Map<number, number> {
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
      case "sym_delim":
        if (!closeWeak(i, "sym", tok.pairKey)) {
          topFrame().weakStack.push({ openIdx: i, family: "sym", pairKey: tok.pairKey });
        }
        break;
      default:
        break;
    }
  }

  return matches;
}
