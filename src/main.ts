import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import * as obsidianApi from "obsidian";
import { MarkdownView, Notice, Platform, Plugin, moment } from "obsidian";
import { createOddBarHighlightExtension, refreshOddBarsEffect } from "./editor/oddBarHighlight";
import { createSmartBackspaceExtension } from "./editor/smartBackspace";
import { createSmartInputExtension } from "./editor/smartInput";
import { createSmartJumpExtension } from "./editor/smartJump";
import { resolveAppLocale, setLocale, t } from "./i18n";
import { resolveFeatureKeybind } from "./input/keybindUtils";
import { DEFAULT_PLUGIN_SETTINGS, PluginSettings } from "./input/types";
import { RuleStore } from "./settings/ruleStore";
import { StructLatexSettingTab } from "./settings/settingTab";

export function detectObsidianLanguage(): string {
  const maybeGetLang = (obsidianApi as { getLanguage?: () => string }).getLanguage;
  if (typeof maybeGetLang === "function") {
    const lang = maybeGetLang();
    if (lang) return lang;
  }
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage?.getItem("language");
      if (stored) return stored;
    } catch {
      // Ignore storage access errors in restricted contexts
    }
  }
  return moment?.locale?.() || "en";
}

export default class StructLatexPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_PLUGIN_SETTINGS };
  ruleStore!: RuleStore;
  private editorExtensions: Extension[] = [];
  private lastJsErrorAt = 0;

  syncLocale(): void {
    setLocale(resolveAppLocale(this.settings.language, detectObsidianLanguage()));
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.syncLocale();

    this.ruleStore = new RuleStore(this.app, this.manifest);
    const { loadError } = await this.ruleStore.load();
    if (loadError) {
      new Notice(t("notice.loadError", { err: loadError }));
    }

    this.editorExtensions.push(
      createSmartBackspaceExtension({
        isEnabled: () => this.settings.smartBackspaceEnabled,
        getKeybind: () => this.settings.smartBackspaceKey,
        getParseAmbiguousBars: () => this.settings.parseAmbiguousBars,
        isMac: Platform.isMacOS,
      }),
      createSmartJumpExtension({
        isEnabled: () => this.settings.smartJumpEnabled,
        getKeybind: () => this.settings.smartJumpKey,
        getParseAmbiguousBars: () => this.settings.parseAmbiguousBars,
        isMac: Platform.isMacOS,
      }),
      createSmartInputExtension({
        isEnabled: () => this.settings.smartInputEnabled,
        getCompiledRules: () => this.ruleStore.getCompiled(),
        getDialect: () => this.settings.outputDialect,
        getParseAmbiguousBars: () => this.settings.parseAmbiguousBars,
        isMac: Platform.isMacOS,
        onJsError: (rule, message) => {
          const now = Date.now();
          if (now - this.lastJsErrorAt > 4000) {
            this.lastJsErrorAt = now;
            new Notice(t("notice.jsError", { name: rule.name, message }));
          }
        },
      }),
      createOddBarHighlightExtension({
        isEnabled: () => this.settings.parseAmbiguousBars,
      })
    );

    this.registerEditorExtension(this.editorExtensions);
    this.addSettingTab(new StructLatexSettingTab(this.app, this));
  }

  onSpecialSettingsChanged(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      const cm = (leaf.view.editor as unknown as { cm?: EditorView })?.cm;
      cm?.dispatch({ effects: refreshOddBarsEffect.of(null) });
    });
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = { ...DEFAULT_PLUGIN_SETTINGS, ...(loaded ?? {}) };
    this.settings.smartBackspaceKey = resolveFeatureKeybind(
      this.settings.smartBackspaceKey,
      DEFAULT_PLUGIN_SETTINGS.smartBackspaceKey
    );
    this.settings.smartJumpKey = resolveFeatureKeybind(
      this.settings.smartJumpKey,
      DEFAULT_PLUGIN_SETTINGS.smartJumpKey
    );
    this.settings.parseAmbiguousBars =
      typeof loaded?.parseAmbiguousBars === "boolean"
        ? loaded.parseAmbiguousBars
        : DEFAULT_PLUGIN_SETTINGS.parseAmbiguousBars;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onunload(): void {
    this.editorExtensions.length = 0;
  }
}
