import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import * as obsidianApi from "obsidian";
import { MarkdownView, Notice, Platform, Plugin, moment } from "obsidian";
import { createAutoParenSizeExtension } from "./editor/autoDelim";
import {
  createInlineMathPreviewExtension,
  refreshInlineMathPreviewEffect,
} from "./editor/inlineMathPreview";
import { createOddBarHighlightExtension, refreshOddBarsEffect } from "./editor/oddBarHighlight";
import { createSmartBackspaceExtension, executeSmartBackspace } from "./editor/smartBackspace";
import { createSmartInputExtension } from "./editor/smartInput";
import { createSmartJumpExtension, executeSmartJump } from "./editor/smartJump";
import { Locale, resolveAppLocale, setLocale, t } from "./i18n";
import { resolveFeatureKeybind } from "./input/keybindUtils";
import { DEFAULT_PLUGIN_SETTINGS, PluginSettings } from "./input/types";
import {
  addCommandToMobileToolbar,
  SMART_BACKSPACE_COMMAND_ID,
  SMART_JUMP_COMMAND_ID,
  SMART_JUMP_FULL_CMD_ID,
  SMART_JUMP_LEFT_MULTI_COMMAND_ID,
  SMART_JUMP_LEFT_SINGLE_COMMAND_ID,
  SMART_JUMP_RIGHT_MULTI_COMMAND_ID,
} from "./settings/mobileToolbarSync";
import { RuleStore } from "./settings/ruleStore";
import { StructLatexSettingTab } from "./settings/settingTab";
import { TriggerStore } from "./settings/triggerStore";

export function detectObsidianLanguage(): string {
  const maybeGetLang = (obsidianApi as { getLanguage?: () => string }).getLanguage;
  if (typeof maybeGetLang === "function") {
    const lang = maybeGetLang();
    if (lang) return lang;
  }
  return moment?.locale?.() || "en";
}

