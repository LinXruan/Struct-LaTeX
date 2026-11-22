import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";
import { evaluateRulePreview } from "../input/ruleEngine";
import { InputRule, OutputDialect, RuleScope, TriggerMode } from "../input/types";
import { cloneRule } from "../input/validation";
import { renderGuardsFields, renderKeybindFields } from "./ruleModalFields";
import { buildPreviewPanel, renderJsReferenceBlock, showValidationFailure } from "./ruleModals";

export class RuleEditModal extends Modal {
  private draft: InputRule;
  private refreshPreview: (() => void) | null = null;
  private errorEl!: HTMLElement;

  constructor(
    app: App,
    rule: InputRule,
    private readonly dialect: OutputDialect,
    private readonly isNew: boolean,
    private readonly onSave: (updated: InputRule) => Promise<void>
  ) {
    super(app);
    this.draft = cloneRule(rule);
  }

  private renderTypeBody(container: HTMLElement): void {
    if (this.draft.type === "text") {
      const rule = this.draft;
      new Setting(container).setName(t("modal.text.trigger")).addText((tInput) =>
        tInput.setValue(rule.trigger).onChange((v) => {
          rule.trigger = v;
        })
      );
      new Setting(container)
        .setName(t("modal.text.replace"))
        .setDesc(t("modal.text.replaceDesc"))
        .addText((tInput) =>
          tInput.setValue(rule.replacement).onChange((v) => {
            rule.replacement = v;
            this.refreshPreview?.();
          })
        );
      return;
    }

    if (this.draft.type === "regex") {
      const rule = this.draft;
      new Setting(container)
        .setName(t("modal.regex.trigger"))
        .addText((tInput) =>
          tInput
            .setPlaceholder(t("modal.regex.triggerPlaceholder"))
            .setValue(rule.trigger)
            .onChange((v) => {
              rule.trigger = v;
              this.refreshPreview?.();
            })
        );
      new Setting(container)
        .setName(t("modal.regex.flags"))
        .addText((tInput) =>
          tInput
            .setPlaceholder(t("modal.regex.flagsPlaceholder"))
            .setValue(rule.flags ?? "")
            .onChange((v) => {
              rule.flags = v.trim();
              this.refreshPreview?.();
            })
        );
      new Setting(container)
        .setName(t("modal.regex.replace"))
        .setDesc(t("modal.regex.replaceDesc"))
        .addText((tInput) =>
          tInput.setValue(rule.replacement).onChange((v) => {
            rule.replacement = v;
            this.refreshPreview?.();
          })
        );
      new Setting(container)
        .setName(t("modal.regex.example"))
        .addText((tInput) =>
          tInput
            .setPlaceholder(t("modal.regex.examplePlaceholder"))
            .setValue(rule.exampleInput ?? "")
            .onChange((v) => {
              rule.exampleInput = v;
              this.refreshPreview?.();
            })
        );
      return;
    }

    const rule = this.draft;
    new Setting(container)
      .setName(t("modal.js.example"))
      .setDesc(t("modal.js.exampleDesc"))
      .addText((tInput) =>
        tInput
          .setPlaceholder(t("modal.js.examplePlaceholder"))
          .setValue(rule.exampleInput ?? "")
          .onChange((v) => {
            rule.exampleInput = v;
            this.refreshPreview?.();
          })
      );

    container.createDiv({
      cls: "struct-latex-js-label",
      text: t("modal.js.codeLabel"),
    });
    const editor = container.createEl("textarea", { cls: "struct-latex-js-editor" });
    editor.value = rule.code;
    editor.addEventListener("input", () => {
      rule.code = editor.value;
      this.refreshPreview?.();
    });
    editor.addEventListener("keydown", (ev) => {
      if (ev.key === "Tab") {
        ev.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.slice(0, start) + "  " + editor.value.slice(end);
        editor.selectionStart = editor.selectionEnd = start + 2;
        rule.code = editor.value;
      }
    });

    renderJsReferenceBlock(container);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("struct-latex-edit-modal");
    contentEl.empty();

    const typeTitle =
      this.draft.type === "text"
        ? t("modal.title.text")
        : this.draft.type === "regex"
        ? t("modal.title.regex")
        : t("modal.title.js");
    contentEl.createEl("h3", {
      text: `${this.isNew ? t("modal.newPrefix") : t("modal.editPrefix")}${typeTitle}`,
    });

    new Setting(contentEl).setName(t("modal.ruleName")).addText((tInput) =>
      tInput.setValue(this.draft.name).onChange((v) => {
        this.draft.name = v;
      })
    );
    new Setting(contentEl).setName(t("modal.ruleGroup")).addText((tInput) =>
      tInput.setValue(this.draft.group).onChange((v) => {
        this.draft.group = v.trim() || t("draft.group");
      })
    );
    new Setting(contentEl).setName(t("modal.scope")).addDropdown((dd) =>
      dd
        .addOption("math", t("modal.scope.math"))
        .addOption("text", t("modal.scope.text"))
        .addOption("any", t("modal.scope.any"))
        .setValue(this.draft.scope)
        .onChange((v) => {
          this.draft.scope = v as RuleScope;
        })
    );

    const keybindHost = contentEl.createDiv();
    new Setting(contentEl).setName(t("modal.triggerMode")).addDropdown((dd) =>
      dd
        .addOption("auto", t("modal.triggerMode.auto"))
        .addOption("confirm", t("modal.triggerMode.confirm"))
        .addOption("hotkey", t("modal.triggerMode.hotkey"))
        .setValue(this.draft.triggerMode)
        .onChange((v) => {
          this.draft.triggerMode = v as TriggerMode;
          renderKeybindFields(keybindHost, this.draft);
        })
    );
    contentEl.appendChild(keybindHost);
    renderKeybindFields(keybindHost, this.draft);

    this.renderTypeBody(contentEl);
    this.refreshPreview = buildPreviewPanel(contentEl, this.draft, this.dialect, evaluateRulePreview);
    this.refreshPreview();
    renderGuardsFields(contentEl, this.draft, () => this.refreshPreview?.());

    this.errorEl = contentEl.createDiv({ cls: "struct-latex-modal-error" });
    this.errorEl.style.display = "none";

    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    new Setting(footer)
      .addButton((b) => b.setButtonText(t("modal.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("modal.save"))
          .setCta()
          .onClick(async () => {
            if (!showValidationFailure(this.errorEl, this.draft)) return;
            try {
              await this.onSave(this.draft);
              this.close();
            } catch (err) {
              this.errorEl.style.display = "block";
              this.errorEl.setText((err as Error).message);
            }
          })
      );
  }
}
