import { Platform, Setting } from "obsidian";
import { LanguageSetting, t } from "../i18n";
import { keyboardEventToCombo, normalizeKeyCombo, resolveFeatureKeybind } from "../input/keybindUtils";
import { DEFAULT_PLUGIN_SETTINGS, OutputDialect, PluginSettings } from "../input/types";
import { attachKeyRecorder } from "./ruleInlinePanels";

export type SettingsCategory = "input" | "delete" | "jump";

export interface GeneralSettingsHost {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  syncLocale(): void;
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
          host.syncLocale();
          onLanguageChanged();
        })
    );
}

export function renderCategoryTabs(
  parent: HTMLElement,
  active: SettingsCategory,
  onSelect: (category: SettingsCategory) => void
): (nextActive: SettingsCategory) => void {
  const bar = parent.createDiv({ cls: "struct-latex-category-tabs" });
  bar.setAttr("role", "tablist");

  const items: Array<{ id: SettingsCategory; label: string }> = [
    { id: "input", label: t("settings.tab.input") },
    { id: "delete", label: t("settings.tab.delete") },
    { id: "jump", label: t("settings.tab.jump") },
  ];

  const buttons = new Map<SettingsCategory, HTMLButtonElement>();
  const syncActive = (current: SettingsCategory) => {
    for (const [id, btn] of buttons) {
      const isCurrent = id === current;
      btn.toggleClass("is-active", isCurrent);
      btn.setAttr("aria-selected", isCurrent ? "true" : "false");
    }
  };

  for (const item of items) {
    const btn = bar.createEl("button", { cls: "struct-latex-category-tab", text: item.label });
    btn.setAttr("role", "tab");
    btn.addEventListener("click", () => onSelect(item.id));
    buttons.set(item.id, btn);
  }

  syncActive(active);
  return syncActive;
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
