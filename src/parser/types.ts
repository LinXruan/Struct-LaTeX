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

export interface TextSpan {
  from: number;
  to: number;
}

export type TriggerRange = TextSpan;

export interface MathParseOptions {
  /**
   * Enables partial non-nested parsing for `|` and `∥`:
   * same-level even occurrences pair sequentially, while same-level odd
   * occurrences stay plain atoms and are exposed in `MathTree.oddBarSpans`.
   */
  parseAmbiguousBars?: boolean;
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
  oddBarSpans: TextSpan[];
}

export interface DeleteSpan {
  from: number;
  to: number;
}

export type StructuralJumpMode = "rightSingle" | "rightMulti";

export interface JumpSegment {
  coreFrom: number;
  coreTo: number;
  to: number;
  isSolid: boolean;
  solidRunTo: number;
}