export default class StructLatexPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_PLUGIN_SETTINGS };
  ruleStore!: RuleStore;
  triggerStore!: TriggerStore;
  private editorExtensions: Extension[] = [];
  private lastJsErrorAt = 0;

  syncLocale(): Locale {
    const locale = resolveAppLocale(this.settings.language, detectObsidianLanguage());
    setLocale(locale);
    return locale;
  }

  async onLanguageUpdated(): Promise<void> {
    const locale = this.syncLocale();
    await this.ruleStore.syncRulesForLocale(locale);
  }

  private notifyJsError(name: string, message: string): void {
    const now = Date.now();
    if (now - this.lastJsErrorAt > 4000) {
      this.lastJsErrorAt = now;
      new Notice(t("notice.jsError", { name, message }));
    }
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    const activeLocale = this.syncLocale();

    this.ruleStore = new RuleStore(this.app, this.manifest);
    this.triggerStore = new TriggerStore(this.app, this.manifest);

    const [{ loadError }, { loadError: trigErr }] = await Promise.all([
      this.ruleStore.load(activeLocale),
      this.triggerStore.load(),
    ]);
    if (loadError) {
      new Notice(t("notice.loadError", { err: loadError }));
    }
    if (trigErr) {
      new Notice(t("notice.loadError", { err: trigErr }));
    }

    const jumpConfigs = [
      {
        mode: "rightSingle" as const,
        defaultKeybind: DEFAULT_PLUGIN_SETTINGS.smartJumpKey,
        category: "jump" as const,
        cmdId: SMART_JUMP_COMMAND_ID,
        cmdNameKey: "command.smartJump" as const,
        icon: "lucide-arrow-right-to-line",
        isEnabled: () => this.settings.smartJumpEnabled,
        getKeybind: () => this.settings.smartJumpKey,
      },
      {
        mode: "rightMulti" as const,
        defaultKeybind: DEFAULT_PLUGIN_SETTINGS.smartJumpRightMultiKey,
        category: "jumpRightMulti" as const,
        cmdId: SMART_JUMP_RIGHT_MULTI_COMMAND_ID,
        cmdNameKey: "command.smartJumpRightMulti" as const,
        icon: "lucide-chevrons-right",
        isEnabled: () => this.settings.smartJumpRightMultiEnabled,
        getKeybind: () => this.settings.smartJumpRightMultiKey,
      },
      {
        mode: "leftSingle" as const,
        defaultKeybind: DEFAULT_PLUGIN_SETTINGS.smartJumpLeftSingleKey,
        category: "jumpLeftSingle" as const,
        cmdId: SMART_JUMP_LEFT_SINGLE_COMMAND_ID,
        cmdNameKey: "command.smartJumpLeftSingle" as const,
        icon: "lucide-arrow-left-to-line",
        isEnabled: () => this.settings.smartJumpLeftSingleEnabled,
        getKeybind: () => this.settings.smartJumpLeftSingleKey,
      },
      {
        mode: "leftMulti" as const,
        defaultKeybind: DEFAULT_PLUGIN_SETTINGS.smartJumpLeftMultiKey,
        category: "jumpLeftMulti" as const,
        cmdId: SMART_JUMP_LEFT_MULTI_COMMAND_ID,
        cmdNameKey: "command.smartJumpLeftMulti" as const,
        icon: "lucide-chevrons-left",
        isEnabled: () => this.settings.smartJumpLeftMultiEnabled,
        getKeybind: () => this.settings.smartJumpLeftMultiKey,
      },
    ];

    this.editorExtensions.push(
      ...jumpConfigs.map((cfg) =>
        createSmartJumpExtension({
          mode: cfg.mode,
          defaultKeybind: cfg.defaultKeybind,
          isEnabled: cfg.isEnabled,
          getKeybind: cfg.getKeybind,
          getTriggerRules: () => this.triggerStore.getCompiled(cfg.category),
          getParseAmbiguousBars: () => this.settings.parseAmbiguousBars,
          isMac: Platform.isMacOS,
          onJsError: (rule, message) => this.notifyJsError(rule.name, message),
        })
      ),
      createSmartBackspaceExtension({
        isEnabled: () => this.settings.smartBackspaceEnabled,
        getKeybind: () => this.settings.smartBackspaceKey,
        getTriggerRules: () => this.triggerStore.getCompiled("delete"),
        getParseAmbiguousBars: () => this.settings.parseAmbiguousBars,
        isMac: Platform.isMacOS,
        onJsError: (rule, message) => this.notifyJsError(rule.name, message),
      }),
      createSmartInputExtension({
        isEnabled: () => this.settings.smartInputEnabled,
        getCompiledRules: () => this.ruleStore.getCompiled(),
        getDialect: () => this.settings.outputDialect,
        getParseAmbiguousBars: () => this.settings.parseAmbiguousBars,
        isMac: Platform.isMacOS,
        onJsError: (rule, message) => this.notifyJsError(rule.name, message),
      }),
      createAutoParenSizeExtension({
        isEnabled: () => this.settings.autoSizeParens,
        getParseAmbiguousBars: () => this.settings.parseAmbiguousBars,
      }),
      createOddBarHighlightExtension({
        isEnabled: () => this.settings.parseAmbiguousBars,
      }),
      createInlineMathPreviewExtension({
        getPosition: () => this.settings.inlineMathPreview,
      })
    );

    this.registerEditorExtension(this.editorExtensions);

    for (const cfg of jumpConfigs) {
      this.addCommand({
        id: cfg.cmdId,
        name: t(cfg.cmdNameKey),
        icon: cfg.icon,
        editorCallback: (editor) => {
          if (!cfg.isEnabled()) return;
          const cm = (editor as unknown as { cm?: EditorView })?.cm;
          if (cm) executeSmartJump(cm, this.settings.parseAmbiguousBars, cfg.mode);
        },
      });
    }

    this.addCommand({
      id: SMART_BACKSPACE_COMMAND_ID,
      name: t("command.smartBackspace"),
      icon: "lucide-delete",
      editorCallback: (editor) => {
        if (!this.settings.smartBackspaceEnabled) return;
        const cm = (editor as unknown as { cm?: EditorView })?.cm;
        if (cm) executeSmartBackspace(cm, this.settings.parseAmbiguousBars);
      },
    });

    this.app.workspace.onLayoutReady(() => {
      if (!this.settings.mobileToolbarInitialized) {
        addCommandToMobileToolbar(this.app, SMART_JUMP_FULL_CMD_ID);
        this.settings.mobileToolbarInitialized = true;
        void this.saveSettings();
      }
    });

    this.addSettingTab(new StructLatexSettingTab(this.app, this));
  }

  onSpecialSettingsChanged(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!(leaf.view instanceof MarkdownView)) return;
      const cm = (leaf.view.editor as unknown as { cm?: EditorView })?.cm;
      cm?.dispatch({
        effects: [refreshOddBarsEffect.of(null), refreshInlineMathPreviewEffect.of(null)],
      });
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
    this.settings.smartJumpRightMultiEnabled =
      typeof loaded?.smartJumpRightMultiEnabled === "boolean"
        ? loaded.smartJumpRightMultiEnabled
        : DEFAULT_PLUGIN_SETTINGS.smartJumpRightMultiEnabled;
    this.settings.smartJumpRightMultiKey = resolveFeatureKeybind(
      this.settings.smartJumpRightMultiKey,
      DEFAULT_PLUGIN_SETTINGS.smartJumpRightMultiKey
    );
    this.settings.smartJumpLeftSingleEnabled =
      typeof loaded?.smartJumpLeftSingleEnabled === "boolean"
        ? loaded.smartJumpLeftSingleEnabled
        : DEFAULT_PLUGIN_SETTINGS.smartJumpLeftSingleEnabled;
    this.settings.smartJumpLeftSingleKey = resolveFeatureKeybind(
      this.settings.smartJumpLeftSingleKey,
      DEFAULT_PLUGIN_SETTINGS.smartJumpLeftSingleKey
    );
    this.settings.smartJumpLeftMultiEnabled =
      typeof loaded?.smartJumpLeftMultiEnabled === "boolean"
        ? loaded.smartJumpLeftMultiEnabled
        : DEFAULT_PLUGIN_SETTINGS.smartJumpLeftMultiEnabled;
    this.settings.smartJumpLeftMultiKey = resolveFeatureKeybind(
      this.settings.smartJumpLeftMultiKey,
      DEFAULT_PLUGIN_SETTINGS.smartJumpLeftMultiKey
    );
    this.settings.parseAmbiguousBars =
      typeof loaded?.parseAmbiguousBars === "boolean"
        ? loaded.parseAmbiguousBars
        : DEFAULT_PLUGIN_SETTINGS.parseAmbiguousBars;
    this.settings.autoSizeParens =
      typeof loaded?.autoSizeParens === "boolean"
        ? loaded.autoSizeParens
        : DEFAULT_PLUGIN_SETTINGS.autoSizeParens;
    this.settings.inlineMathPreview =
      loaded?.inlineMathPreview === "above" ||
      loaded?.inlineMathPreview === "below" ||
      loaded?.inlineMathPreview === "off"
        ? loaded.inlineMathPreview
        : DEFAULT_PLUGIN_SETTINGS.inlineMathPreview;
    this.settings.mobileToolbarInitialized =
      typeof loaded?.mobileToolbarInitialized === "boolean"
        ? loaded.mobileToolbarInitialized
        : false;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onunload(): void {
    this.editorExtensions.length = 0;
  }
}
