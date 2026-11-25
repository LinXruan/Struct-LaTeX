import { Setting } from "obsidian";
import { t } from "../i18n";
import { DEFAULT_PLUGIN_SETTINGS } from "../input/types";
import {
  GeneralSettingsHost,
  KeybindFeaturePageOptions,
  renderKeybindFeaturePage,
  renderSubPageHeader,
} from "./settingGeneralSection";

export type JumpSubPage = "rightSingle" | "rightMulti";

export interface JumpSectionCallbacks {
  onBackHome: () => void;
  onSelectMode: (mode: JumpSubPage) => void;
  onBackToHub: () => void;
  onOpenTriggerEditor?: KeybindFeaturePageOptions["onOpenTriggerEditor"];
}

function renderJumpHubPage(
  parent: HTMLElement,
  onSelectMode: (mode: JumpSubPage) => void
): void {
  const readyModes: Array<{ mode: JumpSubPage; name: string; desc: string }> = [
    {
      mode: "rightSingle",
      name: t("settings.jump.rightSingle.name"),
      desc: t("settings.jump.rightSingle.desc"),
    },
    {
      mode: "rightMulti",
      name: t("settings.jump.rightMulti.name"),
      desc: t("settings.jump.rightMulti.desc"),
    },
  ];
  for (const item of readyModes) {
    new Setting(parent)
      .setName(item.name)
      .setDesc(item.desc)
      .addButton((btn) =>
        btn.setButtonText(t("settings.nav.openBtn")).onClick(() => onSelectMode(item.mode))
      );
  }

  const reservedModes: Array<{ name: string; desc: string }> = [
    {
      name: t("settings.jump.leftSingle.name"),
      desc: t("settings.jump.leftSingle.desc"),
    },
    {
      name: t("settings.jump.leftMulti.name"),
      desc: t("settings.jump.leftMulti.desc"),
    },
  ];
  for (const item of reservedModes) {
    new Setting(parent)
      .setName(item.name)
      .setDesc(item.desc)
      .addButton((btn) =>
        btn.setButtonText(t("settings.jump.comingSoon")).setDisabled(true)
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

  const isRightMulti = activeMode === "rightMulti";
  renderSubPageHeader(
    parent,
    t(isRightMulti ? "settings.jump.rightMulti.name" : "settings.jump.rightSingle.name"),
    callbacks.onBackToHub,
    t("settings.jump.backToHub")
  );

  return renderKeybindFeaturePage(parent, {
    category: isRightMulti ? "jumpRightMulti" : "jump",
    app: host.app,
    triggerStore: host.triggerStore,
    toggleName: t(isRightMulti ? "settings.smartJumpRightMulti.name" : "settings.smartJump.name"),
    toggleDesc: t(isRightMulti ? "settings.smartJumpRightMulti.desc" : "settings.smartJump.desc"),
    enabled: isRightMulti ? host.settings.smartJumpRightMultiEnabled : host.settings.smartJumpEnabled,
    onToggle: async (v) => {
      if (isRightMulti) host.settings.smartJumpRightMultiEnabled = v;
      else host.settings.smartJumpEnabled = v;
      await host.saveSettings();
    },
    keybindValue: isRightMulti ? host.settings.smartJumpRightMultiKey : host.settings.smartJumpKey,
    defaultKeybind: isRightMulti
      ? DEFAULT_PLUGIN_SETTINGS.smartJumpRightMultiKey
      : DEFAULT_PLUGIN_SETTINGS.smartJumpKey,
    onKeybindCommit: async (normalized) => {
      if (isRightMulti) host.settings.smartJumpRightMultiKey = normalized;
      else host.settings.smartJumpKey = normalized;
      await host.saveSettings();
    },
    onOpenTriggerEditor: callbacks.onOpenTriggerEditor,
  });
}
