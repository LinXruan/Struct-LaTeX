import { Extension } from "@codemirror/state";
import { Notice, Platform, Plugin } from "obsidian";
import { createSmartBackspaceExtension } from "./editor/smartBackspace";
import { createSmartInputExtension } from "./editor/smartInput";
import { createSmartJumpExtension } from "./editor/smartJump";
import { DEFAULT_PLUGIN_SETTINGS, PluginSettings } from "./input/types";
import { RuleStore } from "./settings/ruleStore";
import { StructLatexSettingTab } from "./settings/settingTab";

export default class StructLatexPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_PLUGIN_SETTINGS };
  ruleStore!: RuleStore;
  private editorExtensions: Extension[] = [];
  private lastJsErrorAt = 0;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.ruleStore = new RuleStore(this.app, this.manifest);
    const { loadError } = await this.ruleStore.load();
    if (loadError) {
      new Notice(`Struct LaTeX: ${loadError}`);
    }

    this.editorExtensions.push(
      createSmartInputExtension({
        isEnabled: () => this.settings.smartInputEnabled,
        getCompiledRules: () => this.ruleStore.getCompiled(),
        getDialect: () => this.settings.outputDialect,
        isMac: Platform.isMacOS,
        onJsError: (rule, message) => {
          const now = Date.now();
          if (now - this.lastJsErrorAt > 4000) {
            this.lastJsErrorAt = now;
            new Notice(`Struct LaTeX JS 规则 [${rule.name}] 执行异常: ${message}`);
          }
        },
      }),
      createSmartBackspaceExtension(() => this.settings.smartBackspaceEnabled),
      createSmartJumpExtension(() => this.settings.smartJumpEnabled)
    );

    this.registerEditorExtension(this.editorExtensions);
    this.addSettingTab(new StructLatexSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = { ...DEFAULT_PLUGIN_SETTINGS, ...(loaded ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onunload(): void {
    this.editorExtensions.length = 0;
  }
}
