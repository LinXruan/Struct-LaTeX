import { getLocale, t } from "../i18n";
import { InputRule, OutputDialect } from "../input/types";
import { LazyMathPreviewManager } from "./mathPreview";
import { renderRuleRow, RuleRowCallbacks } from "./ruleRowRenderer";
import { RuleStore } from "./ruleStore";
import { createDefaultFilterState, createDraftRule, filterRules, FilterState } from "./settingToolbar";

export interface RuleListControllerHost {
  ruleStore: RuleStore;
  getDialect: () => OutputDialect;
  getParseAmbiguousBars: () => boolean;
  onOpenEditor: (rule: InputRule, isNew: boolean) => void;
  onRulesChanged: () => void;
}

export class RuleListController {
  readonly filter: FilterState = createDefaultFilterState();
  pendingNewTextDraft: InputRule | null = null;
  private previewManager: LazyMathPreviewManager | null = null;
  private container: HTMLElement | null = null;
  private readonly rowCache = new Map<string, { sig: string; el: HTMLElement }>();

  constructor(private readonly host: RuleListControllerHost) {}

  setContainer(el: HTMLElement | null): void {
    this.container = el;
  }

  clearCache(): void {
    this.previewManager?.destroy();
    this.previewManager = null;
    this.rowCache.clear();
  }

  destroy(): void {
    this.clearCache();
    this.container = null;
  }

  startNewTextDraft(): void {
    this.pendingNewTextDraft = createDraftRule("text");
    this.render();
  }

  private getRowSignature(rule: InputRule, isDraft: boolean): string {
    const barFlag = this.host.getParseAmbiguousBars() ? 1 : 0;
    return `${this.host.getDialect()}:${barFlag}:${getLocale()}:${isDraft ? 1 : 0}:${JSON.stringify(rule)}`;
  }

  private updateRowCacheSig(rule: InputRule): void {
    const cached = this.rowCache.get(rule.id);
    if (cached) cached.sig = this.getRowSignature(rule, false);
  }

  async upsertAndSaveRule(rule: InputRule, isNew: boolean): Promise<void> {
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

  pruneCache(): void {
    const validIds = new Set(this.host.ruleStore.getRules().map((r) => r.id));
    if (this.pendingNewTextDraft) validIds.add(this.pendingNewTextDraft.id);
    for (const id of this.rowCache.keys()) {
      if (!validIds.has(id)) this.rowCache.delete(id);
    }
  }

  private buildCallbacks(previewManager: LazyMathPreviewManager): RuleRowCallbacks {
    return {
      getDialect: () => this.host.getDialect(),
      getParseAmbiguousBars: () => this.host.getParseAmbiguousBars(),
      previewManager,
      onCommitRule: async (updated, isDraft) => {
        await this.upsertAndSaveRule(updated, isDraft);
        if (isDraft) {
          this.host.onRulesChanged();
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
      onOpenEditor: (target) => this.host.onOpenEditor(target, this.pendingNewTextDraft?.id === target.id),
      onDeleteRule: async (target, isDraft) => {
        if (isDraft) {
          this.pendingNewTextDraft = null;
          this.render();
          return;
        }
        this.rowCache.delete(target.id);
        await this.host.ruleStore.save(this.host.ruleStore.getRules().filter((r) => r.id !== target.id));
        this.host.onRulesChanged();
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
        this.render();
      },
    };
  }

  render(): void {
    const container = this.container;
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

    const callbacks = this.buildCallbacks(this.previewManager);
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
}
