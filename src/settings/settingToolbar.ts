import { t } from "../i18n";
import { InputRule, RuleType } from "../input/types";

export interface FilterState {
  searchQuery: string;
  groupFilter: string;
  typeFilter: "all" | RuleType;
  enabledTypes: Set<RuleType>;
}

export function createDefaultFilterState(): FilterState {
  return {
    searchQuery: "",
    groupFilter: "all",
    typeFilter: "all",
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
    if (filter.typeFilter !== "all" && r.type !== filter.typeFilter) continue;
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
): void {
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

  const groups = Array.from(new Set(rules.map((r) => r.group)));
  const groupSelect = toolbar.createEl("select", { cls: "dropdown" });
  groupSelect.createEl("option", { value: "all", text: t("toolbar.allGroups") });
  for (const g of groups) groupSelect.createEl("option", { value: g, text: g });
  groupSelect.value = groups.includes(filter.groupFilter) ? filter.groupFilter : "all";
  filter.groupFilter = groupSelect.value;
  groupSelect.addEventListener("change", () => {
    filter.groupFilter = groupSelect.value;
    onFilterChanged();
  });

  const typeSelect = toolbar.createEl("select", { cls: "dropdown" });
  typeSelect.createEl("option", { value: "all", text: t("toolbar.allTypes") });
  typeSelect.createEl("option", { value: "text", text: t("toolbar.typeText") });
  typeSelect.createEl("option", { value: "regex", text: t("toolbar.typeRegex") });
  typeSelect.createEl("option", { value: "js", text: t("toolbar.typeJs") });
  typeSelect.value = filter.typeFilter;
  typeSelect.addEventListener("change", () => {
    filter.typeFilter = typeSelect.value as "all" | RuleType;
    onFilterChanged();
  });

  const ioBar = containerEl.createDiv({ cls: "struct-latex-io-bar" });
  ioBar.createEl("button", { text: t("toolbar.export") }).addEventListener("click", onIoAction.onExport);
  ioBar.createEl("button", { text: t("toolbar.import") }).addEventListener("click", onIoAction.onImport);
  ioBar
    .createEl("button", { cls: "mod-warning", text: t("toolbar.reset") })
    .addEventListener("click", onIoAction.onReset);

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
}
