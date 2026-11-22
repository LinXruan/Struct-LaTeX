import { t } from "../i18n";
import { InputRule, RuleType } from "../input/types";
import type { InlinePanelMode } from "./ruleInlinePanels";

export interface FilterState {
  searchQuery: string;
  groupFilter: string;
  enabledTypes: Set<RuleType>;
}

export interface ToolbarHandle {
  syncGroups: (rules: readonly InputRule[]) => void;
  syncActivePanel: (mode: InlinePanelMode | null) => void;
}

export function createDefaultFilterState(): FilterState {
  return {
    searchQuery: "",
    groupFilter: "all",
    enabledTypes: new Set<RuleType>(["js", "regex", "text"]),
  };
}

export function createDraftRule(type: RuleType): InputRule {
  const id = `user-${type}-${Date.now().toString(36)}`;
  if (type === "text") {
    return {
      id,
      name: t("draft.textName"),
      group: t("draft.group"),
      type: "text",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      trigger: "",
      replacement: "",
    };
  }
  if (type === "regex") {
    return {
      id,
      name: t("draft.regexName"),
      group: t("draft.group"),
      type: "regex",
      enabled: true,
      scope: "math",
      triggerMode: "auto",
      trigger: "",
      replacement: "",
      exampleInput: "",
    };
  }
  return {
    id,
    name: t("draft.jsName"),
    group: t("draft.group"),
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    exampleInput: "",
    code: t("draft.jsTemplate"),
  };
}

export function filterRules(rules: readonly InputRule[], filter: FilterState): InputRule[] {
  if (filter.enabledTypes.size === 0) return [];

  const query = filter.searchQuery.trim().toLowerCase();
  const matched: InputRule[] = [];

  for (const r of rules) {
    if (!filter.enabledTypes.has(r.type)) continue;
    if (filter.groupFilter !== "all" && r.group !== filter.groupFilter) continue;
    if (query) {
      const hay = [
        r.name,
        r.group,
        r.id,
        r.type === "text" || r.type === "regex" ? `${r.trigger} ${r.replacement}` : r.exampleInput ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(query)) continue;
    }
    matched.push(r);
  }
  return matched;
}

export function renderFilterToolbar(
  containerEl: HTMLElement,
  rules: readonly InputRule[],
  filter: FilterState,
  onFilterChanged: () => void,
  onIoAction: {
    onExport: () => void;
    onImport: () => void;
    onReset: () => void;
  }
): ToolbarHandle {
  const toolbar = containerEl.createDiv({ cls: "struct-latex-toolbar" });
  const searchInput = toolbar.createEl("input", {
    type: "search",
    cls: "struct-latex-search",
    placeholder: t("toolbar.searchPlaceholder"),
  });
  searchInput.value = filter.searchQuery;
  const win = containerEl.ownerDocument.defaultView ?? window;
  let searchTimer: number | null = null;
  searchInput.addEventListener("input", () => {
    filter.searchQuery = searchInput.value;
    if (searchTimer !== null) win.clearTimeout(searchTimer);
    searchTimer = win.setTimeout(() => {
      searchTimer = null;
      onFilterChanged();
    }, 120);
  });

  const groupSelect = toolbar.createEl("select", { cls: "dropdown" });
  const syncGroups = (nextRules: readonly InputRule[]) => {
    const groups = Array.from(new Set(nextRules.map((r) => r.group)));
    groupSelect.empty();
    groupSelect.createEl("option", { value: "all", text: t("toolbar.allGroups") });
    for (const g of groups) groupSelect.createEl("option", { value: g, text: g });
    filter.groupFilter = groups.includes(filter.groupFilter) ? filter.groupFilter : "all";
    groupSelect.value = filter.groupFilter;
  };
  syncGroups(rules);
  groupSelect.addEventListener("change", () => {
    filter.groupFilter = groupSelect.value;
    onFilterChanged();
  });

  const ioBar = containerEl.createDiv({ cls: "struct-latex-io-bar" });
  const ioButtons: Record<InlinePanelMode, HTMLButtonElement> = {
    export: ioBar.createEl("button", { cls: "struct-latex-io-btn", text: t("toolbar.export") }),
    import: ioBar.createEl("button", { cls: "struct-latex-io-btn", text: t("toolbar.import") }),
    reset: ioBar.createEl("button", { cls: "struct-latex-io-btn mod-warning", text: t("toolbar.reset") }),
  };
  ioButtons.export.addEventListener("click", onIoAction.onExport);
  ioButtons.import.addEventListener("click", onIoAction.onImport);
  ioButtons.reset.addEventListener("click", onIoAction.onReset);

  const syncActivePanel = (activeMode: InlinePanelMode | null) => {
    for (const mode of ["export", "import", "reset"] as const) {
      const btn = ioButtons[mode];
      const active = mode === activeMode;
      btn.toggleClass("is-active", active);
      btn.setAttr("aria-expanded", active ? "true" : "false");
    }
  };
  syncActivePanel(null);

  const toggleGroup = ioBar.createDiv({ cls: "struct-latex-type-filter-group" });
  const typeButtons: Array<{ type: RuleType; label: string }> = [
    { type: "js", label: t("toolbar.toggleJs") },
    { type: "regex", label: t("toolbar.toggleRegex") },
    { type: "text", label: t("toolbar.toggleText") },
  ];

  for (const item of typeButtons) {
    const btn = toggleGroup.createEl("button", {
      cls: `struct-latex-type-toggle is-type-${item.type}`,
      text: item.label,
    });
    const syncState = () => {
      const active = filter.enabledTypes.has(item.type);
      btn.toggleClass("is-active", active);
      btn.setAttr("aria-pressed", active ? "true" : "false");
    };
    syncState();
    btn.addEventListener("click", () => {
      if (filter.enabledTypes.has(item.type)) {
        filter.enabledTypes.delete(item.type);
      } else {
        filter.enabledTypes.add(item.type);
      }
      syncState();
      onFilterChanged();
    });
  }

  return { syncGroups, syncActivePanel };
}
