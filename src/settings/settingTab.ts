import { App, Platform, Plugin, PluginSettingTab, Scope, Setting } from "obsidian";
import { getLocale, Locale, t } from "../i18n";
import { TriggerCategory, TriggerRule } from "../input/triggerTypes";
import { InputRule, PluginSettings } from "../input/types";
import { openConfirmResetModal, openExportJsonModal, openImportJsonModal } from "./ruleActionModals";
import { renderRuleEditorView } from "./ruleEditorView";
import { createDraftRule } from "./ruleFilter";
import { RuleStore } from "./ruleStore";
import { renderAboutPage, renderSpecialSettingsPage } from "./settingAboutAndSpecial";
import {
  renderFeatureCategoryPage,
  renderSmartInputSettings,
  SettingsPage,
  SettingsSubPage,
} from "./settingGeneralSection";
import { renderSettingsHomePage } from "./settingHomeView";
import { getJumpModeSpec, JumpSubPage, renderJumpDetailPage, renderJumpHubPage } from "./settingJumpSection";
import { renderBreadcrumbHeader } from "./settingNavComponents";
import { MobileModalStack } from "./settingPageModal";
import { RuleListController } from "./settingRuleList";
import { renderRuleSectionToolbar, ToolbarHandle } from "./settingToolbar";
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

function formatRuleEditorTitle(type: "text" | "regex" | "js", isNew: boolean, isTrigger = false): string {
  const typeTitle =
    type === "text"
      ? t(isTrigger ? "trigger.addText.label" : "modal.title.text")
      : t(type === "regex" ? "modal.title.regex" : "modal.title.js");
  return `${isNew ? t("modal.newPrefix") : t("modal.editPrefix")}${typeTitle}`;
}

export class StructLatexSettingTab extends PluginSettingTab {
  private activePage: SettingsPage = "home";
  private activeJumpMode: JumpSubPage | null = null;
  private homeViewEl: HTMLElement | null = null;
  private subPageEl: HTMLElement | null = null;
  private editorViewEl: HTMLElement | null = null;
  private toolbarHandle: ToolbarHandle | null = null;
  private disposeSubPage: (() => void) | null = null;
  private disposeEditor: (() => void) | null = null;
  private savedEditorScrollTop = 0;
  private savedJumpScrollTop = 0;
  private readonly mobileStack: MobileModalStack;
  private navScope: Scope | null = null;
  private scopePushed = false;
  private readonly ruleList: RuleListController;

