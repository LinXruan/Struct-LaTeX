import { Menu, setIcon } from "obsidian";
import { t } from "../i18n";

export interface NavRowOptions {
  icon: string;
  title: string;
  desc?: string;
  summary?: string;
  summaryMonospace?: boolean;
  statusDot?: "on" | "off";
  trailingIcon?: string;
  onClick: (ev: MouseEvent | KeyboardEvent) => void;
}

export type MenuChoiceItem =
  | { separator: true }
  | {
      separator?: false;
      title: string;
      icon?: string;
      checked?: boolean;
      warning?: boolean;
      onSelect: () => void;
    };

/**
 * Creates a rounded card container with an optional uppercase/muted section label above it.
 */
export function createSettingCard(parent: HTMLElement, heading?: string): HTMLElement {
  if (heading) {
    parent.createDiv({ cls: "struct-latex-section-label", text: heading });
  }
  return parent.createDiv({ cls: "struct-latex-card" });
}

/**
 * Renders a full-row clickable navigation/action item inside a card.
 */
export function renderNavRow(card: HTMLElement, options: NavRowOptions): HTMLElement {
  const row = card.createDiv({ cls: "struct-latex-nav-row" });
  row.setAttr("role", "button");
  row.setAttr("tabindex", "0");

  const iconWrap = row.createSpan({ cls: "struct-latex-nav-icon" });
  setIcon(iconWrap, options.icon);

  const main = row.createDiv({ cls: "struct-latex-nav-main" });
  main.createDiv({ cls: "struct-latex-nav-title", text: options.title });
  if (options.desc) {
    main.createDiv({ cls: "struct-latex-nav-desc", text: options.desc });
  }

  const trailing = row.createDiv({ cls: "struct-latex-nav-trailing" });
  if (options.statusDot) {
    trailing.createSpan({
      cls: `struct-latex-status-dot is-${options.statusDot}`,
    });
  }
  if (options.summary) {
    trailing.createSpan({
      cls: `struct-latex-nav-summary${options.summaryMonospace ? " is-mono" : ""}`,
      text: options.summary,
    });
  }

  const chevron = trailing.createSpan({ cls: "struct-latex-nav-chevron" });
  setIcon(chevron, options.trailingIcon ?? "chevron-right");

  row.addEventListener("click", (ev) => options.onClick(ev));
  row.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      options.onClick(ev);
    }
  });

  return row;
}

/**
 * Renders a single-line desktop breadcrumb header with a compact icon back button.
 */
export function renderBreadcrumbHeader(
  parent: HTMLElement,
  segments: readonly string[],
  onBack: () => void
): HTMLElement {
  const bar = parent.createDiv({ cls: "struct-latex-breadcrumb-bar" });
  const backBtn = bar.createEl("button", {
    type: "button",
    cls: "clickable-icon struct-latex-back-icon-btn",
  });
  setIcon(backBtn, "arrow-left");
  const backLabel = t("settings.nav.back");
  backBtn.setAttr("aria-label", backLabel);
  backBtn.setAttr("title", backLabel);
  backBtn.addEventListener("click", onBack);

  const trail = bar.createDiv({ cls: "struct-latex-breadcrumb-trail" });
  segments.forEach((seg, idx) => {
    if (idx > 0) {
      trail.createSpan({ cls: "struct-latex-breadcrumb-sep", text: "/" });
    }
    const isLast = idx === segments.length - 1;
    trail.createSpan({
      cls: isLast ? "struct-latex-breadcrumb-current" : "struct-latex-breadcrumb-parent",
      text: seg,
    });
  });

  return bar;
}

/**
 * Opens an Obsidian native Menu anchored to the triggering pointer event or element.
 */
export function openActionMenu(
  ev: MouseEvent | KeyboardEvent,
  anchorEl: HTMLElement,
  items: readonly MenuChoiceItem[]
): void {
  const menu = new Menu();
  for (const entry of items) {
    if (entry.separator) {
      menu.addSeparator();
      continue;
    }
    menu.addItem((item) => {
      item.setTitle(entry.title);
      if (entry.icon) item.setIcon(entry.icon);
      if (entry.checked !== undefined) item.setChecked(entry.checked);
      if (entry.warning) item.setWarning(true);
      item.onClick(entry.onSelect);
    });
  }

  if (ev instanceof MouseEvent && (ev.clientX !== 0 || ev.clientY !== 0)) {
    menu.showAtMouseEvent(ev);
    return;
  }
  const rect = anchorEl.getBoundingClientRect();
  menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 }, anchorEl.ownerDocument);
}
