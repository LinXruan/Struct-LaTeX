import { t } from "../i18n";
import { InputRule, RuleType } from "../input/types";

export interface FilterState {
  searchQuery: string;
  groupFilter: string;
  enabledTypes: Set<RuleType>;
}

/**
 * Creates a fresh filter state with all rule types enabled.
 */
export function createDefaultFilterState(): FilterState {
  return {
    searchQuery: "",
    groupFilter: "all",
    enabledTypes: new Set<RuleType>(["js", "regex", "text"]),
  };
}

/**
 * Builds a blank draft input rule of the requested type.
 */
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

/**
 * Filters input rules by active type chips, group dropdown, and search query.
 */
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
