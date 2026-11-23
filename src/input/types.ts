import { LanguageSetting } from "../i18n/types";
import { LatexObject, MathTree, Slot } from "../parser/types";

export type RuleType = "text" | "regex" | "js";
export type RuleScope = "math" | "text" | "any";
export type TriggerMode = "auto" | "confirm" | "hotkey";
export type OutputDialect = "latex" | "unicode" | "raw";
export type InlineMathPreviewPosition = "above" | "below" | "off";

export interface RuleGuardOptions {
  /** Disallow triggering when immediately preceded by an ASCII letter `[a-zA-Z]` */
  wordBoundary?: boolean;
  /** Skip triggering inside `\text{...}` / `\mathrm{...}`-like text slots (default true for math) */
  excludeInTextMode?: boolean;
  /** Skip triggering while typing a `\command` name (default true for math) */
  excludeInCommand?: boolean;
  /** Skip triggering inside `\begin{...}` / `\end{...}` env names (default true for math) */
  excludeInEnvName?: boolean;
}

export interface BaseInputRule {
  id: string;
  name: string;
  group: string;
  type: RuleType;
  enabled: boolean;
  scope: RuleScope;
  triggerMode: TriggerMode;
  confirmKey?: string;
  hotkey?: string;
  guards?: RuleGuardOptions;
  preview?: string;
  exampleInput?: string;
  skipDialect?: boolean;
}

export interface TextInputRule extends BaseInputRule {
  type: "text";
  trigger: string;
  replacement: string;
}

export interface RegexInputRule extends BaseInputRule {
  type: "regex";
  trigger: string;
  flags?: string;
  replacement: string;
}

export interface JsInputRule extends BaseInputRule {
  type: "js";
  code: string;
}

export type InputRule = TextInputRule | RegexInputRule | JsInputRule;

export interface RulesFileData {
  version: 1;
  rules: InputRule[];
}

export interface PluginSettings {
  language: LanguageSetting;
  smartInputEnabled: boolean;
  smartBackspaceEnabled: boolean;
  smartBackspaceKey: string;
  smartJumpEnabled: boolean;
  smartJumpKey: string;
  outputDialect: OutputDialect;
  parseAmbiguousBars: boolean;
  autoSizeParens: boolean;
  inlineMathPreview: InlineMathPreviewPosition;
  mobileToolbarInitialized: boolean;
}

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  language: "auto",
  smartInputEnabled: true,
  smartBackspaceEnabled: true,
  smartBackspaceKey: "Backspace",
  smartJumpEnabled: true,
  smartJumpKey: "Tab",
  outputDialect: "latex",
  parseAmbiguousBars: true,
  autoSizeParens: true,
  inlineMathPreview: "below",
  mobileToolbarInitialized: false,
};

export interface RuleAction {
  /** Number of characters at the end of `ctx.text` (`before + key`) to replace */
  replaceLength: number;
  /** Optional number of characters immediately after the cursor to delete */
  deleteAfter?: number;
  /** Replacement text to insert */
  insert: string;
  /** Caret offset relative to the start of `insert` (defaults to `insert.length`) */
  cursorOffset?: number;
}

export interface ResolvedRuleAction {
  replaceLength: number;
  deleteAfter: number;
  insert: string;
  cursorOffset: number;
}

export interface InputRuleHelpers {
  isKnownCommand(cmd: string): boolean;
  isCommandPrefix(prefix: string): boolean;
  expandTemplate(tpl: string): { insert: string; cursorOffset: number };
}

export interface InputRuleContext {
  key: string;
  before: string;
  text: string;
  after: string;
  inMath: boolean;
  inBlockMath: boolean;
  inCode: boolean;
  inTextMode: boolean;
  inCommandTyping: boolean;
  inEnvName: boolean;
  tree: MathTree | null;
  relPos: number;
  prevObject: LatexObject | null;
  currentSlot: Slot | null;
  helpers: InputRuleHelpers;
}

export interface MatchResult {
  rule: InputRule;
  action: ResolvedRuleAction;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RulePreviewResult {
  tex: string;
  rawOutput: string;
  error?: string;
}

export type JsRuleFn = (ctx: InputRuleContext) => RuleAction | null | undefined;
