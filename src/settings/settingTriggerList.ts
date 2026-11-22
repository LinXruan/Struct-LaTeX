import { Notice, Setting } from "obsidian";
import { getLocale, t } from "../i18n";
import { TriggerCategory, TriggerRule } from "../input/triggerTypes";
import { InlinePanelMode } from "./ruleInlinePanels";
import { createDefaultFilterState, FilterState, renderFilterToolbar } from "./settingToolbar";
import {
  createDraftTriggerRule,
  filterTriggerRules,
  renderTriggerRuleRow,
  TriggerRowCallbacks,
} from "./triggerRowAndEditor";
import { TriggerStore } from "./triggerStore";

export interface TriggerSectionCallbacks {
  category: TriggerCategory;
  triggerStore: TriggerStore;
  onOpenEditor: (
    rule: TriggerRule,
    isNew: boolean,
    onSaved: (rule: TriggerRule, isNew: boolean) => Promise<void>
  ) => void;
}

function renderTriggerInlinePanel(
  container: HTMLElement,
  mode: InlinePanelMode,
  triggerStore: TriggerStore,
  category: TriggerCategory,
  onMutated: () => void,
  onClose: () => void
): void {
  container.empty();
  const panel = container.createDiv({ cls: "struct-latex-inline-panel" });
  const header = panel.createDiv({ cls: "struct-latex-inline-panel-header" });
  const titleText =
    mode === "export"
      ? t("trigger.toolbar.export")
      : mode === "import"
      ? t("trigger.toolbar.import")
      : t("trigger.reset.title");
  header.createDiv({ cls: "struct-latex-inline-panel-title", text: titleText });
  header.createEl("button", { text: t("panel.close") }).addEventListener("click", onClose);

  if (mode === "export") {
    const actionBar = panel.createDiv({ cls: "struct-latex-inline-panel-actions" });
    const copyBtn = actionBar.createEl("button", { cls: "mod-cta", text: t("modals.json.copy") });
    const textarea = panel.createEl("textarea", {
      cls: "struct-latex-js-editor struct-latex-json-transfer",
    });
    textarea.value = triggerStore.exportJson();
    textarea.readOnly = true;
    copyBtn.addEventListener("click", () => {
      void (async () => {
        try {
          await navigator.clipboard.writeText(textarea.value);
        } catch {
          textarea.select();
          container.ownerDocument.execCommand("copy");
        }
        new Notice(t("modals.json.copiedNotice"));
      })();
    });
    return;
  }

  if (mode === "import") {
    const textarea = panel.createEl("textarea", {
      cls: "struct-latex-js-editor struct-latex-json-transfer",
    });
    textarea.placeholder = t("trigger.panel.importPlaceholder");
    const errEl = panel.createDiv({ cls: "struct-latex-modal-error struct-latex-hidden" });
    const footer = panel.createDiv({ cls: "struct-latex-inline-panel-actions" });
    footer.createEl("button", { text: t("modal.cancel") }).addEventListener("click", onClose);
    footer.createEl("button", { cls: "mod-cta", text: t("modals.json.importBtn") }).addEventListener("click", () => {
      void (async () => {
        try {
          errEl.addClass("struct-latex-hidden");
          await triggerStore.importJson(textarea.value);
          new Notice(t("modals.json.importedNotice"));
          onMutated();
          onClose();
        } catch (err) {
          errEl.removeClass("struct-latex-hidden");
          errEl.setText((err as Error).message);
        }
      })();
    });
    return;
  }

  panel.createEl("p", { cls: "struct-latex-inline-panel-body", text: t("trigger.reset.body") });
  const footer = panel.createDiv({ cls: "struct-latex-inline-panel-actions" });
  footer.createEl("button", { text: t("modal.cancel") }).addEventListener("click", onClose);
  footer.createEl("button", { cls: "mod-warning", text: t("trigger.reset.confirm") }).addEventListener("click", () => {
    void (async () => {
      await triggerStore.resetCategory(category);
      new Notice(t("trigger.reset.doneNotice"));
      onMutated();
      onClose();
    })();
  });
}

export function renderTriggerRulesSection(
  parent: HTMLElement,
  options: TriggerSectionCallbacks
): () => void {
  const { category, triggerStore } = options;
  const filter: FilterState = createDefaultFilterState();
  let pendingNewTextDraft: TriggerRule | null = null;
  let activeInlinePanel: InlinePanelMode | null = null;
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

  const addSetting = new Setting(parent)
    .setName(t("trigger.addRule.name"))
    .setDesc(t("trigger.addRule.desc", { path: triggerStore.filePath, count: triggerStore.getRules(category).length }))
    .addButton((b) =>
      b.setButtonText(t("trigger.addText")).onClick(() => {
        closeInlinePanel();
        pendingNewTextDraft = createDraftTriggerRule("text", category);
        renderList();
      })
    )
    .addButton((b) =>
      b.setButtonText(t("settings.addRegex")).onClick(() =>
        options.onOpenEditor(createDraftTriggerRule("regex", category), true, async (saved, isNew) => {
          await upsertAndSave(saved, isNew);
          refreshAll();
        })
      )
    )
    .addButton((b) =>
      b.setButtonText(t("settings.addJs")).onClick(() =>
        options.onOpenEditor(createDraftTriggerRule("js", category), true, async (saved, isNew) => {
          await upsertAndSave(saved, isNew);
          refreshAll();
        })
      )
    );

  const toolbarHandle = renderFilterToolbar(parent, triggerStore.getRules(category), filter, () => renderList(), {
    onExport: () => toggleInlinePanel("export"),
    onImport: () => toggleInlinePanel("import"),
    onReset: () => toggleInlinePanel("reset"),
    labels: {
      exportText: t("trigger.toolbar.export"),
      importText: t("trigger.toolbar.import"),
      resetText: t("trigger.toolbar.reset"),
      textToggleText: t("trigger.toolbar.toggleText"),
    },
  });

  const inlinePanelEl = parent.createDiv();
  const listEl = parent.createDiv({ cls: "struct-latex-rule-list" });

  const closeInlinePanel = () => {
    activeInlinePanel = null;
    inlinePanelEl.empty();
    toolbarHandle.syncActivePanel(null);
  };
  const toggleInlinePanel = (mode: InlinePanelMode) => {
    if (activeInlinePanel === mode) return closeInlinePanel();
    activeInlinePanel = mode;
    toolbarHandle.syncActivePanel(mode);
    renderTriggerInlinePanel(inlinePanelEl, mode, triggerStore, category, refreshAll, closeInlinePanel);
  };

  const getRowSig = (rule: TriggerRule, isDraft: boolean) =>
    `${category}:${getLocale()}:${isDraft ? 1 : 0}:${JSON.stringify(rule)}`;

  const refreshAll = () => {
    const rules = triggerStore.getRules(category);
    addSetting.setDesc(t("trigger.addRule.desc", { path: triggerStore.filePath, count: rules.length }));
    toolbarHandle.syncGroups(rules);
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
    const doc = listEl.ownerDocument;
    const fragment = doc.createDocumentFragment();
    const scratch = doc.createElement("div");

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
