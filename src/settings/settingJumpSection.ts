import { Setting } from "obsidian";
import { t } from "../i18n";
import { TriggerCategory } from "../input/triggerTypes";
import { DEFAULT_PLUGIN_SETTINGS, PluginSettings } from "../input/types";
import { StructuralJumpMode } from "../parser/types";
import {
  GeneralSettingsHost,
  KeybindFeaturePageOptions,
  renderKeybindFeaturePage,
  renderSubPageHeader,
} from "./settingGeneralSection";

export type JumpSubPage = StructuralJumpMode;

export interface JumpSectionCallbacks {
  onBackHome: () => void;
  onSelectMode: (mode: JumpSubPage) => void;
  onBackToHub: () => void;
  onOpenTriggerEditor?: KeybindFeaturePageOptions["onOpenTriggerEditor"];
}

interface JumpModeSpec {
  mode: JumpSubPage;
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

function renderJumpHubPage(
  parent: HTMLElement,
  onSelectMode: (mode: JumpSubPage) => void
): void {
  for (const spec of JUMP_MODE_SPECS) {
    new Setting(parent)
      .setName(t(spec.nameKey))
      .setDesc(t(spec.descKey))
      .addButton((btn) =>
        btn.setButtonText(t("settings.nav.openBtn")).onClick(() => onSelectMode(spec.mode))
      );
  }
}

export function renderJumpSection(
  parent: HTMLElement,
  activeMode: JumpSubPage | null,
  host: GeneralSettingsHost,
  callbacks: JumpSectionCallbacks
): () => void {
  if (!activeMode) {
    renderSubPageHeader(parent, t("settings.nav.jump"), callbacks.onBackHome);
    renderJumpHubPage(parent, callbacks.onSelectMode);
    return () => {};
  }

  const spec = JUMP_MODE_SPECS.find((s) => s.mode === activeMode) ?? JUMP_MODE_SPECS[0];
  renderSubPageHeader(
    parent,
    t(spec.nameKey),
    callbacks.onBackToHub,
    t("settings.jump.backToHub")
  );

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
    onOpenTriggerEditor: callbacks.onOpenTriggerEditor,
  });
}
