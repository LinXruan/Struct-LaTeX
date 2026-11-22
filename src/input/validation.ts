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
    return { valid: false, errors: ["规则必须是对象"] };
  }

  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    errors.push("规则缺少有效 ID");
  }
  if (typeof raw.type !== "string" || !VALID_TYPES.has(raw.type)) {
    errors.push("规则类型必须是 text、regex 或 js");
  }
  if (typeof raw.scope !== "string" || !VALID_SCOPES.has(raw.scope)) {
    errors.push("作用域必须是 math、text 或 any");
  }
  if (typeof raw.triggerMode !== "string" || !VALID_MODES.has(raw.triggerMode)) {
    errors.push("触发方式必须是 auto、confirm 或 hotkey");
  }

  const triggerMode = raw.triggerMode;
  const type = raw.type;

  if (triggerMode === "confirm") {
    if (typeof raw.confirmKey !== "string" || !isValidConfirmKey(raw.confirmKey)) {
      errors.push("确认键模式必须指定有效的确认按键（如 Space / Tab / Enter）");
    }
  } else if (triggerMode === "hotkey") {
    if (typeof raw.hotkey !== "string" || normalizeHotkey(raw.hotkey) === null) {
      errors.push("快捷键模式必须绑定有效的组合键或二段连按");
    }
  }

  if (type === "text") {
    const trigger = typeof raw.trigger === "string" ? raw.trigger : "";
    const replacement = typeof raw.replacement === "string" ? raw.replacement : "";
    if (triggerMode !== "hotkey" && trigger.length === 0) {
      errors.push("纯替换规则的触发词不能为空");
    }
    if (replacement.length === 0) {
      errors.push("纯替换规则的替换内容不能为空");
    }
  } else if (type === "regex") {
    const trigger = typeof raw.trigger === "string" ? raw.trigger : "";
    const replacement = typeof raw.replacement === "string" ? raw.replacement : "";
    const flags = raw.flags === undefined ? "" : raw.flags;

    if (triggerMode !== "hotkey" && trigger.length === 0) {
      errors.push("正则规则的匹配模式不能为空");
    }
    if (replacement.length === 0) {
      errors.push("正则规则的替换模板不能为空");
    }
    if (typeof flags !== "string" || !VALID_REGEX_FLAGS.test(flags)) {
      errors.push("正则标志仅支持 i / u / s（禁止使用带状态的 g / y）");
    } else if (trigger.length > 0) {
      try {
        new RegExp(`(?:${trigger})$`, flags);
      } catch (err) {
        errors.push(`正则表达式语法错误: ${(err as Error).message}`);
      }
    }
  } else if (type === "js") {
    const name = typeof raw.name === "string" ? raw.name : "";
    const code = typeof raw.code === "string" ? raw.code : "";
    if (name.trim().length === 0) {
      errors.push("JavaScript 规则名称不能为空");
    }
    if (code.trim().length === 0) {
      errors.push("JavaScript 规则代码不能为空");
    } else {
      try {
        new Function("ctx", code);
      } catch (err) {
        errors.push(`JavaScript 语法错误: ${(err as Error).message}`);
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
    return { valid: false, errors: ["rules.json 根节点必须是对象"] };
  }
  if (raw.version !== 1) {
    return { valid: false, errors: ["rules.json version 必须为 1"] };
  }
  if (!Array.isArray(raw.rules)) {
    return { valid: false, errors: ["rules.json 必须包含 rules 数组"] };
  }

  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < raw.rules.length; i++) {
    const item = raw.rules[i];
    const res = validateRule(item);
    if (!res.valid) {
      const label = isRecord(item) && typeof item.id === "string" && item.id ? item.id : `#${i + 1}`;
      for (const msg of res.errors) {
        errors.push(`规则 [${label}]: ${msg}`);
      }
    }
    if (isRecord(item) && typeof item.id === "string" && item.id.trim().length > 0) {
      if (seenIds.has(item.id)) {
        errors.push(`存在重复规则 ID: ${item.id}`);
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
