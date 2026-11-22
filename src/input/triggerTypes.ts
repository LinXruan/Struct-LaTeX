import { InputRuleContext, RuleGuardOptions, RuleType } from "./types";

export type TriggerCategory = "jump" | "delete";

export interface BaseTriggerRule {
  id: string;
  name: string;
  group: string;
  type: RuleType;
  enabled: boolean;
  guards?: RuleGuardOptions;
  exampleInput?: string;
}

export interface TextTriggerRule extends BaseTriggerRule {
  type: "text";
  trigger: string;
}

export interface RegexTriggerRule extends BaseTriggerRule {
  type: "regex";
  trigger: string;
  flags?: string;
}

export interface JsTriggerRule extends BaseTriggerRule {
  type: "js";
  code: string;
}

export type TriggerRule = TextTriggerRule | RegexTriggerRule | JsTriggerRule;

export interface TriggerFileData {
  version: 1;
  jumpRules: TriggerRule[];
  deleteRules: TriggerRule[];
}

export interface TriggerMatchAction {
  replaceLength: number;
  deleteAfter: number;
}

export interface TriggerMatchResult {
  rule: TriggerRule;
  action: TriggerMatchAction;
}

export type JsTriggerReturn =
  | number
  | { replaceLength: number; deleteAfter?: number }
  | null
  | undefined
  | false;

export type JsTriggerFn = (ctx: InputRuleContext) => JsTriggerReturn;

export interface CompiledTextTriggerRule {
  kind: "text";
  rule: TextTriggerRule;
  lastChar: string;
}

export interface CompiledRegexTriggerRule {
  kind: "regex";
  rule: RegexTriggerRule;
  pattern: RegExp;
}

export interface CompiledJsTriggerRule {
  kind: "js";
  rule: JsTriggerRule;
  fn: JsTriggerFn;
}

export type CompiledTriggerRule =
  | CompiledTextTriggerRule
  | CompiledRegexTriggerRule
  | CompiledJsTriggerRule;

export type TriggerJsErrorReporter = (rule: TriggerRule, message: string) => void;
