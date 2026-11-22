import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { t } from "../i18n";
import { InputRule, PluginSettings } from "../input/types";
import { renderRuleEditorView } from "./ruleEditorView";
import { InlinePanelMode, renderInlineActionPanel } from "./ruleInlinePanels";
import { RuleStore } from "./ruleStore";
import {
  renderAddRuleSetting,
  renderCategoryTabs,
  renderFeatureCategoryPage,
  renderLanguageSetting,
  renderSmartInputSettings,
  SettingsCategory,
} from "./settingGeneralSection";
import { RuleListController } from "./settingRuleList";
import { createDraftRule, renderFilterToolbar, ToolbarHandle } from "./settingToolbar";

export interface StructLatexSettingHost extends Plugin {
  settings: PluginSettings;
  ruleStore: RuleStore;
  saveSettings(): Promise<void>;
  syncLocale(): void;
}

export class StructLatexSettingTab extends PluginSettingTab {
  private activeCategory: SettingsCategory = "input";
  private mainViewEl: HTMLElement | null = null;
  private tabContentEl: HTMLElement | null = null;
  private editorViewEl: HTMLElement | null = null;
  private inlinePanelEl: HTMLElement | null = null;
  private addRuleSetting: Setting | null = null;
  private toolbarHandle: ToolbarHandle | null = null;
  private syncCategoryTabs: ((next: SettingsCategory) => void) | null = null;
  private activeInlinePanel: InlinePanelMode | null = null;
  private disposeTab: (() => void) | null = null;
  private disposeEditor: (() => void) | null = null;
  private savedScrollTop = 0;
  private readonly ruleList: RuleListController;

  constructor(app: App, private readonly host: StructLatexSettingHost) {
    super(app, host);
    this.ruleList = new RuleListController({
      ruleStore: host.ruleStore,
      getDialect: () => host.settings.outputDialect,
      onOpenEditor: (rule, isNew) => this.openRuleEditor(rule, isNew),
      onRulesChanged: () => this.refreshAfterRulesMutation(),
    });
  }

  private findScrollAncestor(startEl: HTMLElement | null): HTMLElement | null {
    const win = this.containerEl.ownerDocument.defaultView ?? window;
    for (let cur = startEl; cur; cur = cur.parentElement) {
      const overflowY = win.getComputedStyle(cur).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return cur;
    }
    return null;
  }

  private clearInputTabRefs(): void {
    this.ruleList.destroy();
    this.activeInlinePanel = null;
    this.inlinePanelEl = null;
    this.addRuleSetting = null;
    this.toolbarHandle = null;
  }

  private resetTransientState(): void {
    this.disposeTab?.();
    this.disposeTab = null;
    this.disposeEditor?.();
    this.disposeEditor = null;
    this.clearInputTabRefs();
  }

  private closeInlinePanel(): void {
    this.activeInlinePanel = null;
    this.inlinePanelEl?.empty();
    this.toolbarHandle?.syncActivePanel(null);
  }

  private toggleInlinePanel(mode: InlinePanelMode): void {
    if (!this.inlinePanelEl) return;
    if (this.activeInlinePanel === mode) {
      this.closeInlinePanel();
      return;
    }
    this.activeInlinePanel = mode;
    this.toolbarHandle?.syncActivePanel(mode);
    renderInlineActionPanel(this.inlinePanelEl, mode, {
      getExportJson: () => this.host.ruleStore.exportJson(),
      onImport: async (raw) => {
        await this.host.ruleStore.importJson(raw);
        this.refreshAfterRulesMutation();
      },
      onReset: async () => {
        await this.host.ruleStore.resetToDefaults();
        this.ruleList.pendingNewTextDraft = null;
        this.refreshAfterRulesMutation();
      },
      onClose: () => this.closeInlinePanel(),
    });
  }

  private closeRuleEditor(): void {
    this.disposeEditor?.();
    this.disposeEditor = null;
    this.editorViewEl?.empty();
    this.editorViewEl?.addClass("struct-latex-hidden");
    this.mainViewEl?.removeClass("struct-latex-hidden");
    const scroller = this.findScrollAncestor(this.containerEl);
    if (scroller) scroller.scrollTop = this.savedScrollTop;
  }

