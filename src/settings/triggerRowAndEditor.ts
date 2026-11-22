import { setIcon, Setting, ToggleComponent } from "obsidian";
import { t } from "../i18n";
import { cloneTriggerRule, evaluateTriggerPreview, validateTriggerRule } from "../input/triggerEngine";
import { TriggerCategory, TriggerRule } from "../input/triggerTypes";
import { RuleType } from "../input/types";
import { attachPointerDragSort, ReorderCallback } from "./ruleDragSort";
import { renderTriggerGuardsFields } from "./ruleEditorFields";
import { FilterState } from "./settingToolbar";

export interface TriggerRowCallbacks {
  category: TriggerCategory;
  onCommitRule: (rule: TriggerRule, isNewDraft: boolean) => Promise<void>;
  onToggleEnabled: (rule: TriggerRule, enabled: boolean) => Promise<void>;
  onOpenEditor: (rule: TriggerRule) => void;
  onDeleteRule: (rule: TriggerRule, isNewDraft: boolean) => Promise<void>;
  onReorderRule: ReorderCallback;
}

export interface TriggerEditorViewOptions {
  rule: TriggerRule;
  category: TriggerCategory;
  parseAmbiguousBars: boolean;
  isNew: boolean;
  onSave: (updated: TriggerRule) => Promise<void>;
  onCancel: () => void;
}

export function createDraftTriggerRule(type: RuleType, category: TriggerCategory): TriggerRule {
  const id = `trig-${category}-${type}-${Date.now().toString(36)}`;
  if (type === "text") {
    return { id, name: t("draft.textName"), group: t("draft.group"), type: "text", enabled: true, trigger: "" };
  }
  if (type === "regex") {
    return {
      id,
      name: t("draft.regexName"),
      group: t("draft.group"),
      type: "regex",
      enabled: true,
      trigger: "",
      exampleInput: "",
    };
  }
  return {
    id,
    name: t("draft.jsName"),
    group: t("draft.group"),
    type: "js",
    enabled: true,
    exampleInput: "",
    code: t("trigger.draft.jsTemplate"),
  };
}

export function filterTriggerRules(rules: readonly TriggerRule[], filter: FilterState): TriggerRule[] {
  if (filter.enabledTypes.size === 0) return [];
  const query = filter.searchQuery.trim().toLowerCase();
  const matched: TriggerRule[] = [];

  for (const r of rules) {
    if (!filter.enabledTypes.has(r.type)) continue;
    if (filter.groupFilter !== "all" && r.group !== filter.groupFilter) continue;
    if (query) {
      const extra = r.type === "text" || r.type === "regex" ? r.trigger : r.exampleInput ?? "";
      const hay = `${r.name} ${r.group} ${r.id} ${extra}`.toLowerCase();
      if (!hay.includes(query)) continue;
    }
    matched.push(r);
  }
  return matched;
}

