import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLocale, mapRawLanguageToLocale, resolveAppLocale, setLocale, t } from "../../src/i18n";
import { EN_MESSAGES } from "../../src/i18n/en";
import { ZH_MESSAGES } from "../../src/i18n/zh";
import { formatTriggerBadge } from "../../src/input/keybindUtils";
import { evaluateRulePreview } from "../../src/input/previewEvaluator";
import { InputRule, RuleType } from "../../src/input/types";
import { validateRule } from "../../src/input/validation";
import { createDefaultFilterState, filterRules } from "../../src/settings/settingToolbar";

const SAMPLE_RULES: InputRule[] = [
  {
    id: "t-1",
    name: "alpha",
    group: "希腊字母",
    type: "text",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    trigger: ";a",
    replacement: "\\alpha",
  },
  {
    id: "r-1",
    name: "bf",
    group: "字母与字体",
    type: "regex",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    trigger: "bf([a-zA-Z])",
    replacement: "\\mathbf{$1}",
    exampleInput: "bfx",
  },
  {
    id: "j-1",
    name: "sum",
    group: "大型算子与微积分",
    type: "js",
    enabled: true,
    scope: "math",
    triggerMode: "auto",
    exampleInput: "smkn",
    code: 'return { replaceLength: 4, insert: "\\\\sum_{k=1}^{n}" };',
  },
];

describe("Settings Toolbar — Compound Type Filter", () => {
  it("supports combining type dropdown with multi-select JS/Regex/Text toggle buttons", () => {
    const filter = createDefaultFilterState();
    assert.equal(filterRules(SAMPLE_RULES, filter).length, 3);

    // Disable text -> shows JS and Regex
    filter.enabledTypes.delete("text");
    assert.deepEqual(
      filterRules(SAMPLE_RULES, filter).map((r) => r.id),
      ["r-1", "j-1"]
    );

    // Dropdown narrows further to regex
    filter.typeFilter = "regex";
    assert.deepEqual(
      filterRules(SAMPLE_RULES, filter).map((r) => r.id),
      ["r-1"]
    );

    // Conflict between dropdown (regex) and toggle (regex off) yields 0
    filter.enabledTypes.delete("regex");
    assert.equal(filterRules(SAMPLE_RULES, filter).length, 0);

    // All three toggles off -> yields 0 rules regardless of dropdown
    filter.typeFilter = "all";
    filter.enabledTypes.clear();
    assert.equal(filterRules(SAMPLE_RULES, filter).length, 0);

    // Re-enable single type
    filter.enabledTypes = new Set<RuleType>(["text"]);
    assert.deepEqual(
      filterRules(SAMPLE_RULES, filter).map((r) => r.id),
      ["t-1"]
    );
  });
});

describe("I18n — Dictionary Parity, Obsidian Language Resolution & Localized Messages", () => {
  it("has identical keys and non-empty translations across zh and en dictionaries", () => {
    const zhKeys = Object.keys(ZH_MESSAGES).sort();
    const enKeys = Object.keys(EN_MESSAGES).sort();
    assert.deepEqual(enKeys, zhKeys);

    for (const k of zhKeys) {
      const key = k as keyof typeof ZH_MESSAGES;
      assert.ok(ZH_MESSAGES[key].length > 0, `Empty zh key: ${k}`);
      assert.ok(EN_MESSAGES[key].length > 0, `Empty en key: ${k}`);
    }
  });

  it("maps Obsidian language codes cleanly with auto/zh/en override support", () => {
    assert.equal(mapRawLanguageToLocale("zh"), "zh");
    assert.equal(mapRawLanguageToLocale("zh-CN"), "zh");
    assert.equal(mapRawLanguageToLocale("zh-TW"), "zh");
    assert.equal(mapRawLanguageToLocale("en"), "en");
    assert.equal(mapRawLanguageToLocale("en-GB"), "en");
    assert.equal(mapRawLanguageToLocale("ja"), "en");
    assert.equal(mapRawLanguageToLocale(undefined), "en");

    assert.equal(resolveAppLocale("auto", "zh-CN"), "zh");
    assert.equal(resolveAppLocale("auto", "en"), "en");
    assert.equal(resolveAppLocale("en", "zh-CN"), "en");
    assert.equal(resolveAppLocale("zh", "en"), "zh");
  });

  it("localizes validation, preview, and trigger badges when switching locale", () => {
    const prev = getLocale();
    try {
      setLocale("en");
      const val = validateRule({
        id: "t1",
        name: "bad",
        group: "g",
        type: "text",
        enabled: true,
        scope: "math",
        triggerMode: "auto",
        trigger: "",
        replacement: "x",
      });
      assert.equal(val.valid, false);
      assert.equal(val.errors[0], t("val.textEmptyTrigger", undefined, "en"));

      const jsNoSample = evaluateRulePreview(
        {
          id: "j0",
          name: "js",
          group: "g",
          type: "js",
          enabled: true,
          scope: "math",
          triggerMode: "auto",
          code: "return null;",
        },
        "latex"
      );
      assert.equal(jsNoSample.rawOutput, "(No example input)");

      assert.equal(
        formatTriggerBadge({
          id: "c",
          name: "c",
          group: "g",
          type: "text",
          enabled: true,
          scope: "math",
          triggerMode: "confirm",
          confirmKey: "Tab",
          trigger: "a",
          replacement: "b",
        }),
        "Trigger+Tab"
      );
    } finally {
      setLocale(prev);
    }
  });
});
