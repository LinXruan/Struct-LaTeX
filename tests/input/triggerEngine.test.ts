import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRuleContext } from "../../src/input/contextBuilder";
import {
  compileTriggerRules,
  evaluateTriggerPreview,
  evaluateTriggerRules,
  resolvePureStructuralDeleteWithTrigger,
  resolvePureStructuralJumpWithTrigger,
  validateTriggerFile,
  validateTriggerRule,
} from "../../src/input/triggerEngine";
import { TriggerRule } from "../../src/input/triggerTypes";
import { DEFAULT_PLUGIN_SETTINGS } from "../../src/input/types";
import { buildMathTree } from "../../src/parser/builder";
import {
  addCommandToMobileToolbar,
  isCommandInMobileToolbar,
  MobileToolbarAppLike,
  removeCommandFromMobileToolbar,
  SMART_BACKSPACE_FULL_CMD_ID,
  SMART_JUMP_FULL_CMD_ID,
  SMART_JUMP_LEFT_MULTI_FULL_CMD_ID,
  SMART_JUMP_LEFT_SINGLE_FULL_CMD_ID,
  SMART_JUMP_RIGHT_MULTI_FULL_CMD_ID,
} from "../../src/settings/mobileToolbarSync";
import { RuleStorageAdapter } from "../../src/settings/ruleStore";
import { TriggerStore } from "../../src/settings/triggerStore";

class MemoryAdapter implements RuleStorageAdapter {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }
  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }
  async read(path: string): Promise<string> {
    const val = this.files.get(path);
    if (val === undefined) throw new Error(`ENOENT: ${path}`);
    return val;
  }
  async write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }
}

function makeMathCtx(before: string, key: string, after = "") {
  const tree = buildMathTree(before + after);
  return buildRuleContext({
    key,
    before,
    after,
    inMath: true,
    inBlockMath: false,
    inCode: false,
    tree,
    relPos: before.length,
  });
}

