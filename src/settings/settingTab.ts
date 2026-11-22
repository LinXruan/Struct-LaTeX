import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { getLocale, t } from "../i18n";
import { InputRule, PluginSettings } from "../input/types";
import { LazyMathPreviewManager } from "./mathPreview";
import { renderRuleEditorView } from "./ruleEditorView";
import { InlinePanelMode, renderInlineActionPanel } from "./ruleInlinePanels";
import { renderRuleRow, RuleRowCallbacks } from "./ruleRowRenderer";
import { RuleStore } from "./ruleStore";
import { renderAddRuleSetting, renderGeneralSettings } from "./settingGeneralSection";
import {
  createDefaultFilterState, createDraftRule, filterRules, FilterState, renderFilterToolbar, ToolbarHandle,
} from "./settingToolbar";

export interface StructLatexSettingHost extends Plugin {
  settings: PluginSettings;
  ruleStore: RuleStore;
  saveSettings(): Promise<void>;
  syncLocale(): void;
}

export class StructLatexSettingTab extends PluginSettingTab {
  private readonly filter: FilterState = createDefaultFilterState();
  private pendingNewTextDraft: InputRule | null = null;
  private previewManager: LazyMathPreviewManager | null = null;
  private mainViewEl: HTMLElement | null = null;
  private editorViewEl: HTMLElement | null = null;
  private inlinePanelEl: HTMLElement | null = null;
  private listContainer: HTMLElement | null = null;
  private addRuleSetting: Setting | null = null;
  private toolbarHandle: ToolbarHandle | null = null;
  private activeInlinePanel: InlinePanelMode | null = null;
  private disposeEditor: (() => void) | null = null;
  private savedScrollTop = 0;
  private readonly rowCache = new Map<string, { sig: string; el: HTMLElement }>();

  constructor(app: App, private readonly host: StructLatexSettingHost) {
    super(app, host);
  }

  private getRowSignature(rule: InputRule, isDraft: boolean): string {
    return `${this.host.settings.outputDialect}:${getLocale()}:${isDraft ? 1 : 0}:${JSON.stringify(rule)}`;
  }

  private findScrollAncestor(startEl: HTMLElement | null): HTMLElement | null {
    const win = this.containerEl.ownerDocument.defaultView ?? window;
    for (let cur = startEl; cur; cur = cur.parentElement) {
      const overflowY = win.getComputedStyle(cur).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return cur;
    }
    return null;
  }

