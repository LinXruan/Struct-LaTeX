import type { App } from "obsidian";
import { TriggerCategory } from "../input/triggerTypes";

export const SMART_JUMP_COMMAND_ID = "smart-jump";
export const SMART_BACKSPACE_COMMAND_ID = "smart-backspace";

export const SMART_JUMP_FULL_CMD_ID = "struct-latex:smart-jump";
export const SMART_BACKSPACE_FULL_CMD_ID = "struct-latex:smart-backspace";

interface MobileToolbarVaultLike {
  getConfig?: (key: string) => unknown;
  setConfig?: (key: string, value: unknown) => void;
}

export interface MobileToolbarAppLike {
  vault?: MobileToolbarVaultLike;
  mobileToolbar?: {
    update?: () => void;
  } | null;
}

export function getFullCommandIdForCategory(category: TriggerCategory): string {
  return category === "jump" ? SMART_JUMP_FULL_CMD_ID : SMART_BACKSPACE_FULL_CMD_ID;
}

export function getMobileToolbarCommands(app: App | MobileToolbarAppLike): string[] | null {
  const vault = app.vault as MobileToolbarVaultLike | undefined;
  if (typeof vault?.getConfig !== "function") return null;
  const raw = vault.getConfig("mobileToolbarCommands");
  if (!Array.isArray(raw)) return null;
  return raw.filter((item): item is string => typeof item === "string");
}

export function isCommandInMobileToolbar(
  app: App | MobileToolbarAppLike,
  fullCommandId: string
): boolean {
  const list = getMobileToolbarCommands(app);
  return list !== null && list.includes(fullCommandId);
}

/**
 * Inserts `fullCommandId` at the first position of Obsidian's `mobileToolbarCommands`
 * config array and refreshes `app.mobileToolbar`.
 */
export function addCommandToMobileToolbar(
  app: App | MobileToolbarAppLike,
  fullCommandId: string
): boolean {
  const vault = app.vault as MobileToolbarVaultLike | undefined;
  if (typeof vault?.getConfig !== "function" || typeof vault?.setConfig !== "function") {
    return false;
  }
  const list = getMobileToolbarCommands(app);
  if (!list) return false;
  if (list.includes(fullCommandId)) return false;

  const next = [fullCommandId, ...list];
  vault.setConfig("mobileToolbarCommands", next);
  (app as MobileToolbarAppLike).mobileToolbar?.update?.();
  return true;
}

export function removeCommandFromMobileToolbar(
  app: App | MobileToolbarAppLike,
  fullCommandId: string
): boolean {
  const vault = app.vault as MobileToolbarVaultLike | undefined;
  if (typeof vault?.getConfig !== "function" || typeof vault?.setConfig !== "function") {
    return false;
  }
  const list = getMobileToolbarCommands(app);
  if (!list || !list.includes(fullCommandId)) return false;

  const next = list.filter((id) => id !== fullCommandId);
  vault.setConfig("mobileToolbarCommands", next);
  (app as MobileToolbarAppLike).mobileToolbar?.update?.();
  return true;
}
