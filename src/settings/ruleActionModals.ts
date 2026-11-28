import { App, Modal, Notice } from "obsidian";
import { t } from "../i18n";
import { copyTextareaContent } from "./ruleInlinePanels";

abstract class ActionModalBase extends Modal {
  constructor(app: App, private readonly modalTitle: string) {
    super(app);
    this.shouldRestoreSelection = false;
  }

  protected abstract renderModalBody(contentEl: HTMLElement): void;

  onOpen(): void {
    this.modalEl.addClass("struct-latex-action-modal");
    this.titleEl.setText(this.modalTitle);
    this.contentEl.empty();
    this.renderModalBody(this.contentEl);
  }

  onClose(): void {
    this.modalEl.removeClass("struct-latex-action-modal");
    this.contentEl.empty();
  }
}

class JsonExportModal extends ActionModalBase {
  constructor(app: App, title: string, private readonly jsonText: string) {
    super(app, title);
  }

  protected renderModalBody(contentEl: HTMLElement): void {
    const textarea = contentEl.createEl("textarea", {
      cls: "struct-latex-js-editor struct-latex-json-transfer",
    });
    textarea.value = this.jsonText;
    textarea.readOnly = true;

    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    footer
      .createEl("button", { type: "button", text: t("modal.cancel") })
      .addEventListener("click", () => this.close());
    footer
      .createEl("button", { type: "button", cls: "mod-cta", text: t("modals.json.copy") })
      .addEventListener("click", () => void copyTextareaContent(textarea));
  }
}

class JsonImportModal extends ActionModalBase {
  constructor(
    app: App,
    title: string,
    private readonly placeholderText: string,
    private readonly onImport: (raw: string) => Promise<void>
  ) {
    super(app, title);
  }

  protected renderModalBody(contentEl: HTMLElement): void {
    const textarea = contentEl.createEl("textarea", {
      cls: "struct-latex-js-editor struct-latex-json-transfer",
    });
    textarea.placeholder = this.placeholderText;

    const errEl = contentEl.createDiv({ cls: "struct-latex-modal-error struct-latex-hidden" });
    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    footer
      .createEl("button", { type: "button", text: t("modal.cancel") })
      .addEventListener("click", () => this.close());

    footer
      .createEl("button", { type: "button", cls: "mod-cta", text: t("modals.json.importBtn") })
      .addEventListener("click", () => {
        void (async () => {
          try {
            errEl.addClass("struct-latex-hidden");
            await this.onImport(textarea.value);
            new Notice(t("modals.json.importedNotice"));
            this.close();
          } catch (err) {
            errEl.removeClass("struct-latex-hidden");
            errEl.setText((err as Error).message);
          }
        })();
      });

    queueMicrotask(() => textarea.focus());
  }
}

class ConfirmResetModal extends ActionModalBase {
  constructor(
    app: App,
    title: string,
    private readonly bodyText: string,
    private readonly confirmLabel: string,
    private readonly doneNotice: string,
    private readonly onConfirm: () => Promise<void>
  ) {
    super(app, title);
  }

  protected renderModalBody(contentEl: HTMLElement): void {
    contentEl.createEl("p", { cls: "struct-latex-action-modal-body", text: this.bodyText });
    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    footer
      .createEl("button", { type: "button", text: t("modal.cancel") })
      .addEventListener("click", () => this.close());

    footer
      .createEl("button", { type: "button", cls: "mod-warning", text: this.confirmLabel })
      .addEventListener("click", () => {
        void (async () => {
          await this.onConfirm();
          new Notice(this.doneNotice);
          this.close();
        })();
      });
  }
}

export function openExportJsonModal(app: App, title: string, jsonText: string): void {
  new JsonExportModal(app, title, jsonText).open();
}

export function openImportJsonModal(
  app: App,
  title: string,
  placeholder: string,
  onImport: (raw: string) => Promise<void>
): void {
  new JsonImportModal(app, title, placeholder, onImport).open();
}

export function openConfirmResetModal(
  app: App,
  title: string,
  body: string,
  confirmLabel: string,
  doneNotice: string,
  onConfirm: () => Promise<void>
): void {
  new ConfirmResetModal(app, title, body, confirmLabel, doneNotice, onConfirm).open();
}
