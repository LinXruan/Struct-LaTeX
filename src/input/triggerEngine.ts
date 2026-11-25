import { t } from "../i18n";
import { buildMathTree } from "../parser/builder";
import { resolveStructuralDelete } from "../parser/deleteResolver";
import { resolveStructuralJump } from "../parser/jumpResolver";
import { StructuralJumpMode, TextSpan } from "../parser/types";
import { buildRuleContext, slicesBackslashToken } from "./contextBuilder";
import {
  CompiledTriggerRule,
  JsTriggerFn,
  TriggerFileData,
  TriggerJsErrorReporter,
  TriggerMatchAction,
  TriggerMatchResult,
  TriggerRule,
} from "./triggerTypes";
import { InputRuleContext, ValidationResult } from "./types";

const VALID_TYPES = new Set(["text", "regex", "js"]);
const VALID_REGEX_FLAGS = /^[ius]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createDefaultTriggerFile(): TriggerFileData {
  return {
    version: 1,
    jumpRules: [],
    jumpRightMultiRules: [],
    jumpLeftSingleRules: [],
    jumpLeftMultiRules: [],
    deleteRules: [],
  };
}

export function cloneTriggerRule<T extends TriggerRule>(rule: T): T {
  return JSON.parse(JSON.stringify(rule)) as T;
}

