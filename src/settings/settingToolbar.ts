import { setIcon } from "obsidian";
import { t } from "../i18n";
import { RuleType } from "../input/types";
import { FilterState } from "./ruleFilter";
import { openActionMenu } from "./settingNavComponents";

export { createDefaultFilterState, createDraftRule, filterRules, type FilterState } from "./ruleFilter";

export interface ToolbarHandle {
  syncRulesMeta: (rules: readonly { group: string }[]) => void;
}

export interface RuleSectionToolbarOptions {
  title: string;
  subtitle?: string;
  rules: readonly { group: string }[];
  filter: FilterState;
  onFilterChanged: () => void;
  onAddText: () => void;
  onAddRegex: () => void;
  onAddJs: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  labels?: {
    addTextLabel?: string;
    exportText?: string;
    importText?: string;
    resetText?: string;
    textToggleText?: string;
  };
}

/**
 * Renders the unified rule section header (+ Add / More menu), search & group bar,
 * and soft-outlined type filter chips.
 */
export function renderRuleSectionToolbar(
  containerEl: HTMLElement,
  options: RuleSectionToolbarOptions
): ToolbarHandle {
  const { filter, onFilterChanged, labels } = options;

  const header = containerEl.createDiv({ cls: "struct-latex-rule-section-header" });
  const titleGroup = header.createDiv({ cls: "struct-latex-rule-section-title-group" });
  titleGroup.createSpan({ cls: "struct-latex-rule-section-title", text: options.title });
  const countBadge = titleGroup.createSpan({ cls: "struct-latex-count-badge" });

  const headerActions = header.createDiv({ cls: "struct-latex-rule-section-actions" });
  const addBtn = headerActions.createEl("button", {
    type: "button",
    cls: "struct-latex-add-menu-btn",
    text: t("settings.addRule.btn"),
  });
  addBtn.addEventListener("click", (ev) => {
    openActionMenu(ev, addBtn, [
      {
        title: labels?.addTextLabel ?? t("settings.addText.label"),
        icon: "replace",
        onSelect: options.onAddText,
      },
      {
        title: t("settings.addRegex.label"),
        icon: "regex",
        onSelect: options.onAddRegex,
      },
      {
        title: t("settings.addJs.label"),
        icon: "code-2",
        onSelect: options.onAddJs,
      },
    ]);
  });

  const moreBtn = headerActions.createEl("button", {
    type: "button",
    cls: "clickable-icon struct-latex-more-btn",
  });
  setIcon(moreBtn, "more-vertical");
  const moreLabel = t("toolbar.moreActions");
  moreBtn.setAttr("aria-label", moreLabel);
  moreBtn.setAttr("title", moreLabel);
  moreBtn.addEventListener("click", (ev) => {
    openActionMenu(ev, moreBtn, [
      {
        title: labels?.exportText ?? t("toolbar.export"),
        icon: "download",
        onSelect: options.onExport,
      },
      {
        title: labels?.importText ?? t("toolbar.import"),
        icon: "upload",
        onSelect: options.onImport,
      },
      { separator: true },
      {
        title: labels?.resetText ?? t("toolbar.reset"),
        icon: "rotate-ccw",
        warning: true,
        onSelect: options.onReset,
      },
    ]);
  });

  if (options.subtitle) {
    containerEl.createDiv({ cls: "struct-latex-rule-section-subtitle", text: options.subtitle });
  }

  const toolbar = containerEl.createDiv({ cls: "struct-latex-toolbar" });
  const searchWrap = toolbar.createDiv({ cls: "struct-latex-search-wrap" });
  const searchIcon = searchWrap.createSpan({ cls: "struct-latex-search-icon" });
  setIcon(searchIcon, "search");

  const searchInput = searchWrap.createEl("input", {
    type: "search",
    cls: "struct-latex-search",
    placeholder: t("toolbar.searchPlaceholder"),
  });
  searchInput.value = filter.searchQuery;

  const clearBtn = searchWrap.createEl("button", {
    type: "button",
    cls: "clickable-icon struct-latex-search-clear",
  });
  setIcon(clearBtn, "x");
  clearBtn.setAttr("aria-label", t("toolbar.clearSearch"));
  const syncClearBtn = () => clearBtn.toggleClass("struct-latex-hidden", searchInput.value.length === 0);
  syncClearBtn();

  const win = containerEl.ownerDocument.defaultView ?? window;
  let searchTimer: number | null = null;
  searchInput.addEventListener("input", () => {
    filter.searchQuery = searchInput.value;
    syncClearBtn();
    if (searchTimer !== null) win.clearTimeout(searchTimer);
    searchTimer = win.setTimeout(() => {
      searchTimer = null;
      onFilterChanged();
    }, 120);
  });

  clearBtn.addEventListener("click", () => {
    if (searchTimer !== null) {
      win.clearTimeout(searchTimer);
      searchTimer = null;
    }
    searchInput.value = "";
    filter.searchQuery = "";
    syncClearBtn();
    onFilterChanged();
    searchInput.focus();
  });

  const groupSelect = toolbar.createEl("select", { cls: "dropdown struct-latex-group-select" });
  const syncRulesMeta = (nextRules: readonly { group: string }[]) => {
    countBadge.setText(String(nextRules.length));
    const groups = Array.from(new Set(nextRules.map((r) => r.group)));
    groupSelect.empty();
    groupSelect.createEl("option", { value: "all", text: t("toolbar.allGroups") });
    for (const g of groups) groupSelect.createEl("option", { value: g, text: g });
    filter.groupFilter = groups.includes(filter.groupFilter) ? filter.groupFilter : "all";
    groupSelect.value = filter.groupFilter;
  };
  syncRulesMeta(options.rules);
  groupSelect.addEventListener("change", () => {
    filter.groupFilter = groupSelect.value;
    onFilterChanged();
  });

  const chipRow = containerEl.createDiv({ cls: "struct-latex-filter-chips" });
  const typeButtons: Array<{ type: RuleType; label: string }> = [
    { type: "js", label: t("toolbar.toggleJs") },
    { type: "regex", label: t("toolbar.toggleRegex") },
    { type: "text", label: labels?.textToggleText ?? t("toolbar.toggleText") },
  ];

  for (const item of typeButtons) {
    const chip = chipRow.createEl("button", {
      type: "button",
      cls: `struct-latex-filter-chip is-type-${item.type}`,
      text: item.label,
    });
    const syncState = () => {
      const active = filter.enabledTypes.has(item.type);
      chip.toggleClass("is-active", active);
      chip.setAttr("aria-pressed", active ? "true" : "false");
    };
    syncState();
    chip.addEventListener("click", () => {
      if (filter.enabledTypes.has(item.type)) {
        filter.enabledTypes.delete(item.type);
      } else {
        filter.enabledTypes.add(item.type);
      }
      syncState();
      onFilterChanged();
    });
  }

  return { syncRulesMeta };
}
