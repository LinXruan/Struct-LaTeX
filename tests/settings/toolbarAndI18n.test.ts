import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLocale, mapRawLanguageToLocale, resolveAppLocale, setLocale, t } from "../../src/i18n";
import { EN_MESSAGES } from "../../src/i18n/en";
import { ZH_MESSAGES } from "../../src/i18n/zh";
import { formatTriggerBadge, matchesKeyEventCombo, resolveFeatureKeybind } from "../../src/input/keybindUtils";
import { evaluateRulePreview } from "../../src/input/previewEvaluator";
import { DEFAULT_PLUGIN_SETTINGS, InputRule, RuleType } from "../../src/input/types";
import { validateRule } from "../../src/input/validation";
import { createDefaultFilterState, filterRules } from "../../src/settings/ruleFilter";

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

describe("Settings Toolbar — Multi-Select Type Filter", () => {
  it("filters rules via multi-select JS/Regex/Text toggle buttons, group, and search", () => {
    const filter = createDefaultFilterState();
    assert.equal(filterRules(SAMPLE_RULES, filter).length, 3);

    // Disable text -> shows JS and Regex
    filter.enabledTypes.delete("text");
    assert.deepEqual(
      filterRules(SAMPLE_RULES, filter).map((r) => r.id),
      ["r-1", "j-1"]
    );

    // Combine with group filter
    filter.groupFilter = "字母与字体";
    assert.deepEqual(
      filterRules(SAMPLE_RULES, filter).map((r) => r.id),
      ["r-1"]
    );

    // Reset group and turn all three toggles off -> yields 0 rules
    filter.groupFilter = "all";
    filter.enabledTypes.clear();
    assert.equal(filterRules(SAMPLE_RULES, filter).length, 0);

    // Re-enable single type with search query
    filter.enabledTypes = new Set<RuleType>(["text"]);
    filter.searchQuery = ";a";
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

      assert.equal(t("row.editBtn", undefined, "zh"), "编辑");
      assert.equal(t("row.editBtn", undefined, "en"), "Edit");
      assert.equal(t("settings.nav.input", undefined, "zh"), "智能输入");
      assert.equal(t("settings.nav.delete", undefined, "zh"), "结构删除");
      assert.equal(t("settings.nav.jump", undefined, "zh"), "光标跳转");
      assert.equal(t("settings.nav.special", undefined, "zh"), "特殊设置");
      assert.equal(t("settings.nav.about", undefined, "zh"), "关于");
      assert.equal(t("settings.group.core", undefined, "zh"), "核心功能");
      assert.equal(t("settings.group.general", undefined, "zh"), "通用与关于");
      assert.equal(t("settings.addRule.btn", undefined, "zh"), "+ 新增");
      assert.equal(t("settings.keybind.recordShort", undefined, "en"), "Record");
      assert.equal(t("settings.keybind.name", undefined, "zh"), "按键绑定");
      assert.equal(t("trigger.mobileToolbar.name", undefined, "zh"), "移动端工具栏");
      assert.equal(t("trigger.addRule.name", undefined, "zh"), "输入触发规则");

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

describe("Feature Keybind Matching & Plugin Settings Defaults", () => {
  it("provides Backspace, Tab, and Special Settings defaults and normalizes invalid keybinds safely", () => {
    assert.equal(DEFAULT_PLUGIN_SETTINGS.smartBackspaceKey, "Backspace");
    assert.equal(DEFAULT_PLUGIN_SETTINGS.smartJumpKey, "Tab");
    assert.equal(DEFAULT_PLUGIN_SETTINGS.smartJumpRightMultiEnabled, true);
    assert.equal(DEFAULT_PLUGIN_SETTINGS.smartJumpRightMultiKey, "Shift+Tab");
    assert.equal(DEFAULT_PLUGIN_SETTINGS.smartJumpLeftSingleEnabled, true);
    assert.equal(DEFAULT_PLUGIN_SETTINGS.smartJumpLeftSingleKey, "");
    assert.equal(DEFAULT_PLUGIN_SETTINGS.smartJumpLeftMultiEnabled, true);
    assert.equal(DEFAULT_PLUGIN_SETTINGS.smartJumpLeftMultiKey, "");
    assert.equal(DEFAULT_PLUGIN_SETTINGS.parseAmbiguousBars, true);
    assert.equal(DEFAULT_PLUGIN_SETTINGS.autoSizeParens, true);
    assert.equal(DEFAULT_PLUGIN_SETTINGS.inlineMathPreview, "below");
    assert.ok(t("settings.special.parseAmbiguousBars.name", undefined, "zh").includes("双竖线"));
    assert.ok(t("settings.special.parseAmbiguousBars.name", undefined, "en").includes("Bar"));
    assert.ok(t("settings.special.autoSizeParens.name", undefined, "zh").includes("小括号"));
    assert.ok(t("settings.special.autoSizeParens.name", undefined, "en").includes("Parentheses"));
    assert.ok(t("settings.special.inlineMathPreview.name", undefined, "zh").includes("行内公式"));
    assert.ok(t("settings.special.inlineMathPreview.name", undefined, "en").includes("Inline Math"));

    assert.equal(resolveFeatureKeybind("alt+d", "Backspace"), "Alt+D");
    assert.equal(resolveFeatureKeybind("shift+tab", "Tab"), "Shift+Tab");
    assert.equal(resolveFeatureKeybind("", "Backspace"), "Backspace");
    assert.equal(resolveFeatureKeybind("Shift+", "Tab"), "Tab");
  });

  it("matches keyboard events against configured delete/jump keybinds accurately", () => {
    const baseEv = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "Backspace" }, undefined, "Backspace"), true);
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "Tab" }, undefined, "Tab"), true);
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "Tab", shiftKey: true }, "Tab", "Tab"), false);
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "Tab", shiftKey: true }, "shift+tab", "Tab"), true);
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "Tab" }, "", ""), false);
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "o" }, "", ""), false);

    // Single printable key `o` matches `o` (blocking auto/JS rules) but not `Shift+O`
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "o" }, "o", "Tab"), true);
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "O", shiftKey: true }, "o", "Tab"), false);

    // Platform Mod key handling (non-Mac Ctrl vs Mac Meta)
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "j", ctrlKey: true }, "Mod+J", "Tab", false), true);
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "j", metaKey: true }, "Mod+J", "Tab", true), true);
    assert.equal(matchesKeyEventCombo({ ...baseEv, key: "j", ctrlKey: true }, "Mod+J", "Tab", true), false);
  });
});
