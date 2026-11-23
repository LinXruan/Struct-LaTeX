import { Notice } from "obsidian";
import { t } from "../i18n";
import { InputRule, OutputDialect } from "../input/types";
import { validateRule } from "../input/validation";
import { renderMathPreviewNow } from "./mathPreview";

export type InlinePanelMode = "export" | "import" | "reset";

export interface InlinePanelCallbacks {
  getExportJson: () => string;
  onImport: (raw: string) => Promise<void>;
  onReset: () => Promise<void>;
  onClose: () => void;
}

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
): () => void {
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

  return () => {
    if (recording) {
      stop(idleLabel());
    } else {
      cleanup?.();
      cleanup = null;
    }
  };
}

export function showValidationFailure(errorBanner: HTMLElement, rule: InputRule): boolean {
  const res = validateRule(rule);
  if (res.valid) {
    errorBanner.empty();
    errorBanner.addClass("struct-latex-hidden");
    return true;
  }
  errorBanner.removeClass("struct-latex-hidden");
  errorBanner.setText(res.errors.join("; "));
  return false;
}

export async function copyTextareaContent(textarea: HTMLTextAreaElement): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(textarea.value);
      new Notice(t("modals.json.copiedNotice"));
      return;
    } catch {
      // Fall back to highlighting the textarea so the user can copy manually
    }
  }
  textarea.focus();
  textarea.select();
}

function renderExportPanelBody(
  panel: HTMLElement,
  _doc: Document,
  callbacks: InlinePanelCallbacks
): void {
  const actionBar = panel.createDiv({ cls: "struct-latex-inline-panel-actions" });
  const copyBtn = actionBar.createEl("button", { cls: "mod-cta", text: t("modals.json.copy") });
  const textarea = panel.createEl("textarea", {
    cls: "struct-latex-js-editor struct-latex-json-transfer",
  });
  textarea.value = callbacks.getExportJson();
  textarea.readOnly = true;

  copyBtn.addEventListener("click", () => {
    void copyTextareaContent(textarea);
  });
}

function renderImportPanelBody(panel: HTMLElement, callbacks: InlinePanelCallbacks): void {
  const textarea = panel.createEl("textarea", {
    cls: "struct-latex-js-editor struct-latex-json-transfer",
  });
  textarea.placeholder = t("panel.importPlaceholder");

  const errEl = panel.createDiv({ cls: "struct-latex-modal-error struct-latex-hidden" });

  const footer = panel.createDiv({ cls: "struct-latex-inline-panel-actions" });
  footer.createEl("button", { text: t("modal.cancel") }).addEventListener("click", callbacks.onClose);
  const importBtn = footer.createEl("button", { cls: "mod-cta", text: t("modals.json.importBtn") });

  importBtn.addEventListener("click", () => {
    void (async () => {
      try {
        errEl.addClass("struct-latex-hidden");
        await callbacks.onImport(textarea.value);
        new Notice(t("modals.json.importedNotice"));
        callbacks.onClose();
      } catch (err) {
        errEl.removeClass("struct-latex-hidden");
        errEl.setText((err as Error).message);
      }
    })();
  });
}

function renderResetPanelBody(panel: HTMLElement, callbacks: InlinePanelCallbacks): void {
  panel.createEl("p", { cls: "struct-latex-inline-panel-body", text: t("modals.reset.body") });
  const footer = panel.createDiv({ cls: "struct-latex-inline-panel-actions" });
  footer.createEl("button", { text: t("modal.cancel") }).addEventListener("click", callbacks.onClose);
  const confirmBtn = footer.createEl("button", { cls: "mod-warning", text: t("modals.reset.confirm") });

  confirmBtn.addEventListener("click", () => {
    void (async () => {
      await callbacks.onReset();
      new Notice(t("modals.reset.doneNotice"));
      callbacks.onClose();
    })();
  });
}

export function renderInlineActionPanel(
  container: HTMLElement,
  mode: InlinePanelMode,
  callbacks: InlinePanelCallbacks
): void {
  container.empty();
  const panel = container.createDiv({ cls: "struct-latex-inline-panel" });

  const header = panel.createDiv({ cls: "struct-latex-inline-panel-header" });
  const titleText =
    mode === "export"
      ? t("modals.json.exportTitle")
      : mode === "import"
      ? t("modals.json.importTitle")
      : t("modals.reset.title");
  header.createDiv({ cls: "struct-latex-inline-panel-title", text: titleText });
  header.createEl("button", { text: t("panel.close") }).addEventListener("click", callbacks.onClose);

  if (mode === "export") {
    renderExportPanelBody(panel, container.ownerDocument, callbacks);
  } else if (mode === "import") {
    renderImportPanelBody(panel, callbacks);
  } else {
    renderResetPanelBody(panel, callbacks);
  }
}
