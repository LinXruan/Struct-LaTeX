import { isValidConfirmKey, normalizeHotkey, normalizeKeyCombo } from "./keybindUtils";
import { InputRule, JsInputRule, JsRuleFn, RegexInputRule, TextInputRule } from "./types";
import { validateRule } from "./validation";

export interface CompiledTextRule {
  kind: "text";
  rule: TextInputRule;
  lastChar: string;
}

export interface CompiledRegexRule {
  kind: "regex";
  rule: RegexInputRule;
  pattern: RegExp;
}

export interface CompiledJsRule {
  kind: "js";
  rule: JsInputRule;
  fn: JsRuleFn;
}

export type CompiledRule = CompiledTextRule | CompiledRegexRule | CompiledJsRule;

export interface CompiledRuleSet {
  autoRules: CompiledRule[];
  confirmRulesByKey: Map<string, CompiledRule[]>;
  hotkeyRules: Map<string, CompiledRule[]>;
  chordPrefixes: Set<string>;
  chordRules: Map<string, CompiledRule[]>;
  compileErrors: string[];
}

function compileSingleRule(rule: InputRule): CompiledRule | null {
  if (!rule.enabled) return null;
  const check = validateRule(rule);
  if (!check.valid) return null;

  if (rule.type === "text") {
    const trigger = rule.trigger;
    return {
      kind: "text",
      rule,
      lastChar: trigger.length > 0 ? trigger[trigger.length - 1] : "",
    };
  }

  if (rule.type === "regex") {
    const pattern = new RegExp(`(?:${rule.trigger})$`, rule.flags ?? "");
    return { kind: "regex", rule, pattern };
  }

  const fn = new Function("ctx", rule.code) as JsRuleFn;
  return { kind: "js", rule, fn };
}

function pushToMap<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/**
 * Compiles enabled and valid rules into runtime indices preserving rule list priority order.
 */
export function compileRules(rules: readonly InputRule[]): CompiledRuleSet {
  const autoRules: CompiledRule[] = [];
  const confirmRulesByKey = new Map<string, CompiledRule[]>();
  const hotkeyRules = new Map<string, CompiledRule[]>();
  const chordPrefixes = new Set<string>();
  const chordRules = new Map<string, CompiledRule[]>();
  const compileErrors: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const validation = validateRule(rule);
    if (!validation.valid) {
      compileErrors.push(`[${rule.id}] ${validation.errors.join("; ")}`);
      continue;
    }

    const compiled = compileSingleRule(rule);
    if (!compiled) continue;

    if (rule.triggerMode === "auto") {
      autoRules.push(compiled);
      continue;
    }

    if (rule.triggerMode === "confirm") {
      if (isValidConfirmKey(rule.confirmKey)) {
        const key = normalizeKeyCombo(rule.confirmKey!)!;
        pushToMap(confirmRulesByKey, key, compiled);
      }
      continue;
    }

    if (rule.triggerMode === "hotkey" && rule.hotkey) {
      const normalized = normalizeHotkey(rule.hotkey);
      if (!normalized) continue;
      const steps = normalized.split(" ");
      if (steps.length === 1) {
        pushToMap(hotkeyRules, steps[0], compiled);
      } else if (steps.length === 2) {
        chordPrefixes.add(steps[0]);
        pushToMap(chordRules, normalized, compiled);
      }
    }
  }

  return {
    autoRules,
    confirmRulesByKey,
    hotkeyRules,
    chordPrefixes,
    chordRules,
    compileErrors,
  };
}
