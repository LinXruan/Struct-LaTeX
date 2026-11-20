import {
  COMMAND_SIGNATURES,
  ENV_MANDATORY_HEADER_ARGS,
  ENV_OPTIONAL_HEADER_ARGS,
  POSTFIX_MODIFIER_COMMANDS,
} from "./commandTable";
import {
  buildBracketTriggers,
  BuildContext,
  createWord,
  skipWhitespaceTokens,
} from "./objectFactory";
import { BracketObject, BracketSubtype, LatexObject, Slot } from "./types";

export type RangeBuilderFn = (
  ctx: BuildContext,
  startIdx: number,
  endIdx: number,
  parent: BracketObject | undefined,
  textMode: boolean
) => LatexObject[];

interface SlotDraft {
  slot: Slot;
  bodyStartIdx: number;
  closeIdx: number;
  textMode: boolean;
}

function createSlotDraft(
  ctx: BuildContext,
  openFrom: number,
  openCoreTo: number,
  bodyCandidateIdx: number,
  closeIdx: number,
  textMode: boolean
): SlotDraft {
  const closeTok = ctx.tokens[closeIdx];
  const bodyStartIdx = textMode
    ? bodyCandidateIdx
    : skipWhitespaceTokens(ctx.tokens, bodyCandidateIdx, closeIdx);
  const bodyFrom =
    bodyStartIdx > bodyCandidateIdx ? ctx.tokens[bodyStartIdx - 1].to : openCoreTo;

  return {
    slot: {
      openFrom,
      openCoreTo,
      bodyFrom,
      bodyTo: closeTok.from,
      closeTo: closeTok.to,
      children: [],
      textMode,
    },
    bodyStartIdx,
    closeIdx,
    textMode,
  };
}

function makeBracketNode(
  ctx: BuildContext,
  subtype: BracketSubtype,
  from: number,
  coreTo: number,
  slots: Slot[],
  parent: BracketObject | undefined,
  options?: { name?: string; headTo?: number; extraOpenTrigger?: number }
): BracketObject {
  const node: BracketObject = {
    id: ctx.nextId++,
    kind: "bracket",
    subtype,
    name: options?.name,
    headTo: options?.headTo,
    from,
    coreFrom: from,
    coreTo,
    to: coreTo,
    parent,
    dependents: [],
    slots,
    triggers: buildBracketTriggers(
      subtype,
      slots,
      coreTo,
      options?.headTo,
      options?.extraOpenTrigger
    ),
  };
  ctx.allObjects.push(node);
  return node;
}

export function buildEnvBracket(
  ctx: BuildContext,
  openIdx: number,
  closeIdx: number,
  buildRange: RangeBuilderFn,
  parent?: BracketObject
): BracketObject {
  const openTok = ctx.tokens[openIdx];
  const closeTok = ctx.tokens[closeIdx];
  const envName = openTok.envName ?? "";
  let headerEndIdx = openIdx + 1;

  if (ENV_OPTIONAL_HEADER_ARGS.has(envName)) {
    const peek = skipWhitespaceTokens(ctx.tokens, headerEndIdx, closeIdx);
    const optClose = ctx.matches.get(peek);
    if (
      peek < closeIdx &&
      ctx.tokens[peek].kind === "bracket_open" &&
      optClose !== undefined &&
      optClose < closeIdx &&
      ctx.tokens[optClose].kind === "bracket_close"
    ) {
      const argText = ctx.source.slice(ctx.tokens[peek].to, ctx.tokens[optClose].from).trim();
      if (argText === "t" || argText === "b" || argText === "c") {
        headerEndIdx = optClose + 1;
      }
    }
  }

  if (ENV_MANDATORY_HEADER_ARGS.has(envName)) {
    const peek = skipWhitespaceTokens(ctx.tokens, headerEndIdx, closeIdx);
    const argClose = ctx.matches.get(peek);
    if (
      peek < closeIdx &&
      ctx.tokens[peek].kind === "brace_open" &&
      argClose !== undefined &&
      argClose < closeIdx
    ) {
      headerEndIdx = argClose + 1;
    }
  }

  const openCoreTo = headerEndIdx > openIdx + 1 ? ctx.tokens[headerEndIdx - 1].to : openTok.to;
  const draft = createSlotDraft(ctx, openTok.from, openCoreTo, headerEndIdx, closeIdx, false);
  const node = makeBracketNode(ctx, "env", openTok.from, closeTok.to, [draft.slot], parent, {
    name: envName,
    extraOpenTrigger: headerEndIdx > openIdx + 1 ? openTok.to : undefined,
  });

  draft.slot.children = buildRange(ctx, draft.bodyStartIdx, closeIdx, node, false);
  return node;
}

export function buildPairedBracket(
  ctx: BuildContext,
  openIdx: number,
  closeIdx: number,
  subtype: BracketSubtype,
  buildRange: RangeBuilderFn,
  parent?: BracketObject,
  textMode = false
): BracketObject {
  const openTok = ctx.tokens[openIdx];
  const closeTok = ctx.tokens[closeIdx];
  const draft = createSlotDraft(ctx, openTok.from, openTok.to, openIdx + 1, closeIdx, textMode);
  const node = makeBracketNode(ctx, subtype, openTok.from, closeTok.to, [draft.slot], parent);

  draft.slot.children = buildRange(ctx, draft.bodyStartIdx, closeIdx, node, textMode);
  return node;
}

