import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { getLocale, Locale, t } from "../i18n";
import { TriggerCategory, TriggerRule } from "../input/triggerTypes";
import { InputRule, PluginSettings } from "../input/types";
import { renderRuleEditorView } from "./ruleEditorView";
import { InlinePanelMode, renderInlineActionPanel } from "./ruleInlinePanels";
import { RuleStore } from "./ruleStore";
import { renderAboutPage, renderSpecialSettingsPage } from "./settingAboutAndSpecial";
import {
  renderAddRuleSetting,
  renderFeatureCategoryPage,
  renderSettingsHomePage,
  renderSmartInputSettings,
  renderSubPageHeader,
  SettingsPage,
  SettingsSubPage,
} from "./settingGeneralSection";
import { JumpSubPage, renderJumpSection } from "./settingJumpSection";
import { RuleListController } from "./settingRuleList";
import { createDraftRule, renderFilterToolbar, ToolbarHandle } from "./settingToolbar";
import { renderTriggerRuleEditorView } from "./triggerRowAndEditor";
import { TriggerStore } from "./triggerStore";

export interface StructLatexSettingHost extends Plugin {
  settings: PluginSettings;
  ruleStore: RuleStore;
  triggerStore: TriggerStore;
  saveSettings(): Promise<void>;
  syncLocale(): Locale;
  onLanguageUpdated?: () => Promise<void>;
  onSpecialSettingsChanged?: () => void;
}

export class StructLatexSettingTab extends PluginSettingTab {
  private activePage: SettingsPage = "home";
  private activeJumpMode: JumpSubPage | null = null;
  private homeViewEl: HTMLElement | null = null;
  private subPageEl: HTMLElement | null = null;
  private editorViewEl: HTMLElement | null = null;
  private inlinePanelEl: HTMLElement | null = null;
  private addRuleSetting: Setting | null = null;
  private toolbarHandle: ToolbarHandle | null = null;
  private activeInlinePanel: InlinePanelMode | null = null;
  private disposeSubPage: (() => void) | null = null;
  private disposeEditor: (() => void) | null = null;
  private savedScrollTop = 0;
  private readonly ruleList: RuleListController;

  constructor(app: App, private readonly host: StructLatexSettingHost) {
    super(app, host);
    this.ruleList = new RuleListController({
      ruleStore: host.ruleStore,
      getDialect: () => host.settings.outputDialect,
      getParseAmbiguousBars: () => host.settings.parseAmbiguousBars,
      onOpenEditor: (rule, isNew) => this.openRuleEditor(rule, isNew),
      onRulesChanged: () => this.refreshAfterRulesMutation(),
    });
  }

