import { InputRule, RuleType } from "../input/types";

export interface FilterState {
  searchQuery: string;
  groupFilter: string;
  typeFilter: "all" | RuleType;
}

export function createDraftRule(type: RuleType): InputRule {
  const id = `user-${type}-${Date.now().toString(36)}`;
  if (type === "text") {
    return {
      id,
      name: "新纯替换规则",
      group: "自定义",
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
      name: "新正则规则",
      group: "自定义",
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
    name: "新 JavaScript 规则",
    group: "自定义",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    exampleInput: "",
    code: "// 返回 { replaceLength, insert, cursorOffset? } 或 null\nreturn null;",
  };
}

export function filterRules(rules: readonly InputRule[], filter: FilterState): InputRule[] {
  const query = filter.searchQuery.trim().toLowerCase();
  const matched: InputRule[] = [];

  for (const r of rules) {
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
    placeholder: "搜索规则名、触发词、输出...",
  });
  searchInput.value = filter.searchQuery;
  searchInput.addEventListener("input", () => {
    filter.searchQuery = searchInput.value;
    onFilterChanged();
  });

  const groups = Array.from(new Set(rules.map((r) => r.group)));
  const groupSelect = toolbar.createEl("select", { cls: "dropdown" });
  groupSelect.createEl("option", { value: "all", text: "全部分组" });
  for (const g of groups) groupSelect.createEl("option", { value: g, text: g });
  groupSelect.value = groups.includes(filter.groupFilter) ? filter.groupFilter : "all";
  filter.groupFilter = groupSelect.value;
  groupSelect.addEventListener("change", () => {
    filter.groupFilter = groupSelect.value;
    onFilterChanged();
  });

  const typeSelect = toolbar.createEl("select", { cls: "dropdown" });
  typeSelect.createEl("option", { value: "all", text: "全部类型" });
  typeSelect.createEl("option", { value: "text", text: "纯替换" });
  typeSelect.createEl("option", { value: "regex", text: "正则" });
  typeSelect.createEl("option", { value: "js", text: "JavaScript" });
  typeSelect.value = filter.typeFilter;
  typeSelect.addEventListener("change", () => {
    filter.typeFilter = typeSelect.value as "all" | RuleType;
    onFilterChanged();
  });

  const ioBar = containerEl.createDiv({ cls: "struct-latex-io-bar" });
  ioBar.createEl("button", { text: "导出 rules.json" }).addEventListener("click", onIoAction.onExport);
  ioBar.createEl("button", { text: "导入 rules.json" }).addEventListener("click", onIoAction.onImport);
  ioBar
    .createEl("button", { cls: "mod-warning", text: "恢复默认规则" })
    .addEventListener("click", onIoAction.onReset);
}