export function validateTriggerRule(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: [t("val.ruleObject")] };

  if (typeof raw.id !== "string" || raw.id.trim().length === 0) errors.push(t("val.missingId"));
  if (typeof raw.type !== "string" || !VALID_TYPES.has(raw.type)) errors.push(t("val.invalidType"));

  const type = raw.type;
  if (type === "text") {
    const trigger = typeof raw.trigger === "string" ? raw.trigger : "";
    if (trigger.length === 0) errors.push(t("val.textEmptyTrigger"));
  } else if (type === "regex") {
    const trigger = typeof raw.trigger === "string" ? raw.trigger : "";
    const flags = raw.flags === undefined ? "" : raw.flags;
    if (trigger.length === 0) errors.push(t("val.regexEmptyTrigger"));
    if (typeof flags !== "string" || !VALID_REGEX_FLAGS.test(flags)) {
      errors.push(t("val.regexInvalidFlags"));
    } else if (trigger.length > 0) {
      try {
        new RegExp(`(?:${trigger})$`, flags);
      } catch (err) {
        errors.push(t("val.regexSyntax", { msg: (err as Error).message }));
      }
    }
  } else if (type === "js") {
    const name = typeof raw.name === "string" ? raw.name : "";
    const code = typeof raw.code === "string" ? raw.code : "";
    if (name.trim().length === 0) errors.push(t("val.jsEmptyName"));
    if (code.trim().length === 0) {
      errors.push(t("val.jsEmptyCode"));
    } else {
      try {
        new Function("ctx", code);
      } catch (err) {
        errors.push(t("val.jsSyntax", { msg: (err as Error).message }));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateTriggerRuleList(rawList: unknown): ValidationResult {
  if (!Array.isArray(rawList)) return { valid: false, errors: [t("val.triggerRulesArray")] };
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < rawList.length; i++) {
    const item: unknown = rawList[i];
    const res = validateTriggerRule(item);
    if (!res.valid) {
      const label = isRecord(item) && typeof item.id === "string" && item.id ? item.id : `#${i + 1}`;
      for (const msg of res.errors) errors.push(t("val.rulePrefix", { label, msg }));
    }
    if (isRecord(item) && typeof item.id === "string" && item.id.trim().length > 0) {
      if (seenIds.has(item.id)) errors.push(t("val.duplicateId", { id: item.id }));
      seenIds.add(item.id);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateTriggerFile(raw: unknown): ValidationResult {
  if (!isRecord(raw)) return { valid: false, errors: [t("val.triggerFileRoot")] };
  if (raw.version !== 1) return { valid: false, errors: [t("val.triggerFileVersion")] };
  const optionalJumpArraysValid =
    (raw.jumpRightMultiRules === undefined || Array.isArray(raw.jumpRightMultiRules)) &&
    (raw.jumpLeftSingleRules === undefined || Array.isArray(raw.jumpLeftSingleRules)) &&
    (raw.jumpLeftMultiRules === undefined || Array.isArray(raw.jumpLeftMultiRules));
  if (!Array.isArray(raw.jumpRules) || !Array.isArray(raw.deleteRules) || !optionalJumpArraysValid) {
    return { valid: false, errors: [t("val.triggerRulesArray")] };
  }
  const errors = [
    ...validateTriggerRuleList(raw.jumpRules).errors,
    ...validateTriggerRuleList((raw.jumpRightMultiRules as unknown[] | undefined) ?? []).errors,
    ...validateTriggerRuleList((raw.jumpLeftSingleRules as unknown[] | undefined) ?? []).errors,
    ...validateTriggerRuleList((raw.jumpLeftMultiRules as unknown[] | undefined) ?? []).errors,
    ...validateTriggerRuleList(raw.deleteRules).errors,
  ];
  return { valid: errors.length === 0, errors };
}

export function compileTriggerRules(rules: readonly TriggerRule[]): CompiledTriggerRule[] {
  const compiled: CompiledTriggerRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !validateTriggerRule(rule).valid) continue;
    if (rule.type === "text") {
      compiled.push({ kind: "text", rule, lastChar: rule.trigger[rule.trigger.length - 1] ?? "" });
    } else if (rule.type === "regex") {
      compiled.push({ kind: "regex", rule, pattern: new RegExp(`(?:${rule.trigger})$`, rule.flags ?? "") });
    } else {
      compiled.push({ kind: "js", rule, fn: new Function("ctx", rule.code) as JsTriggerFn });
    }
  }
  return compiled;
}

function passesTriggerGuards(rule: TriggerRule, ctx: InputRuleContext): boolean {
  if (!ctx.inMath || ctx.inCode) return false;
  const guards = rule.guards ?? {};
  if ((guards.excludeInTextMode ?? true) && ctx.inTextMode) return false;
  if ((guards.excludeInEnvName ?? true) && ctx.inEnvName) return false;
  if ((guards.excludeInCommand ?? true) && ctx.inCommandTyping) return false;
  return true;
}

function passesWordBoundary(rule: TriggerRule, text: string, matchStart: number): boolean {
  if (!rule.guards?.wordBoundary || matchStart <= 0) return true;
  return !/[a-zA-Z]/.test(text[matchStart - 1]);
}

function resolveRawTriggerAction(
  compiled: CompiledTriggerRule,
  ctx: InputRuleContext,
  onJsError?: TriggerJsErrorReporter
): TriggerMatchAction | null {
  if (compiled.kind === "text") {
    const trigger = compiled.rule.trigger;
    if (trigger.length === 0 || ctx.text.length < trigger.length) return null;
    if (ctx.text[ctx.text.length - 1] !== compiled.lastChar || !ctx.text.endsWith(trigger)) return null;
    if (!passesWordBoundary(compiled.rule, ctx.text, ctx.text.length - trigger.length)) return null;
    return { replaceLength: trigger.length, deleteAfter: 0 };
  }

  if (compiled.kind === "regex") {
    if (compiled.rule.trigger.length === 0) return null;
    const match = compiled.pattern.exec(ctx.text);
    if (!match || match[0].length === 0) return null;
    if (!passesWordBoundary(compiled.rule, ctx.text, match.index)) return null;
    return { replaceLength: match[0].length, deleteAfter: 0 };
  }

  try {
    const raw = compiled.fn(ctx);
    if (raw === null || raw === undefined || raw === false) return null;
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw < 0) return null;
      return { replaceLength: Math.max(0, Math.min(Math.floor(raw), ctx.text.length)), deleteAfter: 0 };
    }
    if (typeof raw === "object" && typeof raw.replaceLength === "number") {
      return {
        replaceLength: Math.max(0, Math.min(Math.floor(raw.replaceLength), ctx.text.length)),
        deleteAfter: Math.max(0, Math.min(Math.floor(raw.deleteAfter ?? 0), ctx.after.length)),
      };
    }
    return null;
  } catch (err) {
    onJsError?.(compiled.rule, (err as Error).message || String(err));
    return null;
  }
}

function evaluateSingleTriggerRule(
  compiled: CompiledTriggerRule,
  ctx: InputRuleContext,
  onJsError?: TriggerJsErrorReporter
): TriggerMatchAction | null {
  if (!passesTriggerGuards(compiled.rule, ctx)) return null;

  const action = resolveRawTriggerAction(compiled, ctx, onJsError);
  if (!action) return null;

  const excludeCmd = compiled.rule.guards?.excludeInCommand ?? true;
  if (excludeCmd && slicesBackslashToken(ctx.before, ctx.text.length - action.replaceLength)) {
    return null;
  }
  return action;
}

export function evaluateTriggerRules(
  compiledList: readonly CompiledTriggerRule[],
  ctx: InputRuleContext,
  onJsError?: TriggerJsErrorReporter
): TriggerMatchResult[] {
  if (compiledList.length === 0) return [];
  const matches: TriggerMatchResult[] = [];
  for (const compiled of compiledList) {
    const action = evaluateSingleTriggerRule(compiled, ctx, onJsError);
    if (action) matches.push({ rule: compiled.rule, action });
  }
  return matches;
}

export function evaluateTriggerPreview(
  rule: TriggerRule,
  parseAmbiguousBars = true
): { matched: boolean; summary: string; error?: string } {
  const val = validateTriggerRule(rule);
  if (!val.valid) return { matched: false, summary: "", error: val.errors[0] };

  const sample =
    rule.type === "text"
      ? rule.trigger
      : (rule.exampleInput ?? "").trim() || (rule.type === "regex" ? rule.trigger : "");
  if (!sample) return { matched: false, summary: t("preview.jsNoSample") };

  const before = sample.slice(0, -1);
  const key = sample.slice(-1);
  const tree = buildMathTree(before, { parseAmbiguousBars });
  const ctx = buildRuleContext({
    key,
    before,
    after: "",
    inMath: true,
    inBlockMath: false,
    inCode: false,
    tree,
    relPos: before.length,
  });

  let jsErr: string | undefined;
  const compiled = compileTriggerRules([{ ...rule, enabled: true }]);
  const matches = evaluateTriggerRules(compiled, ctx, (_, msg) => {
    jsErr = msg;
  });

  if (jsErr) return { matched: false, summary: "", error: jsErr };
  if (matches.length === 0) return { matched: false, summary: t("trigger.preview.noMatch", { sample }) };
  return {
    matched: true,
    summary: t("trigger.preview.matched", { sample, count: matches[0].action.replaceLength }),
  };
}

export function resolvePureStructuralJumpWithTrigger(
  mathSource: string,
  relTrigFrom: number,
  relTrigTo: number,
  parseAmbiguousBars = true,
  mode: StructuralJumpMode = "rightSingle"
): { cleanSource: string; targetCleanRelPos: number | null } {
  const cleanSource = mathSource.slice(0, relTrigFrom) + mathSource.slice(relTrigTo);
  const cleanTree = buildMathTree(cleanSource, { parseAmbiguousBars });
  return { cleanSource, targetCleanRelPos: resolveStructuralJump(cleanTree, relTrigFrom, undefined, mode) };
}

export function resolvePureStructuralDeleteWithTrigger(
  mathSource: string,
  relTrigFrom: number,
  relTrigTo: number,
  parseAmbiguousBars = true
): TextSpan | null {
  const cleanSource = mathSource.slice(0, relTrigFrom) + mathSource.slice(relTrigTo);
  const cleanTree = buildMathTree(cleanSource, { parseAmbiguousBars });
  const relSpan = resolveStructuralDelete(cleanTree, relTrigFrom);
  if (!relSpan) return null;

  const removedLen = relTrigTo - relTrigFrom;
  return {
    from: Math.min(relSpan.from, relTrigFrom),
    to: Math.max(relSpan.to, relTrigFrom) + removedLen,
  };
}
