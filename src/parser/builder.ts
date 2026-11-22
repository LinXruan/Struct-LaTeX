import {
  buildEnvBracket,
  buildPairedBracket,
  tryBuildCommandBracket,
  tryBuildScript,
} from "./bracketBuilders";
import { POSTFIX_MODIFIER_COMMANDS } from "./commandTable";
import { matchDelimiters } from "./matcher";
import {
  absorbTrailingSpace,
  attachDependent,
  BuildContext,
  createAtom,
  createWord,
  emitDegradedAtoms,
} from "./objectFactory";
import { Token, TokenKind, tokenizeMath } from "./tokenizer";
import { BracketObject, LatexObject, MathParseOptions, MathTree } from "./types";

const DELIMITER_TOKEN_KINDS: ReadonlySet<TokenKind> = new Set([
  "left_delim",
  "right_delim",
  "env_begin",
  "env_end",
  "brace_open",
  "brace_close",
  "bracket_open",
  "bracket_close",
  "paren_open",
  "paren_close",
  "delim_open",
  "delim_close",
  "sym_delim",
]);

/**
 * Prevents the final root-level object before a closing math delimiter (`$$` / `\]`)
 * from absorbing a trailing newline (while still absorbing same-line spaces before it).
 */
function resolveTrailingSpaceEnd(tok: Token, stopAtNewline: boolean): number {
  if (!stopAtNewline) return tok.to;
  for (let idx = 0; idx < tok.text.length; idx++) {
    const ch = tok.text[idx];
    if (ch === "\r" || ch === "\n") {
      return tok.from + idx;
    }
  }
  return tok.to;
}

function buildRange(
  ctx: BuildContext,
  startIdx: number,
  endIdx: number,
  parent: BracketObject | undefined,
  textMode: boolean
): LatexObject[] {
  const result: LatexObject[] = [];
  let lastSibling: LatexObject | undefined;
  let i = startIdx;

  while (i < endIdx) {
    const tok = ctx.tokens[i];

    if (tok.kind === "whitespace") {
      if (!textMode && lastSibling) {
        const stopAtNewline = parent === undefined && i + 1 === endIdx;
        const absorbEnd = resolveTrailingSpaceEnd(tok, stopAtNewline);
        if (absorbEnd > tok.from) absorbTrailingSpace(lastSibling, absorbEnd);
      }
      i++;
      continue;
    }

    const matchedClose = ctx.matches.get(i);
    if (matchedClose !== undefined && matchedClose < endIdx) {
      const bracket =
        tok.kind === "env_begin"
          ? buildEnvBracket(ctx, i, matchedClose, buildRange, parent)
          : buildPairedBracket(
              ctx,
              i,
              matchedClose,
              tok.kind === "brace_open" ? "group" : "delim",
              buildRange,
              parent,
              textMode
            );
      result.push(bracket);
      lastSibling = bracket;
      i = matchedClose + 1;
      continue;
    }

    if (DELIMITER_TOKEN_KINDS.has(tok.kind)) {
      lastSibling = emitDegradedAtoms(ctx, tok.from, tok.to, result, parent);
      i++;
      continue;
    }

    if (tok.kind === "script_op") {
      const built = tryBuildScript(ctx, i, endIdx, buildRange, parent);
      if (built) {
        attachDependent(lastSibling, built.node);
        result.push(built.node);
        lastSibling = built.node;
        i = built.nextIdx;
        continue;
      }
      const atom = createAtom(ctx, tok.from, tok.to, tok.text, parent);
      result.push(atom);
      lastSibling = atom;
      i++;
      continue;
    }

    if (tok.kind === "prime") {
      const primeAtom = createAtom(ctx, tok.from, tok.to, tok.text, parent);
      attachDependent(lastSibling, primeAtom);
      result.push(primeAtom);
      lastSibling = primeAtom;
      i++;
      continue;
    }

    if (tok.kind === "align_break") {
      const word = createWord(ctx, tok.from, tok.to, tok.text, parent);
      result.push(word);
      lastSibling = word;
      i++;
      continue;
    }

    if (tok.kind === "command") {
      if (POSTFIX_MODIFIER_COMMANDS.has(tok.text)) {
        const modWord = createWord(ctx, tok.from, tok.to, tok.text, parent);
        attachDependent(lastSibling, modWord);
        result.push(modWord);
        lastSibling = modWord;
        i++;
        continue;
      }

      const cmdBuilt = tryBuildCommandBracket(ctx, i, endIdx, buildRange, parent);
      if (cmdBuilt) {
        result.push(cmdBuilt.node);
        lastSibling = cmdBuilt.node;
        i = cmdBuilt.nextIdx;
        continue;
      }

      const word = createWord(ctx, tok.from, tok.to, tok.text, parent);
      result.push(word);
      lastSibling = word;
      i++;
      continue;
    }

    const atom = createAtom(ctx, tok.from, tok.to, tok.text, parent);
    result.push(atom);
    lastSibling = atom;
    i++;
  }

  return result;
}

export function buildMathTree(source: string, options?: MathParseOptions): MathTree {
  const tokens = tokenizeMath(source);
  const { matches, oddBarSpans } = matchDelimiters(tokens, source, options);
  const ctx: BuildContext = {
    source,
    tokens,
    matches,
    allObjects: [],
    nextId: 1,
  };
  const roots = buildRange(ctx, 0, tokens.length, undefined, false);
  return { source, roots, allObjects: ctx.allObjects, oddBarSpans };
}
