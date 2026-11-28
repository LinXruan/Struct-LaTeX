import { App, Notice, Platform, PluginManifest, setIcon, Setting } from "obsidian";
import { t } from "../i18n";
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
import { createSettingCard } from "./settingNavComponents";
import { renderTriggerRulesSection } from "./settingTriggerList";
import { TriggerStore } from "./triggerStore";

export type SettingsSubPage = "input" | "delete" | "jump" | "special" | "about";
export type SettingsPage = "home" | SettingsSubPage;

export interface GeneralSettingsHost {
  app: App;
  manifest?: PluginManifest;
  settings: PluginSettings;
  ruleStore?: { getRules(): readonly unknown[] };
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

/**
 * Renders the top Smart Input toggle & output dialect card.
 */
export function renderSmartInputSettings(
  parent: HTMLElement,
  host: GeneralSettingsHost,
  onDialectChanged: () => void
): void {
  const card = createSettingCard(parent);

  new Setting(card)
    .setName(t("settings.smartInput.name"))
    .setDesc(t("settings.smartInput.desc"))
    .addToggle((tToggle) =>
      tToggle.setValue(host.settings.smartInputEnabled).onChange(async (v) => {
        host.settings.smartInputEnabled = v;
        await host.saveSettings();
      })
    );

  new Setting(card)
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

function renderMobileToolbarSection(parent: HTMLElement, app: App | undefined, category: TriggerCategory): void {
  if (!app) return;
  const fullCmdId = getFullCommandIdForCategory(category);
  new Setting(parent)
    .setName(t("trigger.mobileToolbar.name"))
    .setDesc(t("trigger.mobileToolbar.desc"))
    .addToggle((toggle) => {
      toggle.setValue(isCommandInMobileToolbar(app, fullCmdId));
      toggle.onChange((checked) => {
        if (checked) {
          addCommandToMobileToolbar(app, fullCmdId);
          new Notice(t("trigger.mobileToolbar.addedNotice"));
        } else {
          removeCommandFromMobileToolbar(app, fullCmdId);
          new Notice(t("trigger.mobileToolbar.removedNotice"));
        }
        toggle.setValue(isCommandInMobileToolbar(app, fullCmdId));
      });
    });
}

/**
 * Renders the grouped feature settings card (toggle, keybind, mobile toolbar toggle)
 * followed by its input trigger rules list.
 */
export function renderKeybindFeaturePage(parent: HTMLElement, options: KeybindFeaturePageOptions): () => void {
  const card = createSettingCard(parent);

  new Setting(card)
    .setName(options.toggleName)
    .setDesc(options.toggleDesc)
    .addToggle((toggle) => toggle.setValue(options.enabled).onChange(async (v) => options.onToggle(v)));

  let inputEl: HTMLInputElement | null = null;
  let lastValid = resolveFeatureKeybind(options.keybindValue, options.defaultKeybind);

  const keySetting = new Setting(card)
    .setName(t("settings.keybind.name"))
    .setDesc(t("settings.keybind.desc"))
    .setClass("struct-latex-keybind-setting")
    .addText((text) => {
      text.setPlaceholder(options.keybindPlaceholder ?? options.defaultKeybind).setValue(lastValid);
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

  const recBtn = keySetting.controlEl.createEl("button", {
    type: "button",
    cls: "struct-latex-keybind-rec-btn",
    text: t("settings.keybind.recordShort"),
  });
  const disposeRecorder = attachKeyRecorder(
    recBtn,
    Platform.isMacOS,
    (combo) => void commitKeybind(combo, true),
    keyboardEventToCombo,
    false,
    t("settings.keybind.recordShort")
  );

  const resetBtn = keySetting.controlEl.createEl("button", {
    type: "button",
    cls: "clickable-icon struct-latex-keybind-reset-btn",
  });
  setIcon(resetBtn, "rotate-ccw");
  const resetTip = t("settings.keybind.resetTooltip");
  resetBtn.setAttr("aria-label", resetTip);
  resetBtn.setAttr("title", resetTip);
  resetBtn.addEventListener("click", () => {
    disposeRecorder();
    void commitKeybind(options.defaultKeybind, true);
  });

  renderMobileToolbarSection(card, options.app, options.category);

  let disposeTriggerList = () => {};
  if (options.triggerStore && options.onOpenTriggerEditor && options.app) {
    const openEditor = options.onOpenTriggerEditor;
    disposeTriggerList = renderTriggerRulesSection(parent, {
      app: options.app,
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