describe("Trigger Engine — Validation, Guards, Text/Regex/JS Evaluation & Prefix Stripping", () => {
  it("validates trigger rules and trigger.json files strictly", () => {
    assert.equal(
      validateTriggerRule({
        id: "t1",
        name: "o-jump",
        group: "Custom",
        type: "text",
        enabled: true,
        trigger: "o",
      }).valid,
      true
    );

    assert.equal(
      validateTriggerRule({
        id: "t-empty",
        name: "empty",
        group: "Custom",
        type: "text",
        enabled: true,
        trigger: "",
      }).valid,
      false
    );

    assert.equal(
      validateTriggerRule({
        id: "r-bad",
        name: "bad-regex",
        group: "Custom",
        type: "regex",
        enabled: true,
        trigger: "[unclosed",
      }).valid,
      false
    );

    assert.equal(
      validateTriggerRule({
        id: "j-bad",
        name: "bad-js",
        group: "Custom",
        type: "js",
        enabled: true,
        code: "return {{{;",
      }).valid,
      false
    );

    assert.equal(
      validateTriggerFile({
        version: 1,
        jumpRules: [],
        deleteRules: [],
      }).valid,
      true
    );

    assert.equal(
      validateTriggerFile({
        version: 1,
        jumpRules: [],
        jumpRightMultiRules: [],
        jumpLeftSingleRules: [],
        jumpLeftMultiRules: [],
        deleteRules: [],
      }).valid,
      true
    );

    assert.equal(
      validateTriggerFile({
        version: 1,
        jumpRules: [],
        jumpRightMultiRules: "bad",
        deleteRules: [],
      }).valid,
      false
    );

    assert.equal(
      validateTriggerFile({
        version: 1,
        jumpRules: [],
        jumpLeftSingleRules: "bad",
        deleteRules: [],
      }).valid,
      false
    );
  });

  it("matches text, regex, and JS trigger rules while protecting \\command, \\text{}, and \\begin{}", () => {
    const rules: TriggerRule[] = [
      {
        id: "jump-o",
        name: "o",
        group: "Custom",
        type: "text",
        enabled: true,
        trigger: "o",
      },
      {
        id: "jump-regex",
        name: "jj",
        group: "Custom",
        type: "regex",
        enabled: true,
        trigger: "j{2}",
        exampleInput: "jj",
      },
      {
        id: "jump-js",
        name: "js-trigger",
        group: "Custom",
        type: "js",
        enabled: true,
        exampleInput: ";;",
        code: 'if (ctx.text.endsWith(";;")) return 2; return null;',
      },
    ];

    const compiled = compileTriggerRules(rules);

    // 1. Inside normal math slot `\frac{a|}{b}` typing `o` matches with replaceLength = 1
    const slotCtx = makeMathCtx("\\frac{a", "o", "}{b}");
    const slotMatches = evaluateTriggerRules(compiled, slotCtx);
    assert.equal(slotMatches.length, 1);
    assert.equal(slotMatches[0].rule.id, "jump-o");
    assert.deepEqual(slotMatches[0].action, { replaceLength: 1, deleteAfter: 0 });

    // 2. While typing `\cos` (`\c` + `o`), `excludeInCommand` (default true) blocks `o` hijacking!
    const cmdCtx = makeMathCtx("\\c", "o", "");
    assert.equal(cmdCtx.inCommandTyping, true);
    assert.equal(evaluateTriggerRules(compiled, cmdCtx).length, 0);

    // 2b. Non-letter trigger after a complete `\command` (`\;` + `;` must not slice `\;`, while `\alpha;` + `;` works)
    const sliceCmdCtx = makeMathCtx("\\;", ";", "");
    assert.equal(evaluateTriggerRules(compiled, sliceCmdCtx).length, 0);
    const afterAlphaCtx = makeMathCtx("\\frac{\\alpha;", ";", "}{b}");
    assert.equal(afterAlphaCtx.inCommandTyping, false);
    assert.equal(evaluateTriggerRules(compiled, afterAlphaCtx).length, 1);

    // 3. Inside `\text{hell|}` typing `o`, `excludeInTextMode` (default true) blocks `o` hijacking!
    const textCtx = makeMathCtx("\\text{hell", "o", "}");
    assert.equal(textCtx.inTextMode, true);
    assert.equal(evaluateTriggerRules(compiled, textCtx).length, 0);

    // 4. Inside `\begin{matr|}` typing `o`, `excludeInEnvName` (default true) blocks `o` hijacking!
    const envCtx = makeMathCtx("\\begin{matr", "o", "}");
    assert.equal(envCtx.inEnvName, true);
    assert.equal(evaluateTriggerRules(compiled, envCtx).length, 0);

    // 5. Regex rule `j{2}` matches when typing second `j` after `a + j`
    const regexCtx = makeMathCtx("a + j", "j", "");
    const regexMatches = evaluateTriggerRules(compiled, regexCtx);
    assert.equal(regexMatches.length, 1);
    assert.equal(regexMatches[0].rule.id, "jump-regex");
    assert.equal(regexMatches[0].action.replaceLength, 2);

    // 6. JS rule returning number `2` matches `;;`
    const jsCtx = makeMathCtx("x + ;", ";", "");
    const jsMatches = evaluateTriggerRules(compiled, jsCtx);
    assert.equal(jsMatches.length, 1);
    assert.equal(jsMatches[0].rule.id, "jump-js");
    assert.equal(jsMatches[0].action.replaceLength, 2);

    // 7. Live preview evaluation
    const previewRes = evaluateTriggerPreview(rules[1]);
    assert.equal(previewRes.matched, true);
  });

  it("strips already-inserted multi-char trigger prefix before resolving structural jump and delete", () => {
    // Multi-char jump trigger `oo`: first `o` is in doc (`\frac{ao}{b}` at index 8), second `o` arrives
    const jumpRes = resolvePureStructuralJumpWithTrigger("\\frac{ao}{b}", 7, 8);
    assert.equal(jumpRes.cleanSource, "\\frac{a}{b}");
    // Cursor in `\frac{a|}{b}` (index 7) jumps into `{|b}` (index 9 in cleanSource)
    assert.equal(jumpRes.targetCleanRelPos, 9);

    // Multi-char jump trigger `oo` in rightMulti mode jumps to end of same-level solid run without crossing `\frac`
    const rightMultiJumpRes = resolvePureStructuralJumpWithTrigger(
      "ooa + b + \\frac{1}{2}",
      0,
      2,
      true,
      "rightMulti"
    );
    assert.equal(rightMultiJumpRes.cleanSource, "a + b + \\frac{1}{2}");
    assert.equal(rightMultiJumpRes.targetCleanRelPos, 8);

    // Multi-char jump trigger `jj` in leftSingle & leftMulti modes
    const leftSingleRes = resolvePureStructuralJumpWithTrigger(
      "a + bjj",
      5,
      7,
      true,
      "leftSingle"
    );
    assert.equal(leftSingleRes.cleanSource, "a + b");
    assert.equal(leftSingleRes.targetCleanRelPos, 4);

    const leftMultiRes = resolvePureStructuralJumpWithTrigger(
      "\\frac{1}{2} + a + bjj",
      19,
      21,
      true,
      "leftMulti"
    );
    assert.equal(leftMultiRes.cleanSource, "\\frac{1}{2} + a + b");
    assert.equal(leftMultiRes.targetCleanRelPos, 12);

    // Multi-char delete trigger `dd`: first `d` is in doc (`\sin d` at index 5..6), second `d` arrives
    const delSpan = resolvePureStructuralDeleteWithTrigger("\\sin d", 5, 6);
    assert.deepEqual(delSpan, { from: 0, to: 6 });

    // When cursor after stripping prefix is NOT at a valid structural delete site (`123d` -> `123|`), returns null
    const noDelSpan = resolvePureStructuralDeleteWithTrigger("123d", 3, 4);
    assert.equal(noDelSpan, null);
  });
});

