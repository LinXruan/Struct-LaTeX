import { App, Modal, Notice, Setting } from "obsidian";
import { t } from "../i18n";
import { InputRule, OutputDialect } from "../input/types";
import { validateRule } from "../input/validation";
import { renderMathPreviewNow } from "./mathPreview";

export function buildPreviewPanel(
  parentEl: HTMLElement,
  rule: InputRule,
  dialect: OutputDialect,
  evaluatePreview: (r: InputRule, d: OutputDialect) => { tex: string; rawOutput: string; error?: string }
): () => void {
  const box = parentEl.createDiv({ cls: "struct-latex-modal-preview-box" });
  box.createDiv({ cls: "struct-latex-modal-preview-label", text: t("modals.previewTitle") });
  const rawEl = box.createDiv({ cls: "struct-latex-modal-preview-raw" });
  const mathEl = box.createDiv({ cls: "struct-latex-modal-preview-math" });

  return () => {
    const res = evaluatePreview(rule, dialect);
    if (res.error) {
      rawEl.setText(t("modals.previewError", { err: res.error }));
      rawEl.addClass("struct-latex-preview-error");
      mathEl.empty();
      return;
    }
    rawEl.removeClass("struct-latex-preview-error");
    rawEl.setText(t("modals.previewOutput", { out: res.rawOutput }));
    renderMathPreviewNow(mathEl, res);
  };
}

export function renderJsReferenceBlock(parentEl: HTMLElement): void {
  const details = parentEl.createEl("details", { cls: "struct-latex-js-ref" });
  details.createEl("summary", { text: t("modals.jsRefSummary") });
  details.createEl("pre", { text: t("modals.jsRefContent") });
}

export function attachKeyRecorder(
  btnEl: HTMLButtonElement,
  isMac: boolean,
  onCaptured: (combo: string) => void,
  comboConverter: (ev: KeyboardEvent, isMac: boolean) => string | null,
  twoStep = false
): void {
  let recording = false;
  let step1: string | null = null;
  let cleanup: (() => void) | null = null;
  const idleLabel = () => (twoStep ? t("fields.recordChord") : t("fields.recordKey"));

  const stop = (label: string) => {
    recording = false;
    step1 = null;
    btnEl.setText(label);
    btnEl.removeClass("mod-cta");
    cleanup?.();
    cleanup = null;
  };

  btnEl.addEventListener("click", () => {
    if (recording) {
      stop(idleLabel());
      return;
    }
    recording = true;
    step1 = null;
    btnEl.addClass("mod-cta");
    btnEl.setText(twoStep ? t("modals.rec.pressChord") : t("modals.rec.pressKey"));

    const onKey = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === "Escape") {
        stop(idleLabel());
        return;
      }
      const combo = comboConverter(ev, isMac);
      if (!combo) return;

      if (twoStep && !step1) {
        step1 = combo;
        btnEl.setText(t("modals.rec.pressSecond", { key: combo }));
        return;
      }
      const finalHotkey = step1 ? `${step1} ${combo}` : combo;
      stop(idleLabel());
      onCaptured(finalHotkey);
    };

    const win = btnEl.ownerDocument.defaultView ?? window;
    win.addEventListener("keydown", onKey, true);
    cleanup = () => win.removeEventListener("keydown", onKey, true);
  });
}

export function showValidationFailure(errorBanner: HTMLElement, rule: InputRule): boolean {
  const res = validateRule(rule);
  if (res.valid) {
    errorBanner.empty();
    errorBanner.style.display = "none";
    return true;
  }
  errorBanner.style.display = "block";
  errorBanner.setText(res.errors.join("; "));
  return false;
}

export class JsonTransferModal extends Modal {
  constructor(
    app: App,
    private readonly mode: "import" | "export",
    private readonly initialJson: string,
    private readonly onImport?: (raw: string) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", {
      text: this.mode === "export" ? t("modals.json.exportTitle") : t("modals.json.importTitle"),
    });

    const textarea = contentEl.createEl("textarea", {
      cls: "struct-latex-js-editor struct-latex-json-transfer",
    });
    textarea.value = this.initialJson;
    if (this.mode === "export") textarea.readOnly = true;

    const errEl = contentEl.createDiv({ cls: "struct-latex-modal-error" });
    errEl.style.display = "none";

    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    if (this.mode === "export") {
      new Setting(footer).addButton((b) =>
        b
          .setButtonText(t("modals.json.copy"))
          .setCta()
          .onClick(async () => {
            await navigator.clipboard.writeText(textarea.value);
            new Notice(t("modals.json.copiedNotice"));
          })
      );
    } else {
      new Setting(footer)
        .addButton((b) => b.setButtonText(t("modal.cancel")).onClick(() => this.close()))
        .addButton((b) =>
          b
            .setButtonText(t("modals.json.importBtn"))
            .setCta()
            .onClick(async () => {
              try {
                await this.onImport?.(textarea.value);
                new Notice(t("modals.json.importedNotice"));
                this.close();
              } catch (err) {
                errEl.style.display = "block";
                errEl.setText((err as Error).message);
              }
            })
        );
    }
  }
}

export class ConfirmResetModal extends Modal {
  constructor(app: App, private readonly onConfirm: () => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: t("modals.reset.title") });
    contentEl.createEl("p", { text: t("modals.reset.body") });
    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    new Setting(footer)
      .addButton((b) => b.setButtonText(t("modal.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("modals.reset.confirm"))
          .setWarning()
          .onClick(async () => {
            await this.onConfirm();
            new Notice(t("modals.reset.doneNotice"));
            this.close();
          })
      );
  }
}
