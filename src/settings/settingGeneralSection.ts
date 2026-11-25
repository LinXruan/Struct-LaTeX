import { App, Notice, Platform, Setting } from "obsidian";
import { LanguageSetting, t } from "../i18n";
import { keyboardEventToCombo, normalizeKeyCombo, resolveFeatureKeybind } from "../input/keybindUtils";
import { TriggerCategory, TriggerRule } from "../input/triggerTypes";
import { DEFAULT_PLUGIN_SETTINGS, OutputDialect, PluginSettings } from "../input/types";
import {
  addCommandToMobileToolbar,
  getFullCommandIdForCategory,
  isCommandInMobileToolbar,
  removeCommandFromMobileToolbar,
} from "./mobileToolbarSync";
import { attachKeyRecorder } from "./ruleInlinePanels";
import { renderTriggerRulesSection } from "./settingTriggerList";
import { TriggerStore } from "./triggerStore";

export type SettingsSubPage = "input" | "delete" | "jump" | "special" | "about";
export type SettingsPage = "home" | SettingsSubPage;

export interface GeneralSettingsHost {
  app: App;
  settings: PluginSettings;
  triggerStore?: TriggerStore;
  saveSettings(): Promise<void>;
  syncLocale(): void;
  onLanguageUpdated?: () => Promise<void>;
  onSpecialSettingsChanged?: () => void;
}

export interface KeybindFeaturePageOptions {
  category: TriggerCategory;
  app?: App;
  triggerStore?: TriggerStore;
  toggleName: string;
  toggleDesc: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
  keybindValue: string;
  defaultKeybind: string;
  allowEmpty?: boolean;
  keybindPlaceholder?: string;
  onKeybindCommit: (normalized: string) => Promise<void>;
  onOpenTriggerEditor?: (
    rule: TriggerRule,
    category: TriggerCategory,
    isNew: boolean,
    onSaved: (rule: TriggerRule, isNew: boolean) => Promise<void>
  ) => void;
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
          if (host.onLanguageUpdated) await host.onLanguageUpdated();
          else host.syncLocale();
          onLanguageChanged();
        })
    );
}

export function renderSettingsHomePage(
  parent: HTMLElement,
  host: GeneralSettingsHost,
  callbacks: { onLanguageChanged: () => void; onOpenPage: (page: SettingsSubPage) => void }
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
      .addButton((btn) => btn.setButtonText(t("settings.nav.openBtn")).onClick(() => callbacks.onOpenPage(item.page)));
  }
}

export function renderSubPageHeader(
  parent: HTMLElement,
  title: string,
  onBack: () => void,
  backText?: string
): void {
  const header = parent.createDiv({ cls: "struct-latex-subpage-header" });
  header
    .createEl("button", { cls: "struct-latex-editor-back-btn", text: backText ?? t("settings.nav.backHome") })
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
  callbacks: { onAddText: () => void; onAddRegex: () => void; onAddJs: () => void }
): Setting {
  return new Setting(parent)
    .setName(t("settings.addRule.name"))
    .setDesc(t("settings.addRule.desc", { path: filePath, count: ruleCount }))
    .addButton((b) => b.setButtonText(t("settings.addText")).onClick(callbacks.onAddText))
    .addButton((b) => b.setButtonText(t("settings.addRegex")).onClick(callbacks.onAddRegex))
    .addButton((b) => b.setButtonText(t("settings.addJs")).onClick(callbacks.onAddJs));
}

function renderMobileToolbarSection(parent: HTMLElement, app: App | undefined, category: TriggerCategory): void {
  if (!app) return;
  const fullCmdId = getFullCommandIdForCategory(category);
  const setting = new Setting(parent)
    .setName(t("trigger.mobileToolbar.name"))
    .setDesc(t("trigger.mobileToolbar.desc"));
  const btn = setting.controlEl.createEl("button");
  const syncUi = () => {
    const added = isCommandInMobileToolbar(app, fullCmdId);
    btn.setText(added ? t("trigger.mobileToolbar.removeBtn") : t("trigger.mobileToolbar.addBtn"));
    btn.toggleClass("mod-cta", !added);
  };
  syncUi();
  btn.addEventListener("click", () => {
    if (isCommandInMobileToolbar(app, fullCmdId)) {
      removeCommandFromMobileToolbar(app, fullCmdId);
      new Notice(t("trigger.mobileToolbar.removedNotice"));
    } else {
      addCommandToMobileToolbar(app, fullCmdId);
      new Notice(t("trigger.mobileToolbar.addedNotice"));
    }
    syncUi();
  });
}