describe("TriggerStore & Mobile Toolbar Auto-Injection", () => {
  it("initializes default empty trigger.json and persists jumpRules and deleteRules", async () => {
    const adapter = new MemoryAdapter();
    const store = new TriggerStore(
      { vault: { configDir: ".obsidian", adapter } },
      { id: "struct-latex" }
    );

    const { loadError } = await store.load();
    assert.equal(loadError, null);
    assert.equal(store.getRules("jump").length, 0);
    assert.equal(store.getRules("jumpRightMulti").length, 0);
    assert.equal(store.getRules("jumpLeftSingle").length, 0);
    assert.equal(store.getRules("jumpLeftMulti").length, 0);
    assert.equal(store.getRules("delete").length, 0);
    assert.equal(await adapter.exists(".obsidian/plugins/struct-latex/trigger.json"), true);

    await store.saveCategory("jump", [
      {
        id: "j1",
        name: "o",
        group: "Custom",
        type: "text",
        enabled: true,
        trigger: "o",
      },
    ]);
    await store.saveCategory("jumpRightMulti", [
      {
        id: "jm1",
        name: "oo",
        group: "Custom",
        type: "text",
        enabled: true,
        trigger: "oo",
      },
    ]);
    await store.saveCategory("jumpLeftSingle", [
      {
        id: "jl1",
        name: "hh",
        group: "Custom",
        type: "text",
        enabled: true,
        trigger: "hh",
      },
    ]);
    await store.saveCategory("jumpLeftMulti", [
      {
        id: "jlm1",
        name: "hhh",
        group: "Custom",
        type: "text",
        enabled: true,
        trigger: "hhh",
      },
    ]);
    assert.equal(store.getRules("jump").length, 1);
    assert.equal(store.getCompiled("jump").length, 1);
    assert.equal(store.getRules("jumpRightMulti").length, 1);
    assert.equal(store.getCompiled("jumpRightMulti").length, 1);
    assert.equal(store.getRules("jumpLeftSingle").length, 1);
    assert.equal(store.getCompiled("jumpLeftSingle").length, 1);
    assert.equal(store.getRules("jumpLeftMulti").length, 1);
    assert.equal(store.getCompiled("jumpLeftMulti").length, 1);
    assert.equal(store.getRules("delete").length, 0);

    await store.resetCategory("jump");
    assert.equal(store.getRules("jump").length, 0);
    assert.equal(store.getRules("jumpRightMulti").length, 1);
  });

  it("injects struct-latex:smart-jump into mobileToolbarCommands once and supports add/remove", () => {
    assert.equal(DEFAULT_PLUGIN_SETTINGS.mobileToolbarInitialized, false);

    let toolbarCommands = ["editor:undo", "editor:redo", "editor:toggle-bold"];
    let updateCount = 0;

    const mockApp: MobileToolbarAppLike = {
      vault: {
        getConfig: (key) => (key === "mobileToolbarCommands" ? toolbarCommands : undefined),
        setConfig: (key, val) => {
          if (key === "mobileToolbarCommands" && Array.isArray(val)) {
            toolbarCommands = val as string[];
          }
        },
      },
      mobileToolbar: {
        update: () => {
          updateCount++;
        },
      },
    };

    assert.equal(isCommandInMobileToolbar(mockApp, SMART_JUMP_FULL_CMD_ID), false);
    assert.equal(addCommandToMobileToolbar(mockApp, SMART_JUMP_FULL_CMD_ID), true);
    assert.equal(isCommandInMobileToolbar(mockApp, SMART_JUMP_FULL_CMD_ID), true);
    assert.equal(updateCount, 1);
    // Placed at the very first position (index 0)
    assert.deepEqual(toolbarCommands, [
      SMART_JUMP_FULL_CMD_ID,
      "editor:undo",
      "editor:redo",
      "editor:toggle-bold",
    ]);

    // Idempotent if called again
    assert.equal(addCommandToMobileToolbar(mockApp, SMART_JUMP_FULL_CMD_ID), false);
    assert.equal(updateCount, 1);

    // Can also add and remove right-multi, left-single, left-multi, and delete commands
    assert.equal(addCommandToMobileToolbar(mockApp, SMART_JUMP_RIGHT_MULTI_FULL_CMD_ID), true);
    assert.equal(isCommandInMobileToolbar(mockApp, SMART_JUMP_RIGHT_MULTI_FULL_CMD_ID), true);
    assert.equal(removeCommandFromMobileToolbar(mockApp, SMART_JUMP_RIGHT_MULTI_FULL_CMD_ID), true);
    assert.equal(isCommandInMobileToolbar(mockApp, SMART_JUMP_RIGHT_MULTI_FULL_CMD_ID), false);

    assert.equal(addCommandToMobileToolbar(mockApp, SMART_JUMP_LEFT_SINGLE_FULL_CMD_ID), true);
    assert.equal(isCommandInMobileToolbar(mockApp, SMART_JUMP_LEFT_SINGLE_FULL_CMD_ID), true);
    assert.equal(removeCommandFromMobileToolbar(mockApp, SMART_JUMP_LEFT_SINGLE_FULL_CMD_ID), true);

    assert.equal(addCommandToMobileToolbar(mockApp, SMART_JUMP_LEFT_MULTI_FULL_CMD_ID), true);
    assert.equal(isCommandInMobileToolbar(mockApp, SMART_JUMP_LEFT_MULTI_FULL_CMD_ID), true);
    assert.equal(removeCommandFromMobileToolbar(mockApp, SMART_JUMP_LEFT_MULTI_FULL_CMD_ID), true);

    assert.equal(addCommandToMobileToolbar(mockApp, SMART_BACKSPACE_FULL_CMD_ID), true);
    assert.equal(isCommandInMobileToolbar(mockApp, SMART_BACKSPACE_FULL_CMD_ID), true);
    assert.equal(removeCommandFromMobileToolbar(mockApp, SMART_BACKSPACE_FULL_CMD_ID), true);
    assert.equal(isCommandInMobileToolbar(mockApp, SMART_BACKSPACE_FULL_CMD_ID), false);
  });
});
