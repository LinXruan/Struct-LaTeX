import { Setting } from "obsidian";
import { t } from "../i18n";
import { evaluateRulePreview } from "../input/ruleEngine";
import { InputRule, OutputDialect, RuleScope, TriggerMode } from "../input/types";
import { cloneRule } from "../input/validation";
import { renderGuardsFields, renderKeybindFields } from "./ruleEditorFields";
import { buildPreviewPanel, renderJsReferenceBlock, showValidationFailure } from "./ruleInlinePanels";

export interface RuleEditorViewOptions {
  rule: InputRule;
  dialect: OutputDialect;
  parseAmbiguousBars: boolean;
  isNew: boolean;
  onSave: (updated: InputRule) => Promise<void>;
  onCancel: () => void;
}

function renderTypeBody(
  container: HTMLElement,
  draft: InputRule,
  onRefreshPreview: () => void
): void {
  if (draft.type === "text") {
    new Setting(container).setName(t("modal.text.trigger")).addText((tInput) =>
      tInput.setValue(draft.trigger).onChange((v) => {
        draft.trigger = v;
      })
    );
    new Setting(container)
      .setName(t("modal.text.replace"))
      .setDesc(t("modal.text.replaceDesc"))
      .addText((tInput) =>
        tInput.setValue(draft.replacement).onChange((v) => {
          draft.replacement = v;
          onRefreshPreview();
        })
      );
    return;
  }

  if (draft.type === "regex") {
    new Setting(container)
      .setName(t("modal.regex.trigger"))
      .addText((tInput) =>
        tInput
          .setPlaceholder(t("modal.regex.triggerPlaceholder"))
          .setValue(draft.trigger)
          .onChange((v) => {
            draft.trigger = v;
            onRefreshPreview();
          })
      );
    new Setting(container)
      .setName(t("modal.regex.flags"))
      .addText((tInput) =>
        tInput
          .setPlaceholder(t("modal.regex.flagsPlaceholder"))
          .setValue(draft.flags ?? "")
          .onChange((v) => {
            draft.flags = v.trim();
            onRefreshPreview();
          })
      );
    new Setting(container)
      .setName(t("modal.regex.replace"))
      .setDesc(t("modal.regex.replaceDesc"))
      .addText((tInput) =>
        tInput.setValue(draft.replacement).onChange((v) => {
          draft.replacement = v;
          onRefreshPreview();
        })
      );
    new Setting(container)
      .setName(t("modal.regex.example"))
      .addText((tInput) =>
        tInput
          .setPlaceholder(t("modal.regex.examplePlaceholder"))
          .setValue(draft.exampleInput ?? "")
          .onChange((v) => {
            draft.exampleInput = v;
            onRefreshPreview();
          })
      );
    return;
  }

  new Setting(container)
    .setName(t("modal.js.example"))
    .setDesc(t("modal.js.exampleDesc"))
    .addText((tInput) =>
      tInput
        .setPlaceholder(t("modal.js.examplePlaceholder"))
        .setValue(draft.exampleInput ?? "")
        .onChange((v) => {
          draft.exampleInput = v;
          onRefreshPreview();
        })
    );

  container.createDiv({
    cls: "struct-latex-js-label",
    text: t("modal.js.codeLabel"),
  });
  const editor = container.createEl("textarea", { cls: "struct-latex-js-editor" });
  editor.value = draft.code;
  editor.addEventListener("input", () => {
    draft.code = editor.value;
    onRefreshPreview();
  });
  editor.addEventListener("keydown", (ev) => {
    if (ev.key === "Tab") {
      ev.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.slice(0, start) + "  " + editor.value.slice(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      draft.code = editor.value;
    }
  });

  renderJsReferenceBlock(container);
}

export function renderRuleEditorView(
  container: HTMLElement,
  options: RuleEditorViewOptions
): () => void {
  container.empty();
  const view = container.createDiv({ cls: "struct-latex-editor-view" });
  const draft = cloneRule(options.rule);

  let disposeKeybinds: () => void = () => {};
  const disposeAll = () => {
    disposeKeybinds();
    disposeKeybinds = () => {};
  };
  const handleCancel = () => {
    disposeAll();
    options.onCancel();
  };

  const typeTitle =
    draft.type === "text"
      ? t("modal.title.text")
      : draft.type === "regex"
      ? t("modal.title.regex")
      : t("modal.title.js");

  const header = view.createDiv({ cls: "struct-latex-editor-header" });
  header
    .createEl("button", { cls: "struct-latex-editor-back-btn", text: t("editor.back") })
    .addEventListener("click", handleCancel);
  header.createEl("h3", {
    cls: "struct-latex-editor-title",
    text: `${options.isNew ? t("modal.newPrefix") : t("modal.editPrefix")}${typeTitle}`,
  });

  new Setting(view).setName(t("modal.ruleName")).addText((tInput) =>
    tInput.setValue(draft.name).onChange((v) => {
      draft.name = v;
    })
  );
  new Setting(view).setName(t("modal.ruleGroup")).addText((tInput) =>
    tInput.setValue(draft.group).onChange((v) => {
      draft.group = v.trim() || t("draft.group");
    })
  );
  new Setting(view).setName(t("modal.scope")).addDropdown((dd) =>
    dd
      .addOption("math", t("modal.scope.math"))
      .addOption("text", t("modal.scope.text"))
      .addOption("any", t("modal.scope.any"))
      .setValue(draft.scope)
      .onChange((v) => {
        draft.scope = v as RuleScope;
      })
  );

  const keybindHost = view.createDiv();
  new Setting(view).setName(t("modal.triggerMode")).addDropdown((dd) =>
    dd
      .addOption("auto", t("modal.triggerMode.auto"))
      .addOption("confirm", t("modal.triggerMode.confirm"))
      .addOption("hotkey", t("modal.triggerMode.hotkey"))
      .setValue(draft.triggerMode)
      .onChange((v) => {
        draft.triggerMode = v as TriggerMode;
        disposeKeybinds();
        disposeKeybinds = renderKeybindFields(keybindHost, draft);
      })
  );
  view.appendChild(keybindHost);
  disposeKeybinds = renderKeybindFields(keybindHost, draft);

  let refreshPreview: () => void = () => {};
  renderTypeBody(view, draft, () => refreshPreview());
  refreshPreview = buildPreviewPanel(view, draft, options.dialect, (r, d) =>
    evaluateRulePreview(r, d, { parseAmbiguousBars: options.parseAmbiguousBars })
  );
  refreshPreview();
  renderGuardsFields(view, draft, () => refreshPreview());

  const errorEl = view.createDiv({ cls: "struct-latex-modal-error" });
  errorEl.style.display = "none";

  const footer = view.createDiv({ cls: "struct-latex-editor-footer" });
  footer.createEl("button", { text: t("modal.cancel") }).addEventListener("click", handleCancel);
  const saveBtn = footer.createEl("button", { cls: "mod-cta", text: t("modal.save") });
  saveBtn.addEventListener("click", () => {
    void (async () => {
      if (!showValidationFailure(errorEl, draft)) return;
      try {
        await options.onSave(draft);
        disposeAll();
      } catch (err) {
        errorEl.style.display = "block";
        errorEl.setText((err as Error).message);
      }
    })();
  });

  return disposeAll;
}
