import { setIcon, ToggleComponent } from "obsidian";
import { t } from "../i18n";
import { formatTriggerBadge } from "../input/keybindUtils";
import { evaluateRulePreview } from "../input/ruleEngine";
import { InputRule, OutputDialect } from "../input/types";
import { cloneRule, validateRule } from "../input/validation";
import { LazyMathPreviewManager } from "./mathPreview";
import { attachPointerDragSort, ReorderCallback } from "./ruleDragSort";

export interface RuleRowCallbacks {
  getDialect: () => OutputDialect;
  getParseAmbiguousBars?: () => boolean;
  previewManager: LazyMathPreviewManager;
  onCommitRule: (rule: InputRule, isNewDraft: boolean) => Promise<void>;
  onToggleEnabled: (rule: InputRule, enabled: boolean) => Promise<void>;
  onOpenEditor: (rule: InputRule) => void;
  onDeleteRule: (rule: InputRule, isNewDraft: boolean) => Promise<void>;
  onReorderRule: ReorderCallback;
}

export function renderRuleRow(
  container: HTMLElement,
  rule: InputRule,
  isNewDraft: boolean,
  callbacks: RuleRowCallbacks
): HTMLElement {
  const row = container.createDiv({ cls: "struct-latex-rule-row" });
  row.dataset.ruleId = rule.id;
  if (isNewDraft) row.addClass("struct-latex-rule-draft");

  // Drag handle (not a button)
  const handle = row.createSpan({ cls: "struct-latex-drag-handle", text: "⋮⋮" });
  handle.setAttr("title", t("row.dragTitle"));

  if (!isNewDraft) {
    attachPointerDragSort(handle, row, rule.id, callbacks.onReorderRule);
  }

  const left = row.createDiv({ cls: "struct-latex-rule-left" });
  const previewEl = row.createDiv({ cls: "struct-latex-rule-preview" });
  const actions = row.createDiv({ cls: "struct-latex-rule-actions" });

  let localDraft = cloneRule(rule);
  const previewOf = (r: InputRule) =>
    evaluateRulePreview(r, callbacks.getDialect(), {
      parseAmbiguousBars: callbacks.getParseAmbiguousBars?.() ?? true,
    });

  const syncInlineValidity = () => {
    const check = validateRule(localDraft);
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
      placeholder:
        localDraft.triggerMode === "hotkey" ? t("row.triggerHotkeyPlaceholder") : t("row.triggerPlaceholder"),
    });
    trigInput.value = localDraft.trigger;

    left.createSpan({ cls: "struct-latex-arrow", text: "→" });

    const repInput = left.createEl("input", {
      type: "text",
      cls: "struct-latex-inline-input struct-latex-inline-replace",
      placeholder: t("row.replacePlaceholder"),
    });
    repInput.value = localDraft.replacement;

    left.createSpan({
      cls: "struct-latex-badge is-type-text",
      text: t("badge.type.text"),
    });

    const badge = left.createSpan({
      cls: "struct-latex-badge",
      text: formatTriggerBadge(localDraft),
    });
    if (localDraft.triggerMode === "auto") badge.addClass("is-auto");

    const commitIfValid = async () => {
      if (!syncInlineValidity()) {
        callbacks.previewManager.refresh(previewEl, previewOf(localDraft));
        return;
      }
      const wasDraft = !committed;
      committed = true;
      await callbacks.onCommitRule(localDraft, wasDraft);
      row.removeClass("struct-latex-rule-draft");
      callbacks.previewManager.refresh(previewEl, previewOf(localDraft));
    };

    const onInputChange = () => {
      const textDraft = localDraft;
      textDraft.trigger = trigInput.value;
      textDraft.replacement = repInput.value;
      if (textDraft.name === defaultDraftName && textDraft.trigger.trim()) {
        textDraft.name = textDraft.trigger.trim();
      }
      if (syncInlineValidity()) {
        callbacks.previewManager.refresh(previewEl, previewOf(localDraft));
      }
    };

    trigInput.addEventListener("input", onInputChange);
    repInput.addEventListener("input", onInputChange);
    trigInput.addEventListener("blur", () => void commitIfValid());
    repInput.addEventListener("blur", () => void commitIfValid());

    const handleEnter = (ev: KeyboardEvent) => {
      if (ev.key === "Enter") {
        (ev.target as HTMLInputElement).blur();
      }
    };
    trigInput.addEventListener("keydown", handleEnter);
    repInput.addEventListener("keydown", handleEnter);

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
    titleRow.createSpan({
      cls: `struct-latex-badge${localDraft.triggerMode === "auto" ? " is-auto" : ""}`,
      text: formatTriggerBadge(localDraft),
    });

    const summary =
      localDraft.type === "regex"
        ? `${localDraft.trigger}  →  ${localDraft.replacement}`
        : `${t("row.summaryGroup", { group: localDraft.group })}${
            localDraft.exampleInput ? t("row.summarySample", { sample: localDraft.exampleInput }) : ""
          }`;
    left.createDiv({ cls: "struct-latex-rule-summary", text: summary });
  }

  callbacks.previewManager.observe(previewEl, () => previewOf(localDraft));

  // Strictly 1 toggle + 2 buttons per row
  const toggle = new ToggleComponent(actions);
  toggle.setValue(localDraft.enabled);
  toggle.setTooltip(localDraft.enabled ? t("row.enabled") : t("row.disabled"));
  toggle.onChange(async (val) => {
    localDraft.enabled = val;
    toggle.setTooltip(val ? t("row.enabled") : t("row.disabled"));
    if (!isNewDraft || validateRule(localDraft).valid) {
      await callbacks.onToggleEnabled(localDraft, val);
    }
  });

  const editBtn = actions.createEl("button", {
    cls: "struct-latex-edit-btn",
    text: t("row.editBtn"),
  });
  const editLabel = localDraft.type === "text" ? t("row.editKeybindTitle") : t("row.editRuleTitle");
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
