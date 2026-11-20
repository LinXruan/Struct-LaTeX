export type ObjectKind = "bracket" | "word" | "atom";

export type BracketSubtype =
  | "delim"
  | "env"
  | "cmd"
  | "group"
  | "script";

export interface Slot {
  openFrom: number;
  openCoreTo: number;
  bodyFrom: number;
  bodyTo: number;
  closeTo: number;
  children: LatexObject[];
  textMode?: boolean;
}

export interface TriggerRange {
  from: number;
  to: number;
}

interface BaseLatexObject {
  id: number;
  kind: ObjectKind;
  from: number;
  coreFrom: number;
  coreTo: number;
  to: number;
  parent?: BracketObject;
  host?: LatexObject;
  dependents: LatexObject[];
  triggers: TriggerRange[];
}

export interface BracketObject extends BaseLatexObject {
  kind: "bracket";
  subtype: BracketSubtype;
  name?: string;
  headTo?: number;
  slots: Slot[];
}

export interface WordObject extends BaseLatexObject {
  kind: "word";
  text: string;
}

export interface AtomObject extends BaseLatexObject {
  kind: "atom";
  text: string;
}

export type LatexObject = BracketObject | WordObject | AtomObject;

export interface MathTree {
  source: string;
  roots: LatexObject[];
  allObjects: LatexObject[];
}

export interface DeleteSpan {
  from: number;
  to: number;
}

export interface JumpSegment {
  coreFrom: number;
  coreTo: number;
  to: number;
}