export function renderTriggerRuleRow(
  container: HTMLElement,
  rule: TriggerRule,
  isNewDraft: boolean,
  callbacks: TriggerRowCallbacks
): HTMLElement {
  const row = container.createDiv({ cls: "struct-latex-rule-row" });
  row.dataset.ruleId = rule.id;
  if (isNewDraft) row.addClass("struct-latex-rule-draft");

  const handle = row.createSpan({ cls: "struct-latex-drag-handle", text: "⋮⋮" });
  handle.setAttr("title", t("row.dragTitle"));
  if (!isNewDraft) attachPointerDragSort(handle, row, rule.id, callbacks.onReorderRule);

  const left = row.createDiv({ cls: "struct-latex-rule-left" });
  const actions = row.createDiv({ cls: "struct-latex-rule-actions" });
  const localDraft = cloneTriggerRule(rule);
  const actionBadgeText = callbacks.category === "jump" ? t("trigger.badge.jump") : t("trigger.badge.delete");

  const syncInlineValidity = () => {
    const check = validateTriggerRule(localDraft);
    if (check.valid) {
      row.removeClass("struct-latex-rule-invalid");
      row.removeAttribute("title");
      return true;
    }
    row.addClass("struct-latex-rule-invalid");
    row.setAttr("title", check.errors[0] ?? t("row.invalidDefault"));
    return false;
  };

  if (localDraft.type === "text") {
    let committed = !isNewDraft;
    const defaultDraftName = t("draft.textName");
    const trigInput = left.createEl("input", {
      type: "text",
      cls: "struct-latex-inline-input struct-latex-inline-trigger",
      placeholder: t("row.triggerPlaceholder"),
    });
    trigInput.value = localDraft.trigger;
    left.createSpan({ cls: "struct-latex-badge is-type-text", text: t("badge.type.match") });
    left.createSpan({ cls: "struct-latex-badge is-auto", text: actionBadgeText });

    const commitIfValid = async () => {
      if (!syncInlineValidity()) return;
      const wasDraft = !committed;
      committed = true;
      await callbacks.onCommitRule(localDraft, wasDraft);
      row.removeClass("struct-latex-rule-draft");
    };

    trigInput.addEventListener("input", () => {
      const textDraft = localDraft;
      textDraft.trigger = trigInput.value;
      if (textDraft.name === defaultDraftName && textDraft.trigger.trim()) {
        textDraft.name = textDraft.trigger.trim();
      }
      syncInlineValidity();
    });
    trigInput.addEventListener("blur", () => void commitIfValid());
    trigInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") trigInput.blur();
    });

    if (isNewDraft) {
      syncInlineValidity();
      queueMicrotask(() => trigInput.focus());
    }
  } else {
    const titleRow = left.createDiv({ cls: "struct-latex-rule-title-row" });
    titleRow.createSpan({ cls: "struct-latex-rule-name", text: localDraft.name });
    titleRow.createSpan({
      cls: `struct-latex-badge is-type-${localDraft.type}`,
      text: localDraft.type === "regex" ? t("badge.type.regex") : t("badge.type.js"),
    });
    titleRow.createSpan({ cls: "struct-latex-badge is-auto", text: actionBadgeText });

    const summary =
      localDraft.type === "regex"
        ? `${localDraft.trigger}${localDraft.flags ? ` (${localDraft.flags})` : ""}`
        : `${t("row.summaryGroup", { group: localDraft.group })}${
            localDraft.exampleInput ? t("row.summarySample", { sample: localDraft.exampleInput }) : ""
          }`;
    left.createDiv({ cls: "struct-latex-rule-summary", text: summary });
  }

  const toggle = new ToggleComponent(actions);
  toggle.setValue(localDraft.enabled);
  toggle.setTooltip(localDraft.enabled ? t("row.enabled") : t("row.disabled"));
  toggle.onChange(async (val) => {
    localDraft.enabled = val;
    toggle.setTooltip(val ? t("row.enabled") : t("row.disabled"));
    if (!isNewDraft || validateTriggerRule(localDraft).valid) {
      await callbacks.onToggleEnabled(localDraft, val);
    }
  });

  const editBtn = actions.createEl("button", { cls: "struct-latex-edit-btn", text: t("row.editBtn") });
  const editLabel = localDraft.type === "text" ? t("trigger.row.editGuardsTitle") : t("row.editRuleTitle");
  editBtn.setAttr("aria-label", editLabel);
  editBtn.setAttr("title", editLabel);
  editBtn.addEventListener("click", () => callbacks.onOpenEditor(localDraft));

  const delBtn = actions.createEl("button", { cls: "clickable-icon struct-latex-row-btn struct-latex-del-btn" });
  setIcon(delBtn, "trash-2");
  const delLabel = t("row.deleteRuleTitle");
  delBtn.setAttr("aria-label", delLabel);
  delBtn.setAttr("title", delLabel);
  delBtn.addEventListener("click", () => void callbacks.onDeleteRule(localDraft, isNewDraft));

  return row;
}