export function renderKeybindFeaturePage(parent: HTMLElement, options: KeybindFeaturePageOptions): () => void {
  new Setting(parent)
    .setName(options.toggleName)
    .setDesc(options.toggleDesc)
    .addToggle((toggle) => toggle.setValue(options.enabled).onChange(async (v) => options.onToggle(v)));

  let inputEl: HTMLInputElement | null = null;
  let lastValid = resolveFeatureKeybind(options.keybindValue, options.defaultKeybind);

  const keySetting = new Setting(parent)
    .setName(t("settings.keybind.name"))
    .setDesc(t("settings.keybind.desc"))
    .addText((text) => {
      text
        .setPlaceholder(options.keybindPlaceholder ?? options.defaultKeybind)
        .setValue(lastValid);
      inputEl = text.inputEl;
      inputEl.addClass("struct-latex-keybind-input");
      text.onChange((val) => void commitKeybind(val, false));
    });

  const errEl = parent.createDiv({ cls: "struct-latex-field-error struct-latex-hidden" });

  const setError = (msg: string | null) => {
    if (!msg) {
      errEl.empty();
      errEl.addClass("struct-latex-hidden");
      return;
    }
    errEl.removeClass("struct-latex-hidden");
    errEl.setText(msg);
  };
  const commitKeybind = async (raw: string, syncInput: boolean) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (!options.allowEmpty) return setError(t("settings.keybind.invalid"));
      setError(null);
      lastValid = "";
      if (syncInput && inputEl) inputEl.value = "";
      await options.onKeybindCommit("");
      return;
    }
    const normalized = normalizeKeyCombo(trimmed);
    if (!normalized) return setError(t("settings.keybind.invalid"));
    setError(null);
    lastValid = normalized;
    if (syncInput && inputEl) inputEl.value = normalized;
    await options.onKeybindCommit(normalized);
  };
  if (inputEl) {
    const el: HTMLInputElement = inputEl;
    el.addEventListener("blur", () => {
      const trimmed = el.value.trim();
      if (!trimmed && !options.allowEmpty) {
        el.value = lastValid;
        return setError(null);
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
    (combo) => void commitKeybind(combo, true),
    keyboardEventToCombo,
    false
  );
  const resetBtn = keySetting.controlEl.createEl("button", { text: t("settings.keybind.resetDefault") });
  resetBtn.addEventListener("click", () => {
    disposeRecorder();
    void commitKeybind(options.defaultKeybind, true);
  });

  renderMobileToolbarSection(parent, options.app, options.category);

  let disposeTriggerList = () => {};
  if (options.triggerStore && options.onOpenTriggerEditor) {
    const openEditor = options.onOpenTriggerEditor;
    disposeTriggerList = renderTriggerRulesSection(parent, {
      category: options.category,
      triggerStore: options.triggerStore,
      onOpenEditor: (rule, isNew, onSaved) => openEditor(rule, options.category, isNew, onSaved),
    });
  }

  return () => {
    disposeRecorder();
    disposeTriggerList();
  };
}

export function renderFeatureCategoryPage(
  parent: HTMLElement,
  _category: "delete",
  host: GeneralSettingsHost,
  onOpenTriggerEditor?: KeybindFeaturePageOptions["onOpenTriggerEditor"]
): () => void {
  return renderKeybindFeaturePage(parent, {
    category: "delete",
    app: host.app,
    triggerStore: host.triggerStore,
    toggleName: t("settings.smartBackspace.name"),
    toggleDesc: t("settings.smartBackspace.desc"),
    enabled: host.settings.smartBackspaceEnabled,
    onToggle: async (v) => {
      host.settings.smartBackspaceEnabled = v;
      await host.saveSettings();
    },
    keybindValue: host.settings.smartBackspaceKey,
    defaultKeybind: DEFAULT_PLUGIN_SETTINGS.smartBackspaceKey,
    onKeybindCommit: async (normalized) => {
      host.settings.smartBackspaceKey = normalized;
      await host.saveSettings();
    },
    onOpenTriggerEditor,
  });
}
