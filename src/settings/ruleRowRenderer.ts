import { setIcon, ToggleComponent } from "obsidian";
import { formatTriggerBadge } from "../input/keybindUtils";
import { evaluateRulePreview } from "../input/ruleEngine";
import { InputRule, OutputDialect, TextInputRule } from "../input/types";
import { cloneRule, validateRule } from "../input/validation";
import { LazyMathPreviewManager } from "./mathPreview";

export interface RuleRowCallbacks {
  getDialect: () => OutputDialect;
  previewManager: LazyMathPreviewManager;
  onCommitRule: (rule: InputRule, isNewDraft: boolean) => Promise<void>;
  onToggleEnabled: (rule: InputRule, enabled: boolean) => Promise<void>;
  onOpenEditModal: (rule: InputRule) => void;
  onDeleteRule: (rule: InputRule, isNewDraft: boolean) => Promise<void>;
  onReorderRule: (draggedId: string, targetId: string) => Promise<void>;
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
  handle.setAttr("title", "拖拽调整匹配顺序");
  handle.draggable = !isNewDraft;

  if (!isNewDraft) {
    handle.addEventListener("dragstart", (ev) => {
      ev.dataTransfer?.setData("text/plain", rule.id);
      row.addClass("struct-latex-dragging");
    });
    handle.addEventListener("dragend", () => {
      row.removeClass("struct-latex-dragging");
    });
    row.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      row.addClass("struct-latex-drag-over");
    });
    row.addEventListener("dragleave", () => {
      row.removeClass("struct-latex-drag-over");
    });
    row.addEventListener("drop", (ev) => {
      ev.preventDefault();
      row.removeClass("struct-latex-drag-over");
      const draggedId = ev.dataTransfer?.getData("text/plain");
      if (draggedId && draggedId !== rule.id) {
        void callbacks.onReorderRule(draggedId, rule.id);
      }
    });
  }

  const left = row.createDiv({ cls: "struct-latex-rule-left" });
  const previewEl = row.createDiv({ cls: "struct-latex-rule-preview" });
  const actions = row.createDiv({ cls: "struct-latex-rule-actions" });

  let localDraft = cloneRule(rule);

  const syncInlineValidity = () => {
    const check = validateRule(localDraft);
    if (check.valid) {
      row.removeClass("struct-latex-rule-invalid");
      row.removeAttribute("data-error");
      return true;
    }
    row.addClass("struct-latex-rule-invalid");
    row.setAttr("title", check.errors[0] ?? "规则不完整");
    return false;
  };

  if (localDraft.type === "text") {
    let committed = !isNewDraft;
    const trigInput = left.createEl("input", {
      type: "text",
      cls: "struct-latex-inline-input struct-latex-inline-trigger",
      placeholder: localDraft.triggerMode === "hotkey" ? "触发词 (快捷键模式可留空)" : "触发词 (必填)",
    });
    trigInput.value = localDraft.trigger;

    left.createSpan({ cls: "struct-latex-arrow", text: "→" });

    const repInput = left.createEl("input", {
      type: "text",
      cls: "struct-latex-inline-input struct-latex-inline-replace",
      placeholder: "替换内容 ($0 表光标，必填)",
    });
    repInput.value = localDraft.replacement;

    const badge = left.createSpan({
      cls: "struct-latex-badge",
      text: formatTriggerBadge(localDraft),
    });
    if (localDraft.triggerMode === "auto") badge.addClass("is-auto");

    const commitIfValid = async () => {
      if (!syncInlineValidity()) {
        callbacks.previewManager.refresh(
          previewEl,
          evaluateRulePreview(localDraft, callbacks.getDialect())
        );
        return;
      }
      const wasDraft = !committed;
      committed = true;
      await callbacks.onCommitRule(localDraft, wasDraft);
      row.removeClass("struct-latex-rule-draft");
      callbacks.previewManager.refresh(
        previewEl,
        evaluateRulePreview(localDraft, callbacks.getDialect())
      );
    };

    const onInputChange = () => {
      const textDraft = localDraft as TextInputRule;
      textDraft.trigger = trigInput.value;
      textDraft.replacement = repInput.value;
      if (textDraft.name === "新纯替换规则" && textDraft.trigger.trim()) {
        textDraft.name = textDraft.trigger.trim();
      }
      if (syncInlineValidity()) {
        callbacks.previewManager.refresh(
          previewEl,
          evaluateRulePreview(localDraft, callbacks.getDialect())
        );
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
      text: localDraft.type === "regex" ? "正则" : "JS",
    });
    titleRow.createSpan({
      cls: `struct-latex-badge${localDraft.triggerMode === "auto" ? " is-auto" : ""}`,
      text: formatTriggerBadge(localDraft),
    });

    const summary =
      localDraft.type === "regex"
        ? `${localDraft.trigger}  →  ${localDraft.replacement}`
        : `分组: ${localDraft.group}${localDraft.exampleInput ? ` · 示例: ${localDraft.exampleInput}` : ""}`;
    left.createDiv({ cls: "struct-latex-rule-summary", text: summary });
  }

  callbacks.previewManager.observe(previewEl, () =>
    evaluateRulePreview(localDraft, callbacks.getDialect())
  );

  // Strictly 1 toggle + 2 buttons per row
  const toggle = new ToggleComponent(actions);
  toggle.setValue(localDraft.enabled);
  toggle.setTooltip(localDraft.enabled ? "已启用" : "已禁用");
  toggle.onChange(async (val) => {
    localDraft.enabled = val;
    toggle.setTooltip(val ? "已启用" : "已禁用");
    if (!isNewDraft || validateRule(localDraft).valid) {
      await callbacks.onToggleEnabled(localDraft, val);
    }
  });

  const editBtn = actions.createEl("button", { cls: "clickable-icon struct-latex-row-btn" });
  setIcon(editBtn, localDraft.type === "text" ? "sliders-horizontal" : localDraft.type === "regex" ? "pencil" : "code-2");
  editBtn.setAttr("aria-label", localDraft.type === "text" ? "绑键与高级设置" : "编辑规则");
  editBtn.setAttr("title", localDraft.type === "text" ? "绑键与高级设置" : "编辑规则");
  editBtn.addEventListener("click", () => callbacks.onOpenEditModal(localDraft));

  const delBtn = actions.createEl("button", { cls: "clickable-icon struct-latex-row-btn struct-latex-del-btn" });
  setIcon(delBtn, "trash-2");
  delBtn.setAttr("aria-label", "删除规则");
  delBtn.setAttr("title", "删除规则");
  delBtn.addEventListener("click", () => void callbacks.onDeleteRule(localDraft, isNewDraft));

  return row;
}
