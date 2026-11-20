import { Token } from "./tokenizer";
import {
  AtomObject,
  BracketObject,
  BracketSubtype,
  LatexObject,
  Slot,
  TriggerRange,
  WordObject,
} from "./types";

export interface BuildContext {
  source: string;
  tokens: Token[];
  matches: Map<number, number>;
  allObjects: LatexObject[];
  nextId: number;
}

export function skipWhitespaceTokens(tokens: readonly Token[], start: number, end: number): number {
  let i = start;
  while (i < end && tokens[i].kind === "whitespace") i++;
  return i;
}

export function createAtom(
  ctx: BuildContext,
  from: number,
  to: number,
  text: string,
  parent?: BracketObject
): AtomObject {
  const obj: AtomObject = {
    id: ctx.nextId++,
    kind: "atom",
    from,
    coreFrom: from,
    coreTo: to,
    to,
    text,
    parent,
    dependents: [],
    triggers: [{ from: to, to }],
  };
  ctx.allObjects.push(obj);
  return obj;
}

export function emitDegradedAtoms(
  ctx: BuildContext,
  from: number,
  to: number,
  out: LatexObject[],
  parent?: BracketObject
): LatexObject | undefined {
  let last: LatexObject | undefined;
  let i = from;
  while (i < to) {
    const code = ctx.source.codePointAt(i);
    const step = code !== undefined && code > 0xffff ? 2 : 1;
    const atom = createAtom(ctx, i, i + step, ctx.source.slice(i, i + step), parent);
    out.push(atom);
    last = atom;
    i += step;
  }
  return last;
}

export function createWord(
  ctx: BuildContext,
  from: number,
  to: number,
  text: string,
  parent?: BracketObject
): WordObject {
  const obj: WordObject = {
    id: ctx.nextId++,
    kind: "word",
    from,
    coreFrom: from,
    coreTo: to,
    to,
    text,
    parent,
    dependents: [],
    triggers: [{ from: to, to }],
  };
  ctx.allObjects.push(obj);
  return obj;
}

export function attachDependent(host: LatexObject | undefined, dep: LatexObject): void {
  if (!host) return;
  const rootHost = host.host ?? host;
  dep.host = rootHost;
  rootHost.dependents.push(dep);
}

export function absorbTrailingSpace(obj: LatexObject, spaceEnd: number): void {
  obj.to = spaceEnd;
  const lastTrigger = obj.triggers[obj.triggers.length - 1];
  if (lastTrigger) {
    lastTrigger.to = spaceEnd;
  }
}

export function buildBracketTriggers(
  _subtype: BracketSubtype,
  slots: readonly Slot[],
  coreTo: number,
  headTo?: number,
  extraOpenTrigger?: number
): TriggerRange[] {
  const triggers: TriggerRange[] = [];

  if (headTo !== undefined) {
    const firstOpen = slots[0]?.openFrom ?? headTo;
    triggers.push({ from: headTo, to: firstOpen });
  }
  if (extraOpenTrigger !== undefined && extraOpenTrigger !== slots[0]?.openCoreTo) {
    triggers.push({ from: extraOpenTrigger, to: extraOpenTrigger });
  }

  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s];
    triggers.push({ from: slot.openCoreTo, to: slot.bodyFrom });
    if (s < slots.length - 1) {
      const nextSlot = slots[s + 1];
      triggers.push({ from: slot.closeTo, to: nextSlot.openFrom });
    }
  }

  triggers.push({ from: coreTo, to: coreTo });
  return triggers;
}