  private scrollToY(top = 0): number {
    const win = this.containerEl.ownerDocument.defaultView ?? window;
    for (let cur: HTMLElement | null = this.containerEl; cur; cur = cur.parentElement) {
      const overflowY = win.getComputedStyle(cur).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        const prev = cur.scrollTop;
        cur.scrollTop = top;
        return prev;
      }
    }
    return 0;
  }

  private clearSubPageState(): void {
    this.disposeSubPage?.();
    this.disposeSubPage = null;
    this.ruleList.destroy();
    this.activeInlinePanel = null;
    this.inlinePanelEl = null;
    this.addRuleSetting = null;
    this.toolbarHandle = null;
  }

  private resetTransientState(): void {
    this.clearSubPageState();
    this.disposeEditor?.();
    this.disposeEditor = null;
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
        await this.host.ruleStore.resetToDefaults(getLocale());
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
    this.subPageEl?.removeClass("struct-latex-hidden");
    this.scrollToY(this.savedScrollTop);
  }

  private mountEditorView(renderFn: (hostEl: HTMLElement) => () => void): void {
    if (!this.subPageEl || !this.editorViewEl) return;
    this.savedScrollTop = this.scrollToY(0);
    this.subPageEl.addClass("struct-latex-hidden");
    this.editorViewEl.removeClass("struct-latex-hidden");
    this.disposeEditor?.();
    this.disposeEditor = renderFn(this.editorViewEl);
  }

  private openRuleEditor(target: InputRule, isNew: boolean): void {
    this.closeInlinePanel();
    this.mountEditorView((el) =>
      renderRuleEditorView(el, {
        rule: target,
        dialect: this.host.settings.outputDialect,
        parseAmbiguousBars: this.host.settings.parseAmbiguousBars,
        isNew,
        onSave: async (saved) => {
          await this.ruleList.upsertAndSaveRule(saved, isNew);
          this.closeRuleEditor();
          this.refreshAfterRulesMutation();
        },
        onCancel: () => this.closeRuleEditor(),
      })
    );
  }

  private openTriggerEditor(
    target: TriggerRule,
    category: TriggerCategory,
    isNew: boolean,
    onSaved: (saved: TriggerRule, isNew: boolean) => Promise<void>
  ): void {
    this.mountEditorView((el) =>
      renderTriggerRuleEditorView(el, {
        rule: target,
        category,
        parseAmbiguousBars: this.host.settings.parseAmbiguousBars,
        isNew,
        onSave: async (saved) => {
          await onSaved(saved, isNew);
          this.closeRuleEditor();
        },
        onCancel: () => this.closeRuleEditor(),
      })
    );
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

  private openSubPage(page: SettingsSubPage): void {
    if (!this.homeViewEl || !this.subPageEl) return;
    this.activePage = page;
    this.homeViewEl.addClass("struct-latex-hidden");
    this.subPageEl.removeClass("struct-latex-hidden");
    this.renderSubPage(page);
    this.scrollToY(0);
  }

  private backToHome(): void {
    this.clearSubPageState();
    this.ruleList.pendingNewTextDraft = null;
    this.activeJumpMode = null;
    this.activePage = "home";
    this.subPageEl?.empty();
    this.subPageEl?.addClass("struct-latex-hidden");
    this.homeViewEl?.removeClass("struct-latex-hidden");
    this.scrollToY(0);
  }

  private renderInputSubPage(container: HTMLElement): void {
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
      onAddText: () => { this.closeInlinePanel(); this.ruleList.startNewTextDraft(); },
      onAddRegex: () => this.openRuleEditor(createDraftRule("regex"), true),
      onAddJs: () => this.openRuleEditor(createDraftRule("js"), true),
    });
    this.toolbarHandle = renderFilterToolbar(container, rules, this.ruleList.filter, () => this.ruleList.render(), {
      onExport: () => this.toggleInlinePanel("export"),
      onImport: () => this.toggleInlinePanel("import"),
      onReset: () => this.toggleInlinePanel("reset"),
    });
    this.inlinePanelEl = container.createDiv();
    this.ruleList.setContainer(container.createDiv({ cls: "struct-latex-rule-list" }));
    this.ruleList.render();
  }

  private renderSubPage(page: SettingsSubPage): void {
    const container = this.subPageEl;
    if (!container) return;
    this.clearSubPageState();
    container.empty();
    const openTrig = (r: TriggerRule, c: TriggerCategory, n: boolean, s: (sr: TriggerRule, sn: boolean) => Promise<void>) =>
      this.openTriggerEditor(r, c, n, s);

    if (page === "jump") {
      this.disposeSubPage = renderJumpSection(container, this.activeJumpMode, this.host, {
        onBackHome: () => this.backToHome(),
        onSelectMode: (mode) => { this.activeJumpMode = mode; this.renderSubPage("jump"); },
        onBackToHub: () => { this.activeJumpMode = null; this.renderSubPage("jump"); },
        onOpenTriggerEditor: openTrig,
      });
      return;
    }

    renderSubPageHeader(container, t(`settings.nav.${page}` as const), () => this.backToHome());
    if (page === "input") this.renderInputSubPage(container);
    else if (page === "delete") this.disposeSubPage = renderFeatureCategoryPage(container, page, this.host, openTrig);
    else if (page === "special") renderSpecialSettingsPage(container, this.host);
    else renderAboutPage(container, this.host.manifest);
  }

  display(): void {
    const { containerEl } = this;
    this.resetTransientState();
    containerEl.empty();

    this.homeViewEl = containerEl.createDiv({ cls: "struct-latex-home-view" });
    this.subPageEl = containerEl.createDiv({ cls: "struct-latex-subpage-view struct-latex-hidden" });
    this.editorViewEl = containerEl.createDiv({ cls: "struct-latex-hidden" });

    new Setting(this.homeViewEl).setName(t("settings.title")).setHeading();
    renderSettingsHomePage(this.homeViewEl, this.host, {
      onLanguageChanged: () => this.display(),
      onOpenPage: (page) => this.openSubPage(page),
    });

    if (this.activePage !== "home") {
      this.openSubPage(this.activePage);
    }
  }

  hide(): void {
    this.resetTransientState();
    this.ruleList.pendingNewTextDraft = null;
    this.activeJumpMode = null;
    this.activePage = "home";
  }
}