  constructor(app: App, private readonly host: StructLatexSettingHost) {
    super(app, host);
    this.mobileStack = new MobileModalStack(app, () => this.renderHome());
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

  private syncNavScope(): void {
    if (Platform.isMobile) return this.popNavScope();
    const needScope = this.activePage !== "home" || Boolean(this.disposeEditor);
    if (needScope && !this.scopePushed) {
      if (!this.navScope) {
        this.navScope = new Scope(this.app.scope);
        this.navScope.register([], "Escape", (ev) => {
          ev.preventDefault();
          this.navigateBackOneLevel();
          return false;
        });
      }
      this.app.keymap.pushScope(this.navScope);
      this.scopePushed = true;
    } else if (!needScope && this.scopePushed) {
      this.popNavScope();
    }
  }

  private popNavScope(): void {
    if (this.scopePushed && this.navScope) {
      this.app.keymap.popScope(this.navScope);
      this.scopePushed = false;
    }
  }

  private navigateBackOneLevel(): void {
    if (this.disposeEditor) return this.closeRuleEditor();
    if (this.activePage === "jump" && this.activeJumpMode) {
      this.activeJumpMode = null;
      this.renderSubPage("jump");
      this.scrollToY(this.savedJumpScrollTop);
      return;
    }
    if (this.activePage !== "home") this.backToHome();
  }

  private clearSubPageState(): void {
    this.disposeSubPage?.();
    this.disposeSubPage = null;
    this.ruleList.destroy();
    this.toolbarHandle = null;
  }

  private resetTransientState(): void {
    this.popNavScope();
    this.mobileStack.closeAll();
    this.clearSubPageState();
    this.disposeEditor?.();
    this.disposeEditor = null;
  }

  private closeRuleEditor(): void {
    this.disposeEditor?.();
    this.disposeEditor = null;
    this.editorViewEl?.empty();
    this.editorViewEl?.addClass("struct-latex-hidden");
    this.subPageEl?.removeClass("struct-latex-hidden");
    this.scrollToY(this.savedEditorScrollTop);
    this.syncNavScope();
  }

  private presentEditor(
    breadcrumbParent: string,
    title: string,
    renderWithClose: (hostEl: HTMLElement, closeSelf: () => void) => () => void
  ): void {
    if (Platform.isMobile) {
      this.mobileStack.push(title, (bodyEl, modal) => renderWithClose(bodyEl, () => modal.close()));
      return;
    }
    if (!this.subPageEl || !this.editorViewEl) return;
    this.savedEditorScrollTop = this.scrollToY(0);
    this.subPageEl.addClass("struct-latex-hidden");
    this.editorViewEl.removeClass("struct-latex-hidden");
    this.editorViewEl.empty();
    renderBreadcrumbHeader(this.editorViewEl, [breadcrumbParent, title], () => this.closeRuleEditor());
    const bodyEl = this.editorViewEl.createDiv();
    this.disposeEditor?.();
    this.disposeEditor = renderWithClose(bodyEl, () => this.closeRuleEditor());
    this.syncNavScope();
  }

  private openRuleEditor(target: InputRule, isNew: boolean): void {
    const title = formatRuleEditorTitle(target.type, isNew, false);
    this.presentEditor(t("settings.nav.input"), title, (el, closeSelf) =>
      renderRuleEditorView(el, {
        rule: target,
        dialect: this.host.settings.outputDialect,
        parseAmbiguousBars: this.host.settings.parseAmbiguousBars,
        isNew,
        hideHeader: true,
        onSave: async (saved) => {
          await this.ruleList.upsertAndSaveRule(saved, isNew);
          closeSelf();
          this.refreshAfterRulesMutation();
        },
        onCancel: closeSelf,
      })
    );
  }

  private openTriggerEditor(
    target: TriggerRule,
    category: TriggerCategory,
    isNew: boolean,
    onSaved: (saved: TriggerRule, isNew: boolean) => Promise<void>
  ): void {
    const title = formatRuleEditorTitle(target.type, isNew, true);
    const parentLabel =
      category === "delete"
        ? t("settings.nav.delete")
        : t(getJumpModeSpec(this.activeJumpMode ?? "rightSingle").nameKey);

    this.presentEditor(parentLabel, title, (el, closeSelf) =>
      renderTriggerRuleEditorView(el, {
        rule: target,
        category,
        parseAmbiguousBars: this.host.settings.parseAmbiguousBars,
        isNew,
        hideHeader: true,
        onSave: async (saved) => {
          await onSaved(saved, isNew);
          closeSelf();
        },
        onCancel: closeSelf,
      })
    );
  }

  private refreshAfterRulesMutation(): void {
    this.toolbarHandle?.syncRulesMeta(this.host.ruleStore.getRules());
    this.ruleList.pruneCache();
    this.ruleList.render();
  }

  private renderInputSubPage(container: HTMLElement): () => void {
    renderSmartInputSettings(container, this.host, () => {
      this.ruleList.clearCache();
      this.ruleList.render();
    });
    const loadErr = this.host.ruleStore.getLoadError();
    if (loadErr) {
      container.createDiv({ cls: "struct-latex-modal-error", text: t("settings.loadError", { err: loadErr }) });
    }
    this.toolbarHandle = renderRuleSectionToolbar(container, {
      title: t("settings.addRule.name"),
      rules: this.host.ruleStore.getRules(),
      filter: this.ruleList.filter,
      onFilterChanged: () => this.ruleList.render(),
      onAddText: () => this.ruleList.startNewTextDraft(),
      onAddRegex: () => this.openRuleEditor(createDraftRule("regex"), true),
      onAddJs: () => this.openRuleEditor(createDraftRule("js"), true),
      onExport: () => openExportJsonModal(this.app, t("modals.json.exportTitle"), this.host.ruleStore.exportJson()),
      onImport: () =>
        openImportJsonModal(this.app, t("modals.json.importTitle"), t("panel.importPlaceholder"), async (raw) => {
          await this.host.ruleStore.importJson(raw);
          this.refreshAfterRulesMutation();
        }),
      onReset: () =>
        openConfirmResetModal(
          this.app,
          t("modals.reset.title"),
          t("modals.reset.body"),
          t("modals.reset.confirm"),
          t("modals.reset.doneNotice"),
          async () => {
            await this.host.ruleStore.resetToDefaults(getLocale());
            this.ruleList.pendingNewTextDraft = null;
            this.refreshAfterRulesMutation();
          }
        ),
    });

    this.ruleList.setContainer(container.createDiv({ cls: "struct-latex-rule-list" }));
    this.ruleList.render();
    return () => {
      this.ruleList.destroy();
      this.toolbarHandle = null;
    };
  }

  private openSubPage(page: SettingsSubPage): void {
    const openTrig = (r: TriggerRule, c: TriggerCategory, n: boolean, s: (sr: TriggerRule, sn: boolean) => Promise<void>) =>
      this.openTriggerEditor(r, c, n, s);

    if (Platform.isMobile) {
      const title = t(`settings.nav.${page}` as const);
      if (page === "jump") {
        this.mobileStack.push(title, (bodyEl) => {
          const renderHub = () => {
            bodyEl.empty();
            renderJumpHubPage(bodyEl, this.host, (mode) => {
              this.mobileStack.push(
                t(getJumpModeSpec(mode).nameKey),
                (detailEl) => renderJumpDetailPage(detailEl, mode, this.host, openTrig),
                renderHub
              );
            });
          };
          renderHub();
        });
        return;
      }
      this.mobileStack.push(title, (bodyEl) => {
        if (page === "input") return this.renderInputSubPage(bodyEl);
        if (page === "delete") return renderFeatureCategoryPage(bodyEl, "delete", this.host, openTrig);
        if (page === "special") renderSpecialSettingsPage(bodyEl, this.host);
        else renderAboutPage(bodyEl, this.host.manifest);
      });
      return;
    }

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
    this.renderHome();
    this.scrollToY(0);
    this.syncNavScope();
  }

  private renderSubPage(page: SettingsSubPage): void {
    const container = this.subPageEl;
    if (!container) return;
    this.clearSubPageState();
    container.empty();
    const openTrig = (r: TriggerRule, c: TriggerCategory, n: boolean, s: (sr: TriggerRule, sn: boolean) => Promise<void>) =>
      this.openTriggerEditor(r, c, n, s);

    if (page === "jump") {
      if (!this.activeJumpMode) {
        renderBreadcrumbHeader(container, [t("settings.nav.jump")], () => this.backToHome());
        renderJumpHubPage(container, this.host, (mode) => {
          this.savedJumpScrollTop = this.scrollToY(0);
          this.activeJumpMode = mode;
          this.renderSubPage("jump");
        });
      } else {
        const spec = getJumpModeSpec(this.activeJumpMode);
        renderBreadcrumbHeader(container, [t("settings.nav.jump"), t(spec.nameKey)], () => {
          this.activeJumpMode = null;
          this.renderSubPage("jump");
          this.scrollToY(this.savedJumpScrollTop);
        });
        this.disposeSubPage = renderJumpDetailPage(container, this.activeJumpMode, this.host, openTrig);
      }
      this.syncNavScope();
      return;
    }

    renderBreadcrumbHeader(container, [t(`settings.nav.${page}` as const)], () => this.backToHome());
    if (page === "input") this.disposeSubPage = this.renderInputSubPage(container);
    else if (page === "delete") this.disposeSubPage = renderFeatureCategoryPage(container, "delete", this.host, openTrig);
    else if (page === "special") renderSpecialSettingsPage(container, this.host);
    else renderAboutPage(container, this.host.manifest);
    this.syncNavScope();
  }

  private renderHome(): void {
    if (!this.homeViewEl) return;
    this.homeViewEl.empty();
    new Setting(this.homeViewEl).setName(t("settings.title")).setHeading();
    renderSettingsHomePage(this.homeViewEl, this.host, {
      onLanguageChanged: () => this.renderHome(),
      onOpenPage: (page) => this.openSubPage(page),
    });
  }

  display(): void {
    const { containerEl } = this;
    this.resetTransientState();
    containerEl.empty();
    containerEl.addClass("struct-latex-settings-root");

    this.homeViewEl = containerEl.createDiv({ cls: "struct-latex-home-view" });
    this.subPageEl = containerEl.createDiv({ cls: "struct-latex-subpage-view struct-latex-hidden" });
    this.editorViewEl = containerEl.createDiv({ cls: "struct-latex-hidden" });

    this.renderHome();

    if (!Platform.isMobile && this.activePage !== "home") {
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
