import { t } from "../i18n";
import { resolveFeatureKeybind } from "../input/keybindUtils";
import { TriggerCategory } from "../input/triggerTypes";
import { DEFAULT_PLUGIN_SETTINGS, PluginSettings } from "../input/types";
import { StructuralJumpMode } from "../parser/types";
import {
  GeneralSettingsHost,
  KeybindFeaturePageOptions,
  renderKeybindFeaturePage,
} from "./settingGeneralSection";
import { createSettingCard, renderNavRow } from "./settingNavComponents";

export type JumpSubPage = StructuralJumpMode;

export interface JumpModeSpec {
  mode: JumpSubPage;
  icon: string;
  category: TriggerCategory;
  nameKey:
    | "settings.jump.rightSingle.name"
    | "settings.jump.rightMulti.name"
    | "settings.jump.leftSingle.name"
    | "settings.jump.leftMulti.name";
  descKey:
    | "settings.jump.rightSingle.desc"
    | "settings.jump.rightMulti.desc"
    | "settings.jump.leftSingle.desc"
    | "settings.jump.leftMulti.desc";
  toggleNameKey:
    | "settings.smartJump.name"
    | "settings.smartJumpRightMulti.name"
    | "settings.smartJumpLeftSingle.name"
    | "settings.smartJumpLeftMulti.name";
  toggleDescKey:
    | "settings.smartJump.desc"
    | "settings.smartJumpRightMulti.desc"
    | "settings.smartJumpLeftSingle.desc"
    | "settings.smartJumpLeftMulti.desc";
  enabledKey:
    | "smartJumpEnabled"
    | "smartJumpRightMultiEnabled"
    | "smartJumpLeftSingleEnabled"
    | "smartJumpLeftMultiEnabled";
  keybindKey:
    | "smartJumpKey"
    | "smartJumpRightMultiKey"
    | "smartJumpLeftSingleKey"
    | "smartJumpLeftMultiKey";
  allowEmpty: boolean;
}

const JUMP_MODE_SPECS: readonly JumpModeSpec[] = [
  {
    mode: "rightSingle",
    icon: "arrow-right-to-line",
    category: "jump",
    nameKey: "settings.jump.rightSingle.name",
    descKey: "settings.jump.rightSingle.desc",
    toggleNameKey: "settings.smartJump.name",
    toggleDescKey: "settings.smartJump.desc",
    enabledKey: "smartJumpEnabled",
    keybindKey: "smartJumpKey",
    allowEmpty: false,
  },
  {
    mode: "rightMulti",
    icon: "chevrons-right",
    category: "jumpRightMulti",
    nameKey: "settings.jump.rightMulti.name",
    descKey: "settings.jump.rightMulti.desc",
    toggleNameKey: "settings.smartJumpRightMulti.name",
    toggleDescKey: "settings.smartJumpRightMulti.desc",
    enabledKey: "smartJumpRightMultiEnabled",
    keybindKey: "smartJumpRightMultiKey",
    allowEmpty: false,
  },
  {
    mode: "leftSingle",
    icon: "arrow-left-to-line",
    category: "jumpLeftSingle",
    nameKey: "settings.jump.leftSingle.name",
    descKey: "settings.jump.leftSingle.desc",
    toggleNameKey: "settings.smartJumpLeftSingle.name",
    toggleDescKey: "settings.smartJumpLeftSingle.desc",
    enabledKey: "smartJumpLeftSingleEnabled",
    keybindKey: "smartJumpLeftSingleKey",
    allowEmpty: true,
  },
  {
    mode: "leftMulti",
    icon: "chevrons-left",
    category: "jumpLeftMulti",
    nameKey: "settings.jump.leftMulti.name",
    descKey: "settings.jump.leftMulti.desc",
    toggleNameKey: "settings.smartJumpLeftMulti.name",
    toggleDescKey: "settings.smartJumpLeftMulti.desc",
    enabledKey: "smartJumpLeftMultiEnabled",
    keybindKey: "smartJumpLeftMultiKey",
    allowEmpty: true,
  },
];

export function getJumpModeSpec(mode: JumpSubPage): JumpModeSpec {
  return JUMP_MODE_SPECS.find((s) => s.mode === mode) ?? JUMP_MODE_SPECS[0];
}

/**
 * Renders the 4 jump mode navigation rows inside a grouped card.
 */
export function renderJumpHubPage(
  parent: HTMLElement,
  host: GeneralSettingsHost,
  onSelectMode: (mode: JumpSubPage) => void
): void {
  const card = createSettingCard(parent);
  const settingsRecord: PluginSettings = host.settings;

  for (const spec of JUMP_MODE_SPECS) {
    const enabled = settingsRecord[spec.enabledKey];
    const defaultKey = DEFAULT_PLUGIN_SETTINGS[spec.keybindKey];
    const keybind = spec.allowEmpty
      ? settingsRecord[spec.keybindKey].trim() || t("settings.nav.unbound")
      : resolveFeatureKeybind(settingsRecord[spec.keybindKey], defaultKey);

    renderNavRow(card, {
      icon: spec.icon,
      title: t(spec.nameKey),
      desc: t(spec.descKey),
      summary: enabled ? keybind : t("settings.nav.summaryOff"),
      summaryMonospace: enabled && (spec.allowEmpty ? settingsRecord[spec.keybindKey].trim().length > 0 : true),
      statusDot: enabled ? "on" : "off",
      onClick: () => onSelectMode(spec.mode),
    });
  }
}

/**
 * Renders the detail view for a single jump mode.
 */
export function renderJumpDetailPage(
  parent: HTMLElement,
  mode: JumpSubPage,
  host: GeneralSettingsHost,
  onOpenTriggerEditor?: KeybindFeaturePageOptions["onOpenTriggerEditor"]
): () => void {
  const spec = getJumpModeSpec(mode);
  const settingsRecord: PluginSettings = host.settings;
  const defaultKey = DEFAULT_PLUGIN_SETTINGS[spec.keybindKey];

  return renderKeybindFeaturePage(parent, {
    category: spec.category,
    app: host.app,
    triggerStore: host.triggerStore,
    toggleName: t(spec.toggleNameKey),
    toggleDesc: t(spec.toggleDescKey),
    enabled: settingsRecord[spec.enabledKey],
    onToggle: async (v) => {
      settingsRecord[spec.enabledKey] = v;
      await host.saveSettings();
    },
    keybindValue: settingsRecord[spec.keybindKey],
    defaultKeybind: defaultKey,
    allowEmpty: spec.allowEmpty,
    keybindPlaceholder: spec.allowEmpty ? t("settings.keybind.unboundPlaceholder") : defaultKey,
    onKeybindCommit: async (normalized) => {
      settingsRecord[spec.keybindKey] = normalized;
      await host.saveSettings();
    },
    onOpenTriggerEditor,
  });
}
