import {
  COMMAND_SIGNATURES,
  ENV_MANDATORY_HEADER_ARGS,
  ENV_OPTIONAL_HEADER_ARGS,
  POSTFIX_MODIFIER_COMMANDS,
} from "./commandTable";
import {
  buildBracketTriggers,
  BuildContext,
  skipHspaceTokens,
} from "./objectFactory";
import { BracketObject, BracketSubtype, LatexObject, Slot } from "./types";

export type RangeBuilderFn = (
  ctx: BuildContext,
  startIdx: number,
  endIdx: number,
  parent: BracketObject | undefined,
  textMode: boolean
) => LatexObject[];

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
  let bodyStartIdx = openIdx + 1;

  if (ENV_OPTIONAL_HEADER_ARGS.has(envName)) {
    const peek = skipHspaceTokens(ctx.tokens, bodyStartIdx, closeIdx);
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
        bodyStartIdx = optClose + 1;
      }
    }
  }

  if (ENV_MANDATORY_HEADER_ARGS.has(envName)) {
    const peek = skipHspaceTokens(ctx.tokens, bodyStartIdx, closeIdx);
    const argClose = ctx.matches.get(peek);
    if (
      peek < closeIdx &&
      ctx.tokens[peek].kind === "brace_open" &&
      argClose !== undefined &&
      argClose < closeIdx
    ) {
      bodyStartIdx = argClose + 1;
    }
  }

  const bodyFrom = bodyStartIdx > openIdx + 1 ? ctx.tokens[bodyStartIdx - 1].to : openTok.to;
  const slot: Slot = {
    openFrom: openTok.from,
    bodyFrom,
    bodyTo: closeTok.from,
    closeTo: closeTok.to,
    children: [],
  };

  const node: BracketObject = {
    id: ctx.nextId++,
    kind: "bracket",
    subtype: "env",
    name: envName,
    from: openTok.from,
    coreFrom: openTok.from,
    coreTo: closeTok.to,
    to: closeTok.to,
    parent,
    dependents: [],
    slots: [slot],
    triggers: buildBracketTriggers(
      "env",
      [slot],
      closeTok.to,
      undefined,
      bodyStartIdx > openIdx + 1 ? openTok.to : undefined
    ),
  };

  ctx.allObjects.push(node);
  slot.children = buildRange(ctx, bodyStartIdx, closeIdx, node, false);
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
  const nextTok = openIdx + 1 < closeIdx ? ctx.tokens[openIdx + 1] : undefined;
  const endsWithLetter = /[a-zA-Z]$/.test(openTok.text);
  const cmdSepEnd = endsWithLetter && nextTok?.kind === "hspace" ? nextTok.to : openTok.to;

  const slot: Slot = {
    openFrom: openTok.from,
    bodyFrom: cmdSepEnd,
    bodyTo: closeTok.from,
    closeTo: closeTok.to,
    children: [],
    textMode,
  };

  const triggers = buildBracketTriggers(subtype, [slot], closeTok.to);
  if (cmdSepEnd > openTok.to) {
    triggers[0] = { from: openTok.to, to: cmdSepEnd };
  }

  const node: BracketObject = {
    id: ctx.nextId++,
    kind: "bracket",
    subtype,
    from: openTok.from,
    coreFrom: openTok.from,
    coreTo: closeTok.to,
    to: closeTok.to,
    parent,
    dependents: [],
    slots: [slot],
    triggers,
  };

  ctx.allObjects.push(node);
  const bodyStartIdx = cmdSepEnd > openTok.to ? openIdx + 2 : openIdx + 1;
  slot.children = buildRange(ctx, bodyStartIdx, closeIdx, node, textMode);
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
      const peek = skipHspaceTokens(ctx.tokens, cursor, endIdx);
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
      const peek = skipHspaceTokens(ctx.tokens, cursor, endIdx);
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
  const slots: Slot[] = slotRanges.map((r) => ({
    openFrom: ctx.tokens[r.openIdx].from,
    bodyFrom: ctx.tokens[r.openIdx].to,
    bodyTo: ctx.tokens[r.closeIdx].from,
    closeTo: ctx.tokens[r.closeIdx].to,
    children: [],
    textMode: r.textMode,
  }));

  const node: BracketObject = {
    id: ctx.nextId++,
    kind: "bracket",
    subtype: "cmd",
    name: cmdTok.text,
    headTo: cmdTok.to,
    from: cmdTok.from,
    coreFrom: cmdTok.from,
    coreTo: lastCloseTok.to,
    to: lastCloseTok.to,
    parent,
    dependents: [],
    slots,
    triggers: buildBracketTriggers("cmd", slots, lastCloseTok.to, cmdTok.to),
  };

  ctx.allObjects.push(node);
  for (let s = 0; s < slotRanges.length; s++) {
    const r = slotRanges[s];
    slots[s].children = buildRange(ctx, r.openIdx + 1, r.closeIdx, node, r.textMode);
  }

  return { node, nextIdx: cursor };
}

export function tryBuildScript(
  ctx: BuildContext,
  opIdx: number,
  endIdx: number,
  buildRange: RangeBuilderFn,
  parent?: BracketObject
): { node: BracketObject; nextIdx: number } | null {
  const opTok = ctx.tokens[opIdx];
  const argIdx = skipHspaceTokens(ctx.tokens, opIdx + 1, endIdx);
  if (argIdx >= endIdx) return null;

  const argTok = ctx.tokens[argIdx];

  if (argTok.kind === "brace_open") {
    const closeIdx = ctx.matches.get(argIdx);
    if (closeIdx === undefined || closeIdx >= endIdx) return null;
    const closeTok = ctx.tokens[closeIdx];
    const slot: Slot = {
      openFrom: argTok.from,
      bodyFrom: argTok.to,
      bodyTo: closeTok.from,
      closeTo: closeTok.to,
      children: [],
    };
    const node: BracketObject = {
      id: ctx.nextId++,
      kind: "bracket",
      subtype: "script",
      name: opTok.text,
      headTo: opTok.to,
      from: opTok.from,
      coreFrom: opTok.from,
      coreTo: closeTok.to,
      to: closeTok.to,
      parent,
      dependents: [],
      slots: [slot],
      triggers: buildBracketTriggers("script", [slot], closeTok.to, opTok.to),
    };
    ctx.allObjects.push(node);
    slot.children = buildRange(ctx, argIdx + 1, closeIdx, node, false);
    return { node, nextIdx: closeIdx + 1 };
  }

  // Brace-less single-token script (`_1`, `^2`, `_\alpha`) is an atomic script unit
  if (
    argTok.kind === "atom" ||
    argTok.kind === "prime" ||
    (argTok.kind === "command" && !POSTFIX_MODIFIER_COMMANDS.has(argTok.text))
  ) {
    const slot: Slot = {
      openFrom: argTok.from,
      bodyFrom: argTok.from,
      bodyTo: argTok.to,
      closeTo: argTok.to,
      children: [],
    };
    const node: BracketObject = {
      id: ctx.nextId++,
      kind: "bracket",
      subtype: "script",
      name: opTok.text,
      headTo: opTok.to,
      from: opTok.from,
      coreFrom: opTok.from,
      coreTo: argTok.to,
      to: argTok.to,
      parent,
      dependents: [],
      slots: [slot],
      triggers: [
        { from: opTok.to, to: opTok.to },
        { from: argTok.to, to: argTok.to },
      ],
    };
    ctx.allObjects.push(node);
    return { node, nextIdx: argIdx + 1 };
  }

  return null;
}
