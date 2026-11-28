import { App, Modal, setIcon } from "obsidian";
import { t } from "../i18n";

export interface SettingsSubPageModalOptions {
  title: string;
  renderBody: (bodyEl: HTMLElement, modal: SettingsSubPageModal) => (() => void) | void;
  onClosed?: () => void;
}

/**
 * Full-screen mobile sub-page modal backed by Obsidian's Modal HistoryHandler stack
 * so Android system back gestures pop one settings layer at a time.
 */
export class SettingsSubPageModal extends Modal {
  private disposeBody: (() => void) | null = null;
  private titleElRef: HTMLElement | null = null;

  constructor(app: App, private readonly options: SettingsSubPageModalOptions) {
    super(app);
    this.shouldRestoreSelection = false;
  }

  setPageTitle(title: string): void {
    this.titleElRef?.setText(title);
  }

  onOpen(): void {
    this.modalEl.addClass("struct-latex-page-modal");
    const { contentEl } = this;
    contentEl.empty();

    const appBar = contentEl.createDiv({ cls: "struct-latex-mobile-appbar" });
    const backBtn = appBar.createEl("button", {
      type: "button",
      cls: "clickable-icon struct-latex-mobile-back-btn",
    });
    setIcon(backBtn, "arrow-left");
    const backLabel = t("settings.nav.back");
    backBtn.setAttr("aria-label", backLabel);
    backBtn.addEventListener("click", () => this.close());

    this.titleElRef = appBar.createDiv({
      cls: "struct-latex-mobile-appbar-title",
      text: this.options.title,
    });

    const bodyEl = contentEl.createDiv({ cls: "struct-latex-mobile-body" });
    const maybeDispose = this.options.renderBody(bodyEl, this);
    this.disposeBody = typeof maybeDispose === "function" ? maybeDispose : null;
  }

  onClose(): void {
    this.disposeBody?.();
    this.disposeBody = null;
    this.titleElRef = null;
    this.modalEl.removeClass("struct-latex-page-modal");
    this.contentEl.empty();
    this.options.onClosed?.();
  }
}

/**
 * Manages stacked full-screen mobile sub-page modals and invokes root refresh when all pop.
 */
export class MobileModalStack {
  private readonly stack: SettingsSubPageModal[] = [];
  private closingAll = false;

  constructor(private readonly app: App, private readonly onEmpty: () => void) {}

  push(
    title: string,
    renderBody: (bodyEl: HTMLElement, modal: SettingsSubPageModal) => (() => void) | void,
    onAfterClose?: () => void
  ): void {
    const modal = new SettingsSubPageModal(this.app, {
      title,
      renderBody,
      onClosed: () => {
        const idx = this.stack.lastIndexOf(modal);
        if (idx >= 0) this.stack.splice(idx, 1);
        if (this.closingAll) return;
        onAfterClose?.();
        if (this.stack.length === 0) this.onEmpty();
      },
    });
    this.stack.push(modal);
    modal.open();
  }

  closeAll(): void {
    this.closingAll = true;
    try {
      while (this.stack.length > 0) this.stack.pop()?.close();
    } finally {
      this.closingAll = false;
    }
  }
}
