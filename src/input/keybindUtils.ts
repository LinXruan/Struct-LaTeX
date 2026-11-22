import { InputRule } from "./types";

const MODIFIER_ORDER = ["Mod", "Ctrl", "Alt", "Shift"] as const;

const MODIFIER_ALIASES: ReadonlyMap<string, string> = new Map([
  ["mod", "Mod"],
  ["cmd", "Mod"],
  ["command", "Mod"],
  ["ctrl", "Ctrl"],
  ["control", "Ctrl"],
  ["alt", "Alt"],
  ["option", "Alt"],
  ["opt", "Alt"],
  ["shift", "Shift"],
]);

const BARE_MODIFIER_KEYS = new Set(["control", "ctrl", "shift", "alt", "meta", "os", "mod"]);

const NAMED_KEY_ALIASES: ReadonlyMap<string, string> = new Map([
  [" ", "Space"],
  ["space", "Space"],
  ["spacebar", "Space"],
  ["tab", "Tab"],
  ["enter", "Enter"],
  ["return", "Enter"],
  ["esc", "Escape"],
  ["escape", "Escape"],
  ["backspace", "Backspace"],
  ["delete", "Delete"],
  ["del", "Delete"],
  ["up", "ArrowUp"],
  ["arrowup", "ArrowUp"],
  ["down", "ArrowDown"],
  ["arrowdown", "ArrowDown"],
  ["left", "ArrowLeft"],
  ["arrowleft", "ArrowLeft"],
  ["right", "ArrowRight"],
  ["arrowright", "ArrowRight"],
]);

function normalizeMainKey(rawKey: string): string | null {
  const trimmed = rawKey === " " ? " " : rawKey.trim();
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase();
  if (BARE_MODIFIER_KEYS.has(lower)) return null;

  const named = NAMED_KEY_ALIASES.get(lower);
  if (named) return named;

  if (/^[a-zA-Z]$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^f([1-9]|1[0-2])$/i.test(trimmed)) return trimmed.toUpperCase();
  if (trimmed.length === 1) return trimmed;
  return null;
}

/**
 * Normalizes a single key combination like `alt+f` or `ctrl+shift+m` into canonical form.
 * Returns `null` if the input is empty, contains only modifiers, or has an invalid key.
 */
export function normalizeKeyCombo(raw: string): string | null {
  if (!raw || raw.trim().length === 0) return null;

  const parts = raw === " " ? [" "] : raw.split("+");
  const mods = new Set<string>();
  let mainKey: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const mod = MODIFIER_ALIASES.get(part.trim().toLowerCase());
    if (mod && i < parts.length - 1) {
      mods.add(mod);
      continue;
    }
    if (mainKey !== null) return null;
    mainKey = normalizeMainKey(part);
    if (!mainKey) return null;
  }

  if (!mainKey) return null;

  const orderedMods = MODIFIER_ORDER.filter((m) => mods.has(m));
  return orderedMods.length > 0 ? `${orderedMods.join("+")}+${mainKey}` : mainKey;
}

/**
 * Normalizes a hotkey string supporting a single combo (`Alt+F`) or 2-step chord (`Mod+K F`).
 */
export function normalizeHotkey(raw: string): string | null {
  if (!raw || raw.trim().length === 0) return null;
  const steps = raw.trim().split(/\s+/);
  if (steps.length === 0 || steps.length > 2) return null;

  const normalized: string[] = [];
  for (const step of steps) {
    const combo = normalizeKeyCombo(step);
    if (!combo) return null;
    normalized.push(combo);
  }
  return normalized.join(" ");
}

export function isValidConfirmKey(raw: string | undefined): boolean {
  if (!raw) return false;
  return normalizeKeyCombo(raw) !== null;
}

export function splitHotkeySteps(hotkey: string): string[] {
  const norm = normalizeHotkey(hotkey);
  return norm ? norm.split(" ") : [];
}

export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Converts a browser KeyboardEvent-like object into a normalized key combo string.
 * Returns `null` for bare modifier presses or dead keys.
 */
export function keyboardEventToCombo(ev: KeyEventLike, isMac = false): string | null {
  if (ev.key === "Dead" || ev.key === "Process" || ev.key === "Unidentified") return null;

  const keyToken = ev.code === "Space" || ev.key === " " ? "Space" : ev.key;
  const mainKey = normalizeMainKey(keyToken);
  if (!mainKey) return null;

  const mods: string[] = [];
  const primaryPressed = isMac ? ev.metaKey : ev.ctrlKey;
  const secondaryCtrlPressed = isMac && ev.ctrlKey;

  if (primaryPressed) mods.push("Mod");
  if (secondaryCtrlPressed) mods.push("Ctrl");
  if (ev.altKey) mods.push("Alt");

  // Only include Shift when paired with modifiers, letters, or special keys (avoid Shift+/ hiding `?`)
  const isPrintableSymbol = mainKey.length === 1 && !/^[A-Z]$/.test(mainKey);
  if (ev.shiftKey && (mods.length > 0 || !isPrintableSymbol)) {
    mods.push("Shift");
  }

  return mods.length > 0 ? `${mods.join("+")}+${mainKey}` : mainKey;
}

export function formatTriggerBadge(rule: InputRule): string {
  if (rule.triggerMode === "auto") return "Auto";
  if (rule.triggerMode === "confirm") {
    const key = normalizeKeyCombo(rule.confirmKey ?? "") ?? rule.confirmKey ?? "?";
    return `触发+${key}`;
  }
  const hk = normalizeHotkey(rule.hotkey ?? "") ?? rule.hotkey ?? "?";
  return `快捷键 ${hk}`;
}