  private openRuleEditor(target: InputRule, isNew: boolean): void {
    if (!this.mainViewEl || !this.editorViewEl) return;
    this.closeInlinePanel();
    const scroller = this.findScrollAncestor(this.containerEl);
    this.savedScrollTop = scroller ? scroller.scrollTop : 0;

    this.mainViewEl.addClass("struct-latex-hidden");
    this.editorViewEl.removeClass("struct-latex-hidden");
    this.disposeEditor?.();
    this.disposeEditor = renderRuleEditorView(this.editorViewEl, {
      rule: target,
      dialect: this.host.settings.outputDialect,
      isNew,
      onSave: async (saved) => {
        await this.ruleList.upsertAndSaveRule(saved, isNew);
        this.closeRuleEditor();
        this.refreshAfterRulesMutation();
      },
      onCancel: () => this.closeRuleEditor(),
    });
    if (scroller) scroller.scrollTop = 0;
  }

  private refreshAfterRulesMutation(): void {
    const rules = this.host.ruleStore.getRules();
    this.addRuleSetting?.setDesc(
      t("settings.addRule.desc", { path: this.host.ruleStore.filePath, count: rules.length })
    );
    this.toolbarHandle?.syncGroups(rules);
    this.ruleList.pruneCache();
    this.ruleList.render();
  }

  private renderActiveCategory(): void {
    const container = this.tabContentEl;
    if (!container) return;

    this.disposeTab?.();
    this.disposeTab = null;
    this.clearInputTabRefs();
    container.empty();

    if (this.activeCategory === "delete" || this.activeCategory === "jump") {
      this.disposeTab = renderFeatureCategoryPage(container, this.activeCategory, this.host);
      return;
    }

    renderSmartInputSettings(container, this.host, () => {
      this.ruleList.clearCache();
      this.ruleList.render();
    });

    const loadErr = this.host.ruleStore.getLoadError();
    if (loadErr) {
      container.createDiv({ cls: "struct-latex-modal-error", text: t("settings.loadError", { err: loadErr }) });
    }

    const rules = this.host.ruleStore.getRules();
    this.addRuleSetting = renderAddRuleSetting(container, this.host.ruleStore.filePath, rules.length, {
      onAddText: () => {
        this.closeInlinePanel();
        this.ruleList.startNewTextDraft();
      },
      onAddRegex: () => this.openRuleEditor(createDraftRule("regex"), true),
      onAddJs: () => this.openRuleEditor(createDraftRule("js"), true),
    });

    this.toolbarHandle = renderFilterToolbar(container, rules, this.ruleList.filter, () => this.ruleList.render(), {
      onExport: () => this.toggleInlinePanel("export"),
      onImport: () => this.toggleInlinePanel("import"),
      onReset: () => this.toggleInlinePanel("reset"),
    });

    this.inlinePanelEl = container.createDiv();
    const listEl = container.createDiv({ cls: "struct-latex-rule-list" });
    this.ruleList.setContainer(listEl);
    this.ruleList.render();
  }

  display(): void {
    const { containerEl } = this;
    this.resetTransientState();
    containerEl.empty();

    this.mainViewEl = containerEl.createDiv({ cls: "struct-latex-main-view" });
    this.editorViewEl = containerEl.createDiv({ cls: "struct-latex-hidden" });

    this.mainViewEl.createEl("h2", { text: t("settings.title") });
    renderLanguageSetting(this.mainViewEl, this.host, () => this.display());
    this.syncCategoryTabs = renderCategoryTabs(this.mainViewEl, this.activeCategory, (next) => {
      if (this.activeCategory === next) return;
      this.activeCategory = next;
      this.syncCategoryTabs?.(next);
      this.renderActiveCategory();
    });

    this.tabContentEl = this.mainViewEl.createDiv({ cls: "struct-latex-tab-content" });
    this.renderActiveCategory();
  }

  hide(): void {
    this.resetTransientState();
    this.ruleList.pendingNewTextDraft = null;
  }
}