export function tryBuildCommandBracket(
  ctx: BuildContext,
  cmdIdx: number,
  endIdx: number,
  buildRange: RangeBuilderFn,
  parent?: BracketObject
): { node: BracketObject; nextIdx: number } | null {
  const cmdTok = ctx.tokens[cmdIdx];
  const sig = COMMAND_SIGNATURES.get(cmdTok.text);
  const slotRanges: Array<{ openIdx: number; closeIdx: number; textMode: boolean }> = [];
  let cursor = cmdIdx + 1;

  if (sig) {
    if (sig.optionalBracket) {
      const peek = skipWhitespaceTokens(ctx.tokens, cursor, endIdx);
      const optClose = ctx.matches.get(peek);
      if (
        peek < endIdx &&
        ctx.tokens[peek].kind === "bracket_open" &&
        optClose !== undefined &&
        optClose < endIdx &&
        ctx.tokens[optClose].kind === "bracket_close"
      ) {
        slotRanges.push({ openIdx: peek, closeIdx: optClose, textMode: false });
        cursor = optClose + 1;
      }
    }

    for (let m = 0; m < sig.mandatory; m++) {
      const peek = skipWhitespaceTokens(ctx.tokens, cursor, endIdx);
      const closeIdx = ctx.matches.get(peek);
      if (
        peek >= endIdx ||
        ctx.tokens[peek].kind !== "brace_open" ||
        closeIdx === undefined ||
        closeIdx >= endIdx
      ) {
        return null;
      }
      const isTextSlot = Boolean(sig.textMode && m === sig.mandatory - 1);
      slotRanges.push({ openIdx: peek, closeIdx, textMode: isTextSlot });
      cursor = closeIdx + 1;
    }
  } else {
    // Unknown command: only absorb an immediately adjacent `{...}` (never `[...]`)
    const closeIdx = ctx.matches.get(cursor);
    if (
      cursor < endIdx &&
      ctx.tokens[cursor].kind === "brace_open" &&
      closeIdx !== undefined &&
      closeIdx < endIdx
    ) {
      slotRanges.push({ openIdx: cursor, closeIdx, textMode: false });
      cursor = closeIdx + 1;
    } else {
      return null;
    }
  }

  const lastCloseTok = ctx.tokens[slotRanges[slotRanges.length - 1].closeIdx];
  const drafts = slotRanges.map((r) => {
    const openTok = ctx.tokens[r.openIdx];
    return createSlotDraft(ctx, openTok.from, openTok.to, r.openIdx + 1, r.closeIdx, r.textMode);
  });

  const node = makeBracketNode(
    ctx,
    "cmd",
    cmdTok.from,
    lastCloseTok.to,
    drafts.map((d) => d.slot),
    parent,
    { name: cmdTok.text, headTo: cmdTok.to }
  );

  for (const draft of drafts) {
    draft.slot.children = buildRange(ctx, draft.bodyStartIdx, draft.closeIdx, node, draft.textMode);
  }
  return { node, nextIdx: cursor };
}

export function tryBuildScript(
  ctx: BuildContext,
  opIdx: number,
  endIdx: number,
  buildRange: RangeBuilderFn,
  parent?: BracketObject
): { node: LatexObject; nextIdx: number } | null {
  const opTok = ctx.tokens[opIdx];
  const argIdx = skipWhitespaceTokens(ctx.tokens, opIdx + 1, endIdx);
  if (argIdx >= endIdx) return null;

  const argTok = ctx.tokens[argIdx];

  if (argTok.kind === "brace_open") {
    const closeIdx = ctx.matches.get(argIdx);
    if (closeIdx === undefined || closeIdx >= endIdx) return null;
    const closeTok = ctx.tokens[closeIdx];
    const draft = createSlotDraft(ctx, argTok.from, argTok.to, argIdx + 1, closeIdx, false);
    const node = makeBracketNode(ctx, "script", opTok.from, closeTok.to, [draft.slot], parent, {
      name: opTok.text,
      headTo: opTok.to,
    });
    draft.slot.children = buildRange(ctx, draft.bodyStartIdx, closeIdx, node, false);
    return { node, nextIdx: closeIdx + 1 };
  }

  // Brace-less single-token script (`_2`, `^n`, `_\alpha`) is a solid WordObject
  if (
    argTok.kind === "atom" ||
    argTok.kind === "prime" ||
    (argTok.kind === "command" && !POSTFIX_MODIFIER_COMMANDS.has(argTok.text))
  ) {
    const word = createWord(
      ctx,
      opTok.from,
      argTok.to,
      ctx.source.slice(opTok.from, argTok.to),
      parent
    );
    return { node: word, nextIdx: argIdx + 1 };
  }

  return null;
}
