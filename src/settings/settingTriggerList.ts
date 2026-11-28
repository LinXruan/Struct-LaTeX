import { App } from "obsidian";
import { getLocale, t } from "../i18n";
import { TriggerCategory, TriggerRule } from "../input/triggerTypes";
import { openConfirmResetModal, openExportJsonModal, openImportJsonModal } from "./ruleActionModals";
import { createDefaultFilterState, FilterState } from "./ruleFilter";
import { renderRuleSectionToolbar } from "./settingToolbar";
import {
  createDraftTriggerRule,
  filterTriggerRules,
  renderTriggerRuleRow,
  TriggerRowCallbacks,
} from "./triggerRowAndEditor";
import { TriggerStore } from "./triggerStore";

export interface TriggerSectionCallbacks {
  app: App;
  category: TriggerCategory;
  triggerStore: TriggerStore;
  onOpenEditor: (
    rule: TriggerRule,
    isNew: boolean,
    onSaved: (rule: TriggerRule, isNew: boolean) => Promise<void>
  ) => void;
}

/**
 * Renders the trigger rules section (header menu, search/filter bar, and list).
 */
export function renderTriggerRulesSection(
  parent: HTMLElement,
  options: TriggerSectionCallbacks
): () => void {
  const { app, category, triggerStore } = options;
  const filter: FilterState = createDefaultFilterState();
  let pendingNewTextDraft: TriggerRule | null = null;
  const rowCache = new Map<string, { sig: string; el: HTMLElement }>();

  const loadErr = triggerStore.getLoadError();
  if (loadErr) {
    parent.createDiv({ cls: "struct-latex-modal-error", text: loadErr });
  }

  const upsertAndSave = async (rule: TriggerRule, isNew: boolean) => {
    const next = [...triggerStore.getRules(category)];
    if (isNew) {
      pendingNewTextDraft = null;
      next.unshift(rule);
    } else {
      const idx = next.findIndex((r) => r.id === rule.id);
      if (idx >= 0) next[idx] = rule;
    }
    await triggerStore.saveCategory(category, next);
  };

  const openEditorForType = (type: "regex" | "js") => {
    options.onOpenEditor(createDraftTriggerRule(type, category), true, async (saved, isNew) => {
      await upsertAndSave(saved, isNew);
      refreshAll();
    });
  };

  const toolbarHandle = renderRuleSectionToolbar(parent, {
    title: t("trigger.addRule.name"),
    subtitle: t("trigger.addRule.desc"),
    rules: triggerStore.getRules(category),
    filter,
    onFilterChanged: () => renderList(),
    onAddText: () => {
      pendingNewTextDraft = createDraftTriggerRule("text", category);
      renderList();
    },
    onAddRegex: () => openEditorForType("regex"),
    onAddJs: () => openEditorForType("js"),
    onExport: () => openExportJsonModal(app, t("trigger.toolbar.export"), triggerStore.exportJson()),
    onImport: () =>
      openImportJsonModal(app, t("trigger.toolbar.import"), t("trigger.panel.importPlaceholder"), async (raw) => {
        await triggerStore.importJson(raw);
        refreshAll();
      }),
    onReset: () =>
      openConfirmResetModal(
        app,
        t("trigger.reset.title"),
        t("trigger.reset.body"),
        t("trigger.reset.confirm"),
        t("trigger.reset.doneNotice"),
        async () => {
          await triggerStore.resetCategory(category);
          refreshAll();
        }
      ),
    labels: {
      addTextLabel: t("trigger.addText.label"),
      exportText: t("trigger.toolbar.export"),
      importText: t("trigger.toolbar.import"),
      resetText: t("trigger.toolbar.reset"),
      textToggleText: t("trigger.toolbar.toggleText"),
    },
  });

  const listEl = parent.createDiv({ cls: "struct-latex-rule-list" });

  const getRowSig = (rule: TriggerRule, isDraft: boolean) =>
    `${category}:${getLocale()}:${isDraft ? 1 : 0}:${JSON.stringify(rule)}`;

  const refreshAll = () => {
    const rules = triggerStore.getRules(category);
    toolbarHandle.syncRulesMeta(rules);
    rowCache.clear();
    renderList();
  };

  const buildCallbacks = (): TriggerRowCallbacks => ({
    category,
    onCommitRule: async (updated, isDraft) => {
      await upsertAndSave(updated, isDraft);
      if (isDraft) refreshAll();
      else {
        const cached = rowCache.get(updated.id);
        if (cached) cached.sig = getRowSig(updated, false);
      }
    },
    onToggleEnabled: async (target, enabled) => {
      const rules = triggerStore.getRules(category);
      const idx = rules.findIndex((r) => r.id === target.id);
      if (idx < 0) return;
      const next = [...rules];
      next[idx] = { ...rules[idx], enabled };
      await triggerStore.saveCategory(category, next);
      const cached = rowCache.get(target.id);
      if (cached) cached.sig = getRowSig(next[idx], false);
    },
    onOpenEditor: (target) => {
      const isNew = pendingNewTextDraft?.id === target.id;
      options.onOpenEditor(target, isNew, async (saved, wasNew) => {
        await upsertAndSave(saved, wasNew);
        refreshAll();
      });
    },
    onDeleteRule: async (target, isDraft) => {
      if (isDraft) {
        pendingNewTextDraft = null;
        return renderList();
      }
      rowCache.delete(target.id);
      await triggerStore.saveCategory(
        category,
        triggerStore.getRules(category).filter((r) => r.id !== target.id)
      );
      refreshAll();
    },
    onReorderRule: async (draggedId, beforeId, afterId) => {
      const next = [...triggerStore.getRules(category)];
      const fromIdx = next.findIndex((r) => r.id === draggedId);
      if (fromIdx < 0) return;
      const [moved] = next.splice(fromIdx, 1);
      const beforeIdx = beforeId ? next.findIndex((r) => r.id === beforeId) : -1;
      const afterIdx = !beforeId && afterId ? next.findIndex((r) => r.id === afterId) : -1;
      const targetIdx = beforeIdx >= 0 ? beforeIdx : afterIdx >= 0 ? afterIdx + 1 : fromIdx;
      if (targetIdx === fromIdx) return;
      next.splice(targetIdx, 0, moved);
      await triggerStore.saveCategory(category, next);
      renderList();
    },
  });

  function renderList(): void {
    const filtered = filterTriggerRules(triggerStore.getRules(category), filter);
    const items = [
      ...(pendingNewTextDraft ? [{ rule: pendingNewTextDraft, isDraft: true }] : []),
      ...filtered.map((rule) => ({ rule, isDraft: false })),
    ];
    if (items.length === 0) {
      listEl.replaceChildren();
      listEl.createDiv({ cls: "struct-latex-empty", text: t("settings.emptyList") });
      return;
    }

    const callbacks = buildCallbacks();
    const fragment = createFragment();
    const scratch = listEl.createDiv();

    for (const item of items) {
      const sig = getRowSig(item.rule, item.isDraft);
      const cached = rowCache.get(item.rule.id);
      if (cached && cached.sig === sig) {
        fragment.appendChild(cached.el);
      } else {
        const rowEl = renderTriggerRuleRow(scratch, item.rule, item.isDraft, callbacks);
        rowCache.set(item.rule.id, { sig, el: rowEl });
        fragment.appendChild(rowEl);
      }
    }
    listEl.replaceChildren(fragment);
  }

  renderList();
  return () => rowCache.clear();
}
