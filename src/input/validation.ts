import { t } from "../i18n";
import { isValidConfirmKey, normalizeHotkey } from "./keybindUtils";
import { InputRule, RulesFileData, ValidationResult } from "./types";

const VALID_TYPES = new Set(["text", "regex", "js"]);
const VALID_SCOPES = new Set(["math", "text", "any"]);
const VALID_MODES = new Set(["auto", "confirm", "hotkey"]);
const VALID_REGEX_FLAGS = /^[ius]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strictly validates a single rule for completeness and syntactic correctness.
 * Incomplete rules (missing trigger head or missing replacement/code) are rejected.
 */
export function validateRule(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { valid: false, errors: [t("val.ruleObject")] };
  }

  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    errors.push(t("val.missingId"));
  }
  if (typeof raw.type !== "string" || !VALID_TYPES.has(raw.type)) {
    errors.push(t("val.invalidType"));
  }
  if (typeof raw.scope !== "string" || !VALID_SCOPES.has(raw.scope)) {
    errors.push(t("val.invalidScope"));
  }
  if (typeof raw.triggerMode !== "string" || !VALID_MODES.has(raw.triggerMode)) {
    errors.push(t("val.invalidMode"));
  }

  const triggerMode = raw.triggerMode;
  const type = raw.type;

  if (triggerMode === "confirm") {
    if (typeof raw.confirmKey !== "string" || !isValidConfirmKey(raw.confirmKey)) {
      errors.push(t("val.invalidConfirmKey"));
    }
  } else if (triggerMode === "hotkey") {
    if (typeof raw.hotkey !== "string" || normalizeHotkey(raw.hotkey) === null) {
      errors.push(t("val.invalidHotkey"));
    }
  }

  if (type === "text") {
    const trigger = typeof raw.trigger === "string" ? raw.trigger : "";
    const replacement = typeof raw.replacement === "string" ? raw.replacement : "";
    if (triggerMode !== "hotkey" && trigger.length === 0) {
      errors.push(t("val.textEmptyTrigger"));
    }
    if (replacement.length === 0) {
      errors.push(t("val.textEmptyReplace"));
    }
  } else if (type === "regex") {
    const trigger = typeof raw.trigger === "string" ? raw.trigger : "";
    const replacement = typeof raw.replacement === "string" ? raw.replacement : "";
    const flags = raw.flags === undefined ? "" : raw.flags;

    if (triggerMode !== "hotkey" && trigger.length === 0) {
      errors.push(t("val.regexEmptyTrigger"));
    }
    if (replacement.length === 0) {
      errors.push(t("val.regexEmptyReplace"));
    }
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
    if (name.trim().length === 0) {
      errors.push(t("val.jsEmptyName"));
    }
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

/**
 * Validates an entire `rules.json` structure including rule completeness and ID uniqueness.
 */
export function validateRulesFile(raw: unknown): ValidationResult {
  if (!isRecord(raw)) {
    return { valid: false, errors: [t("val.fileRoot")] };
  }
  if (raw.version !== 1) {
    return { valid: false, errors: [t("val.fileVersion")] };
  }
  if (!Array.isArray(raw.rules)) {
    return { valid: false, errors: [t("val.fileRulesArray")] };
  }

  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < raw.rules.length; i++) {
    const item = raw.rules[i];
    const res = validateRule(item);
    if (!res.valid) {
      const label = isRecord(item) && typeof item.id === "string" && item.id ? item.id : `#${i + 1}`;
      for (const msg of res.errors) {
        errors.push(t("val.rulePrefix", { label, msg }));
      }
    }
    if (isRecord(item) && typeof item.id === "string" && item.id.trim().length > 0) {
      if (seenIds.has(item.id)) {
        errors.push(t("val.duplicateId", { id: item.id }));
      }
      seenIds.add(item.id);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isValidRulesFileData(raw: unknown): raw is RulesFileData {
  return validateRulesFile(raw).valid;
}

export function cloneRule<T extends InputRule>(rule: T): T {
  return JSON.parse(JSON.stringify(rule)) as T;
}
