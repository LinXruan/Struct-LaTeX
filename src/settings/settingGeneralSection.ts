import { Platform, Setting } from "obsidian";
import { LanguageSetting, t } from "../i18n";
import { keyboardEventToCombo, normalizeKeyCombo, resolveFeatureKeybind } from "../input/keybindUtils";
import { DEFAULT_PLUGIN_SETTINGS, OutputDialect, PluginSettings } from "../input/types";
import { attachKeyRecorder } from "./ruleInlinePanels";

export type SettingsSubPage = "input" | "delete" | "jump" | "special" | "about";
export type SettingsPage = "home" | SettingsSubPage;

export interface GeneralSettingsHost {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  syncLocale(): void;
  onLanguageUpdated?: () => Promise<void>;
  onSpecialSettingsChanged?: () => void;
}

export interface KeybindFeaturePageOptions {
  toggleName: string;
  toggleDesc: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
  keybindName: string;
  keybindDesc: string;
  keybindValue: string;
  defaultKeybind: string;
  onKeybindCommit: (normalized: string) => Promise<void>;
  hijackNote: string;
}

export function renderLanguageSetting(
  parent: HTMLElement,
  host: GeneralSettingsHost,
  onLanguageChanged: () => void
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
          if (host.onLanguageUpdated) {
            await host.onLanguageUpdated();
          } else {
            host.syncLocale();
          }
          onLanguageChanged();
        })
    );
}

export function renderSettingsHomePage(
  parent: HTMLElement,
  host: GeneralSettingsHost,
  callbacks: {
    onLanguageChanged: () => void;
    onOpenPage: (page: SettingsSubPage) => void;
  }
): void {
  renderLanguageSetting(parent, host, callbacks.onLanguageChanged);

  const navItems: Array<{ page: SettingsSubPage; name: string; desc: string }> = [
    { page: "input", name: t("settings.nav.input"), desc: t("settings.nav.inputDesc") },
    { page: "delete", name: t("settings.nav.delete"), desc: t("settings.nav.deleteDesc") },
    { page: "jump", name: t("settings.nav.jump"), desc: t("settings.nav.jumpDesc") },
    { page: "special", name: t("settings.nav.special"), desc: t("settings.nav.specialDesc") },
    { page: "about", name: t("settings.nav.about"), desc: t("settings.nav.aboutDesc") },
  ];

  for (const item of navItems) {
    new Setting(parent)
      .setName(item.name)
      .setDesc(item.desc)
      .addButton((btn) =>
        btn.setButtonText(t("settings.nav.openBtn")).onClick(() => callbacks.onOpenPage(item.page))
      );
  }
}

export function renderSubPageHeader(parent: HTMLElement, title: string, onBack: () => void): void {
  const header = parent.createDiv({ cls: "struct-latex-subpage-header" });
  header
    .createEl("button", { cls: "struct-latex-editor-back-btn", text: t("settings.nav.backHome") })
    .addEventListener("click", onBack);
  header.createEl("h3", { cls: "struct-latex-editor-title", text: title });
}

export function renderSmartInputSettings(
  parent: HTMLElement,
  host: GeneralSettingsHost,
  onDialectChanged: () => void
): void {
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
          onDialectChanged();
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

export function renderKeybindFeaturePage(
  parent: HTMLElement,
  options: KeybindFeaturePageOptions
): () => void {
  new Setting(parent)
    .setName(options.toggleName)
    .setDesc(options.toggleDesc)
    .addToggle((toggle) =>
      toggle.setValue(options.enabled).onChange(async (v) => {
        await options.onToggle(v);
      })
    );

  let inputEl: HTMLInputElement | null = null;
  let lastValid = resolveFeatureKeybind(options.keybindValue, options.defaultKeybind);

  const keySetting = new Setting(parent)
    .setName(options.keybindName)
    .setDesc(options.keybindDesc)
    .addText((text) => {
      text.setPlaceholder(options.defaultKeybind).setValue(lastValid);
      inputEl = text.inputEl;
      inputEl.addClass("struct-latex-keybind-input");
      text.onChange((val) => {
        void commitKeybind(val, false);
      });
    });

  const errEl = parent.createDiv({ cls: "struct-latex-field-error" });
  errEl.style.display = "none";

  const setError = (msg: string | null) => {
    if (!msg) {
      errEl.empty();
      errEl.style.display = "none";
      return;
    }
    errEl.style.display = "block";
    errEl.setText(msg);
  };

  const commitKeybind = async (raw: string, syncInput: boolean) => {
    const normalized = normalizeKeyCombo(raw.trim());
    if (!normalized) {
      setError(t("settings.keybind.invalid"));
      return;
    }
    setError(null);
    lastValid = normalized;
    if (syncInput && inputEl) inputEl.value = normalized;
    await options.onKeybindCommit(normalized);
  };

  if (inputEl) {
    const el: HTMLInputElement = inputEl;
    el.addEventListener("blur", () => {
      const trimmed = el.value.trim();
      if (!trimmed) {
        el.value = lastValid;
        setError(null);
        return;
      }
      void commitKeybind(trimmed, true);
    });
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") el.blur();
    });
  }

  const recBtn = keySetting.controlEl.createEl("button", { text: t("fields.recordKey") });
  const disposeRecorder = attachKeyRecorder(
    recBtn,
    Platform.isMacOS,
    (combo) => {
      void commitKeybind(combo, true);
    },
    keyboardEventToCombo,
    false
  );

  const resetBtn = keySetting.controlEl.createEl("button", { text: t("settings.keybind.resetDefault") });
  resetBtn.addEventListener("click", () => {
    disposeRecorder();
    void commitKeybind(options.defaultKeybind, true);
  });

  parent.createDiv({ cls: "struct-latex-hijack-note", text: options.hijackNote });
  return disposeRecorder;
}

export function renderFeatureCategoryPage(
  parent: HTMLElement,
  category: "delete" | "jump",
  host: GeneralSettingsHost
): () => void {
  const isDelete = category === "delete";
  const defaultKey = isDelete ? DEFAULT_PLUGIN_SETTINGS.smartBackspaceKey : DEFAULT_PLUGIN_SETTINGS.smartJumpKey;
  return renderKeybindFeaturePage(parent, {
    toggleName: t(isDelete ? "settings.smartBackspace.name" : "settings.smartJump.name"),
    toggleDesc: t(isDelete ? "settings.smartBackspace.desc" : "settings.smartJump.desc"),
    enabled: isDelete ? host.settings.smartBackspaceEnabled : host.settings.smartJumpEnabled,
    onToggle: async (v) => {
      if (isDelete) host.settings.smartBackspaceEnabled = v;
      else host.settings.smartJumpEnabled = v;
      await host.saveSettings();
    },
    keybindName: t(isDelete ? "settings.deleteKey.name" : "settings.jumpKey.name"),
    keybindDesc: t(isDelete ? "settings.deleteKey.desc" : "settings.jumpKey.desc"),
    keybindValue: isDelete ? host.settings.smartBackspaceKey : host.settings.smartJumpKey,
    defaultKeybind: defaultKey,
    onKeybindCommit: async (normalized) => {
      if (isDelete) host.settings.smartBackspaceKey = normalized;
      else host.settings.smartJumpKey = normalized;
      await host.saveSettings();
    },
    hijackNote: t(isDelete ? "settings.deleteKey.hijackNote" : "settings.jumpKey.hijackNote"),
  });
}
