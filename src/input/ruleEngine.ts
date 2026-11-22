import { expandTemplate } from "./contextBuilder";
import { convertOutputDialect } from "./dialectConverter";
import { CompiledRule, CompiledRuleSet } from "./ruleCompiler";
import {
  InputRule,
  InputRuleContext,
  MatchResult,
  OutputDialect,
  ResolvedRuleAction,
} from "./types";

export { evaluateRulePreview } from "./previewEvaluator";

export type JsErrorReporter = (rule: InputRule, message: string) => void;

export type EvaluationContext =
  | InputRuleContext
  | { math: InputRuleContext | null; line: InputRuleContext };

function pickContext(rule: InputRule, input: EvaluationContext): InputRuleContext {
  if ("text" in input) return input;
  if (rule.scope === "math" && input.math) return input.math;
  return input.line;
}

function passesContextGuards(rule: InputRule, ctx: InputRuleContext): boolean {
  if (rule.scope === "math" && !ctx.inMath) return false;
  if (rule.scope === "text" && (ctx.inMath || ctx.inCode)) return false;

  const isMathRule = rule.scope === "math";
  const guards = rule.guards ?? {};
  const excludeText = guards.excludeInTextMode ?? isMathRule;
  const excludeEnv = guards.excludeInEnvName ?? isMathRule;
  const excludeCmd = guards.excludeInCommand ?? isMathRule;

  if (excludeText && ctx.inTextMode) return false;
  if (excludeEnv && ctx.inEnvName) return false;
  if (excludeCmd && ctx.inCommandTyping) return false;
  return true;
}

function passesWordBoundary(rule: InputRule, text: string, matchStart: number): boolean {
  if (!rule.guards?.wordBoundary || matchStart <= 0) return true;
  return !/[a-zA-Z]/.test(text[matchStart - 1]);
}

export function expandRegexTemplate(replacement: string, groups: readonly string[]): string {
  return replacement.replace(/\$([1-9]\d*)/g, (_, idxStr: string) => {
    const idx = Number(idxStr);
    return groups[idx] ?? "";
  });
}

function evaluateCompiledRule(
  compiled: CompiledRule,
  ctx: InputRuleContext,
  allowTextMatchWithoutTrigger: boolean,
  onJsError?: JsErrorReporter
): ResolvedRuleAction | null {
  if (!passesContextGuards(compiled.rule, ctx)) return null;

  if (compiled.kind === "text") {
    const trigger = compiled.rule.trigger;
    if (trigger.length === 0) {
      if (!allowTextMatchWithoutTrigger) return null;
      const expanded = expandTemplate(compiled.rule.replacement);
      return { replaceLength: 0, deleteAfter: 0, ...expanded };
    }

    if (ctx.text.length < trigger.length) return null;
    if (ctx.text[ctx.text.length - 1] !== compiled.lastChar) return null;
    if (!ctx.text.endsWith(trigger)) return null;

    const matchStart = ctx.text.length - trigger.length;
    if (!passesWordBoundary(compiled.rule, ctx.text, matchStart)) return null;

    const expanded = expandTemplate(compiled.rule.replacement);
    return { replaceLength: trigger.length, deleteAfter: 0, ...expanded };
  }

  if (compiled.kind === "regex") {
    if (compiled.rule.trigger.length === 0) {
      if (!allowTextMatchWithoutTrigger) return null;
      const expanded = expandTemplate(compiled.rule.replacement);
      return { replaceLength: 0, deleteAfter: 0, ...expanded };
    }

    const match = compiled.pattern.exec(ctx.text);
    if (!match) return null;
    if (!passesWordBoundary(compiled.rule, ctx.text, match.index)) return null;

    const substituted = expandRegexTemplate(compiled.rule.replacement, match);
    const expanded = expandTemplate(substituted);
    return { replaceLength: match[0].length, deleteAfter: 0, ...expanded };
  }

  try {
    const raw = compiled.fn(ctx);
    if (!raw) return null;
    const replaceLength = Math.max(0, Math.min(raw.replaceLength, ctx.text.length));
    const deleteAfter = Math.max(0, Math.min(raw.deleteAfter ?? 0, ctx.after.length));
    const cursorOffset =
      raw.cursorOffset === undefined
        ? raw.insert.length
        : Math.max(0, Math.min(raw.cursorOffset, raw.insert.length));
    return { replaceLength, deleteAfter, insert: raw.insert, cursorOffset };
  } catch (err) {
    onJsError?.(compiled.rule, (err as Error).message || String(err));
    return null;
  }
}

function finalizeDialect(
  rule: InputRule,
  action: ResolvedRuleAction,
  ctx: InputRuleContext,
  dialect: OutputDialect
): ResolvedRuleAction {
  if (rule.skipDialect || dialect === "raw") return action;
  if (rule.scope === "text" || (!ctx.inMath && rule.scope !== "math")) return action;
  const converted = convertOutputDialect(action.insert, action.cursorOffset, dialect);
  return {
    ...action,
    insert: converted.insert,
    cursorOffset: converted.cursorOffset,
  };
}

function matchFirstFromList(
  list: readonly CompiledRule[] | undefined,
  input: EvaluationContext,
  dialect: OutputDialect,
  allowEmptyTrigger: boolean,
  onJsError?: JsErrorReporter
): MatchResult | null {
  if (!list || list.length === 0) return null;
  for (const compiled of list) {
    const ctx = pickContext(compiled.rule, input);
    const rawAction = evaluateCompiledRule(compiled, ctx, allowEmptyTrigger, onJsError);
    if (!rawAction) continue;
    return {
      rule: compiled.rule,
      action: finalizeDialect(compiled.rule, rawAction, ctx, dialect),
    };
  }
  return null;
}

export function evaluateAutoInput(
  compiledSet: CompiledRuleSet,
  input: EvaluationContext,
  dialect: OutputDialect,
  onJsError?: JsErrorReporter
): MatchResult | null {
  return matchFirstFromList(compiledSet.autoRules, input, dialect, false, onJsError);
}

export function evaluateConfirmKey(
  compiledSet: CompiledRuleSet,
  input: EvaluationContext,
  confirmKey: string,
  dialect: OutputDialect,
  onJsError?: JsErrorReporter
): MatchResult | null {
  return matchFirstFromList(compiledSet.confirmRulesByKey.get(confirmKey), input, dialect, false, onJsError);
}

export function evaluateHotkey(
  compiledSet: CompiledRuleSet,
  input: EvaluationContext,
  hotkeyComboOrChord: string,
  dialect: OutputDialect,
  onJsError?: JsErrorReporter
): MatchResult | null {
  const list = hotkeyComboOrChord.includes(" ")
    ? compiledSet.chordRules.get(hotkeyComboOrChord)
    : compiledSet.hotkeyRules.get(hotkeyComboOrChord);
  return matchFirstFromList(list, input, dialect, true, onJsError);
}