export function renderTriggerRuleEditorView(
  container: HTMLElement,
  options: TriggerEditorViewOptions
): () => void {
  container.empty();
  const view = container.createDiv({ cls: "struct-latex-editor-view" });
  const draft = cloneTriggerRule(options.rule);
  const typeTitle =
    draft.type === "text" ? t("modal.title.text") : draft.type === "regex" ? t("modal.title.regex") : t("modal.title.js");

  const header = view.createDiv({ cls: "struct-latex-editor-header" });
  header.createEl("button", { cls: "struct-latex-editor-back-btn", text: t("editor.back") }).addEventListener("click", options.onCancel);
  header.createEl("h3", {
    cls: "struct-latex-editor-title",
    text: `${options.isNew ? t("modal.newPrefix") : t("modal.editPrefix")}${typeTitle}`,
  });

  new Setting(view).setName(t("modal.ruleName")).addText((ti) => ti.setValue(draft.name).onChange((v) => { draft.name = v; }));
  new Setting(view).setName(t("modal.ruleGroup")).addText((ti) =>
    ti.setValue(draft.group).onChange((v) => { draft.group = v.trim() || t("draft.group"); })
  );

  let refreshPreview = () => {};
  if (draft.type === "text") {
    new Setting(view).setName(t("modal.text.trigger")).addText((ti) =>
      ti.setValue(draft.trigger).onChange((v) => {
        draft.trigger = v;
        refreshPreview();
      })
    );
  } else if (draft.type === "regex") {
    new Setting(view).setName(t("modal.regex.trigger")).addText((ti) =>
      ti.setPlaceholder(t("modal.regex.triggerPlaceholder")).setValue(draft.trigger).onChange((v) => {
        draft.trigger = v;
        refreshPreview();
      })
    );
    new Setting(view).setName(t("modal.regex.flags")).addText((ti) =>
      ti.setPlaceholder(t("modal.regex.flagsPlaceholder")).setValue(draft.flags ?? "").onChange((v) => {
        draft.flags = v.trim();
        refreshPreview();
      })
    );
    new Setting(view).setName(t("modal.regex.example")).addText((ti) =>
      ti.setPlaceholder(t("modal.regex.examplePlaceholder")).setValue(draft.exampleInput ?? "").onChange((v) => {
        draft.exampleInput = v;
        refreshPreview();
      })
    );
  } else {
    new Setting(view).setName(t("modal.js.example")).setDesc(t("modal.js.exampleDesc")).addText((ti) =>
      ti.setPlaceholder(t("modal.js.examplePlaceholder")).setValue(draft.exampleInput ?? "").onChange((v) => {
        draft.exampleInput = v;
        refreshPreview();
      })
    );
    view.createDiv({ cls: "struct-latex-js-label", text: t("trigger.modal.js.codeLabel") });
    const editor = view.createEl("textarea", { cls: "struct-latex-js-editor" });
    editor.value = draft.code;
    editor.addEventListener("input", () => {
      draft.code = editor.value;
      refreshPreview();
    });
    const refDetails = view.createEl("details", { cls: "struct-latex-js-ref" });
    refDetails.createEl("summary", { text: t("modals.jsRefSummary") });
    refDetails.createEl("pre", { text: t("trigger.modal.jsRefContent") });
  }

  const previewBox = view.createDiv({ cls: "struct-latex-modal-preview-box" });
  previewBox.createDiv({ cls: "struct-latex-modal-preview-label", text: t("trigger.preview.title") });
  const previewRawEl = previewBox.createDiv({ cls: "struct-latex-modal-preview-raw" });
  refreshPreview = () => {
    const res = evaluateTriggerPreview(draft, options.parseAmbiguousBars);
    if (res.error) {
      previewRawEl.setText(t("modals.previewError", { err: res.error }));
      previewRawEl.addClass("struct-latex-preview-error");
      return;
    }
    previewRawEl.removeClass("struct-latex-preview-error");
    previewRawEl.setText(res.summary);
  };
  refreshPreview();
  renderTriggerGuardsFields(view, draft, refreshPreview);

  const errorEl = view.createDiv({ cls: "struct-latex-modal-error struct-latex-hidden" });

  const footer = view.createDiv({ cls: "struct-latex-editor-footer" });
  footer.createEl("button", { text: t("modal.cancel") }).addEventListener("click", options.onCancel);
  footer.createEl("button", { cls: "mod-cta", text: t("modal.save") }).addEventListener("click", () => {
    void (async () => {
      const check = validateTriggerRule(draft);
      if (!check.valid) {
        errorEl.removeClass("struct-latex-hidden");
        errorEl.setText(check.errors.join("; "));
        return;
      }
      try {
        await options.onSave(draft);
      } catch (err) {
        errorEl.removeClass("struct-latex-hidden");
        errorEl.setText((err as Error).message);
      }
    })();
  });

  return () => {};
}