  private resetTransientState(): void {
    this.disposeEditor?.();
    this.disposeEditor = null;
    this.activeInlinePanel = null;
    this.previewManager?.destroy();
    this.previewManager = null;
    this.rowCache.clear();
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
        this.pendingNewTextDraft = null;
        this.refreshAfterRulesMutation();
      },
      onClose: () => this.closeInlinePanel(),
    });
  }

  private async upsertAndSaveRule(rule: InputRule, isNew: boolean): Promise<void> {
    const next = [...this.host.ruleStore.getRules()];
    if (isNew) {
      this.pendingNewTextDraft = null;
      next.unshift(rule);
    } else {
      const idx = next.findIndex((r) => r.id === rule.id);
      if (idx >= 0) next[idx] = rule;
    }
    await this.host.ruleStore.save(next);
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
        await this.upsertAndSaveRule(saved, isNew);
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

    const validIds = new Set(rules.map((r) => r.id));
    if (this.pendingNewTextDraft) validIds.add(this.pendingNewTextDraft.id);
    for (const id of this.rowCache.keys()) {
      if (!validIds.has(id)) this.rowCache.delete(id);
    }
    this.renderRuleList();
  }

  private updateRowCacheSig(rule: InputRule): void {
    const cached = this.rowCache.get(rule.id);
    if (cached) cached.sig = this.getRowSignature(rule, false);
  }

  private buildRowCallbacks(previewManager: LazyMathPreviewManager): RuleRowCallbacks {
    return {
      getDialect: () => this.host.settings.outputDialect,
      previewManager,
      onCommitRule: async (updated, isDraft) => {
        await this.upsertAndSaveRule(updated, isDraft);
        if (isDraft) {
          this.refreshAfterRulesMutation();
        } else {
          this.updateRowCacheSig(updated);
        }
      },
      onToggleEnabled: async (target, enabled) => {
        const rules = this.host.ruleStore.getRules();
        const idx = rules.findIndex((r) => r.id === target.id);
        if (idx < 0) return;
        const updated = { ...rules[idx], enabled };
        const next = [...rules];
        next[idx] = updated;
        await this.host.ruleStore.save(next);
        this.updateRowCacheSig(updated);
      },
      onOpenEditor: (target) => this.openRuleEditor(target, this.pendingNewTextDraft?.id === target.id),
      onDeleteRule: async (target, isDraft) => {
        if (isDraft) {
          this.pendingNewTextDraft = null;
          this.renderRuleList();
          return;
        }
        this.rowCache.delete(target.id);
        await this.host.ruleStore.save(this.host.ruleStore.getRules().filter((r) => r.id !== target.id));
        this.refreshAfterRulesMutation();
      },
      onReorderRule: async (draggedId, beforeId, afterId) => {
        const next = [...this.host.ruleStore.getRules()];
        const fromIdx = next.findIndex((r) => r.id === draggedId);
        if (fromIdx < 0) return;
        const [moved] = next.splice(fromIdx, 1);
        const beforeIdx = beforeId ? next.findIndex((r) => r.id === beforeId) : -1;
        const afterIdx = !beforeId && afterId ? next.findIndex((r) => r.id === afterId) : -1;
        const targetIdx = beforeIdx >= 0 ? beforeIdx : afterIdx >= 0 ? afterIdx + 1 : fromIdx;
        if (targetIdx === fromIdx) return;
        next.splice(targetIdx, 0, moved);
        await this.host.ruleStore.save(next);
        this.renderRuleList();
      },
    };
  }

  private renderRuleList(): void {
    const container = this.listContainer;
    if (!container) return;

    if (!this.previewManager) {
      this.previewManager = new LazyMathPreviewManager(container);
    }
    const filtered = filterRules(this.host.ruleStore.getRules(), this.filter);
    const items = [
      ...(this.pendingNewTextDraft ? [{ rule: this.pendingNewTextDraft, isDraft: true }] : []),
      ...filtered.map((rule) => ({ rule, isDraft: false })),
    ];

    if (items.length === 0) {
      container.replaceChildren();
      container.createDiv({ cls: "struct-latex-empty", text: t("settings.emptyList") });
      return;
    }

    const callbacks = this.buildRowCallbacks(this.previewManager);
    const doc = container.ownerDocument;
    const fragment = doc.createDocumentFragment();
    const scratch = doc.createElement("div");

    for (const item of items) {
      const sig = this.getRowSignature(item.rule, item.isDraft);
      const cached = this.rowCache.get(item.rule.id);
      if (cached && cached.sig === sig) {
        fragment.appendChild(cached.el);
      } else {
        const rowEl = renderRuleRow(scratch, item.rule, item.isDraft, callbacks);
        this.rowCache.set(item.rule.id, { sig, el: rowEl });
        fragment.appendChild(rowEl);
      }
    }
    container.replaceChildren(fragment);
  }

  display(): void {
    const { containerEl } = this;
    this.resetTransientState();
    containerEl.empty();

    this.mainViewEl = containerEl.createDiv({ cls: "struct-latex-main-view" });
    this.editorViewEl = containerEl.createDiv({ cls: "struct-latex-hidden" });

    this.mainViewEl.createEl("h2", { text: t("settings.title") });
    renderGeneralSettings(this.mainViewEl, this.host, {
      onLanguageChanged: () => this.display(),
      onDialectChanged: () => {
        this.previewManager?.destroy();
        this.previewManager = null;
        this.rowCache.clear();
        this.renderRuleList();
      },
    });

    const loadErr = this.host.ruleStore.getLoadError();
    if (loadErr) {
      this.mainViewEl.createDiv({ cls: "struct-latex-modal-error", text: t("settings.loadError", { err: loadErr }) });
    }

    const rules = this.host.ruleStore.getRules();
    this.addRuleSetting = renderAddRuleSetting(this.mainViewEl, this.host.ruleStore.filePath, rules.length, {
      onAddText: () => {
        this.closeInlinePanel();
        this.pendingNewTextDraft = createDraftRule("text");
        this.renderRuleList();
      },
      onAddRegex: () => this.openRuleEditor(createDraftRule("regex"), true),
      onAddJs: () => this.openRuleEditor(createDraftRule("js"), true),
    });

    this.toolbarHandle = renderFilterToolbar(this.mainViewEl, rules, this.filter, () => this.renderRuleList(), {
      onExport: () => this.toggleInlinePanel("export"),
      onImport: () => this.toggleInlinePanel("import"),
      onReset: () => this.toggleInlinePanel("reset"),
    });

    this.inlinePanelEl = this.mainViewEl.createDiv();
    this.listContainer = this.mainViewEl.createDiv({ cls: "struct-latex-rule-list" });
    this.renderRuleList();
  }

  hide(): void {
    this.resetTransientState();
    this.pendingNewTextDraft = null;
  }
}
