import { Setting } from "obsidian";
import { LanguageSetting, t } from "../i18n";
import { OutputDialect, PluginSettings } from "../input/types";

export interface GeneralSettingsHost {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  syncLocale(): void;
}

export function renderGeneralSettings(
  parent: HTMLElement,
  host: GeneralSettingsHost,
  callbacks: {
    onLanguageChanged: () => void;
    onDialectChanged: () => void;
  }
): void {
  new Setting(parent)
    .setName(t("settings.language.name"))
    .setDesc(t("settings.language.desc"))
    .addDropdown((dd) =>
      dd
        .addOption("auto", t("settings.language.auto"))
        .addOption("zh", t("settings.language.zh"))
        .addOption("en", t("settings.language.en"))
        .setValue(host.settings.language)
        .onChange(async (v) => {
          host.settings.language = v as LanguageSetting;
          await host.saveSettings();
          host.syncLocale();
          callbacks.onLanguageChanged();
        })
    );

  new Setting(parent)
    .setName(t("settings.smartInput.name"))
    .setDesc(t("settings.smartInput.desc"))
    .addToggle((tToggle) =>
      tToggle.setValue(host.settings.smartInputEnabled).onChange(async (v) => {
        host.settings.smartInputEnabled = v;
        await host.saveSettings();
      })
    );

  new Setting(parent)
    .setName(t("settings.smartBackspace.name"))
    .setDesc(t("settings.smartBackspace.desc"))
    .addToggle((tToggle) =>
      tToggle.setValue(host.settings.smartBackspaceEnabled).onChange(async (v) => {
        host.settings.smartBackspaceEnabled = v;
        await host.saveSettings();
      })
    );

  new Setting(parent)
    .setName(t("settings.smartJump.name"))
    .setDesc(t("settings.smartJump.desc"))
    .addToggle((tToggle) =>
      tToggle.setValue(host.settings.smartJumpEnabled).onChange(async (v) => {
        host.settings.smartJumpEnabled = v;
        await host.saveSettings();
      })
    );

  new Setting(parent)
    .setName(t("settings.dialect.name"))
    .setDesc(t("settings.dialect.desc"))
    .addDropdown((dd) =>
      dd
        .addOption("latex", t("settings.dialect.latex"))
        .addOption("unicode", t("settings.dialect.unicode"))
        .addOption("raw", t("settings.dialect.raw"))
        .setValue(host.settings.outputDialect)
        .onChange(async (v) => {
          host.settings.outputDialect = v as OutputDialect;
          await host.saveSettings();
          callbacks.onDialectChanged();
        })
    );
}

export function renderAddRuleSetting(
  parent: HTMLElement,
  filePath: string,
  ruleCount: number,
  callbacks: {
    onAddText: () => void;
    onAddRegex: () => void;
    onAddJs: () => void;
  }
): Setting {
  return new Setting(parent)
    .setName(t("settings.addRule.name"))
    .setDesc(t("settings.addRule.desc", { path: filePath, count: ruleCount }))
    .addButton((b) => b.setButtonText(t("settings.addText")).onClick(callbacks.onAddText))
    .addButton((b) => b.setButtonText(t("settings.addRegex")).onClick(callbacks.onAddRegex))
    .addButton((b) => b.setButtonText(t("settings.addJs")).onClick(callbacks.onAddJs));
}
