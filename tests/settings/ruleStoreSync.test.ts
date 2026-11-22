import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { createDefaultRulesFile } from "../../src/input/defaultRules";
import { computeRulesHash, serializeRulesFile, sha256Hex } from "../../src/input/ruleHash";
import { RulesFileData } from "../../src/input/types";
import { RuleStorageAdapter, RuleStore, RuleStoreAppLike } from "../../src/settings/ruleStore";

function createMemoryApp(): { app: RuleStoreAppLike; files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const adapter: RuleStorageAdapter = {
    async exists(path: string): Promise<boolean> {
      return files.has(path) || dirs.has(path);
    },
    async mkdir(path: string): Promise<void> {
      dirs.add(path);
    },
    async read(path: string): Promise<string> {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    async write(path: string, data: string): Promise<void> {
      files.set(path, data);
    },
  };
  return {
    app: { vault: { configDir: ".obsidian", adapter } },
    files,
    dirs,
  };
}

function createStore(app: RuleStoreAppLike): RuleStore {
  return new RuleStore(app, { id: "struct-latex", dir: ".obsidian/plugins/struct-latex" });
}

describe("Cross-Platform SHA-256 & Canonical Rules Hashing", () => {
  it("matches Node crypto SHA-256 identically for ASCII, CJK, and large JSON payloads", () => {
    const samples = [
      "",
      "abc",
      "希腊字母 · MathJax",
      serializeRulesFile(createDefaultRulesFile("zh")),
      serializeRulesFile(createDefaultRulesFile("en")),
    ];
    for (const s of samples) {
      const expected = createHash("sha256").update(s, "utf8").digest("hex");
      assert.equal(sha256Hex(s), expected);
    }
  });

  it("normalizes BOM, CRLF vs LF, and JSON formatting whitespace when hashing rules files", () => {
    const zhLf = serializeRulesFile(createDefaultRulesFile("zh"));
    const zhCrlf = zhLf.replace(/\n/g, "\r\n");
    const zhBomCrlf = "\uFEFF" + zhCrlf;
    const zhCompact = JSON.stringify(createDefaultRulesFile("zh"));

    const expected = computeRulesHash(zhLf);
    assert.equal(computeRulesHash(zhCrlf), expected);
    assert.equal(computeRulesHash(zhBomCrlf), expected);
    assert.equal(computeRulesHash(zhCompact), expected);

    const edited = createDefaultRulesFile("zh");
    edited.rules[0] = { ...edited.rules[0], name: "Modified" };
    assert.notEqual(computeRulesHash(serializeRulesFile(edited)), expected);
    assert.notEqual(computeRulesHash("{broken json"), expected);
  });
});

describe("RuleStore — Bilingual Templates, SHA-256 Switching & Upgrade Sync", () => {
  it("materializes rules_zh.json, rules_en.json, and locale-matched rules.json on first load", async () => {
    const { app, files } = createMemoryApp();
    const store = createStore(app);

    const { loadError } = await store.load("en");
    assert.equal(loadError, null);
    assert.equal(files.has(store.templatePaths.zh), true);
    assert.equal(files.has(store.templatePaths.en), true);
    assert.equal(files.get(store.filePath), files.get(store.templatePaths.en));
    assert.equal(store.getRules()[0].group, "Delimiter Entry");
  });

  it("switches unmodified rules.json across locales via SHA-256 check, including CRLF files", async () => {
    const { app, files } = createMemoryApp();
    const store = createStore(app);
    await store.load("zh");
    assert.equal(store.getRules()[0].group, "定界符入口");

    // Simulate Windows CRLF + BOM sync before switching language
    const currentRaw = files.get(store.filePath)!;
    files.set(store.filePath, "\uFEFF" + currentRaw.replace(/\n/g, "\r\n"));

    const switchedToEn = await store.syncRulesForLocale("en");
    assert.equal(switchedToEn, true);
    assert.equal(files.get(store.filePath), files.get(store.templatePaths.en));
    assert.equal(store.getRules()[0].group, "Delimiter Entry");

    // Switching again to same locale is a no-op
    assert.equal(await store.syncRulesForLocale("en"), false);

    // Switch back to zh
    assert.equal(await store.syncRulesForLocale("zh"), true);
    assert.equal(files.get(store.filePath), files.get(store.templatePaths.zh));
  });

  it("preserves user-modified rules.json when switching language or restarting", async () => {
    const { app, files } = createMemoryApp();
    const store = createStore(app);
    await store.load("zh");

    const customRules = [...store.getRules()];
    customRules[0] = { ...customRules[0], name: "我的自定义入口" };
    await store.save(customRules);

    assert.equal(await store.syncRulesForLocale("en"), false);
    assert.equal(store.getRules()[0].name, "我的自定义入口");
    assert.ok(files.get(store.filePath)!.includes("我的自定义入口"));

    // Restart under English locale still preserves customized rules.json
    const restarted = createStore(app);
    await restarted.load("en");
    assert.equal(restarted.getRules()[0].name, "我的自定义入口");
  });

  it("auto-switches rules.json on startup when auto mode detects an Obsidian locale change", async () => {
    const { app, files } = createMemoryApp();
    const store1 = createStore(app);
    await store1.load("en");
    assert.equal(files.get(store1.filePath), files.get(store1.templatePaths.en));

    const store2 = createStore(app);
    await store2.load("zh");
    assert.equal(files.get(store2.filePath), files.get(store2.templatePaths.zh));
    assert.equal(store2.getRules()[0].group, "定界符入口");
  });

  it("upgrades disk templates on plugin update and upgrades unmodified rules.json while protecting customized ones", async () => {
    const legacyData: RulesFileData = {
      version: 1,
      rules: [
        {
          id: "legacy-1",
          name: "旧版规则",
          group: "旧版分组",
          type: "text",
          enabled: true,
          scope: "math",
          triggerMode: "auto",
          trigger: ";z",
          replacement: "\\zeta",
        },
      ],
    };
    const legacyText = serializeRulesFile(legacyData);

    // Case A: unmodified legacy rules.json -> templates AND rules.json upgrade to latest
    const envA = createMemoryApp();
    const storeA = createStore(envA.app);
    envA.files.set(storeA.templatePaths.zh, legacyText);
    envA.files.set(storeA.templatePaths.en, legacyText);
    envA.files.set(storeA.filePath, legacyText);

    await storeA.load("zh");
    assert.equal(envA.files.get(storeA.templatePaths.zh), serializeRulesFile(createDefaultRulesFile("zh")));
    assert.equal(envA.files.get(storeA.templatePaths.en), serializeRulesFile(createDefaultRulesFile("en")));
    assert.equal(envA.files.get(storeA.filePath), envA.files.get(storeA.templatePaths.zh));

    // Case B: customized rules.json -> templates upgrade, customized rules.json stays intact
    const envB = createMemoryApp();
    const storeB = createStore(envB.app);
    const customData: RulesFileData = {
      version: 1,
      rules: [{ ...legacyData.rules[0], name: "用户改过" }],
    };
    envB.files.set(storeB.templatePaths.zh, legacyText);
    envB.files.set(storeB.templatePaths.en, legacyText);
    envB.files.set(storeB.filePath, serializeRulesFile(customData));

    await storeB.load("zh");
    assert.equal(envB.files.get(storeB.templatePaths.zh), serializeRulesFile(createDefaultRulesFile("zh")));
    assert.equal(storeB.getRules()[0].name, "用户改过");
  });

  it("rebuilds missing or corrupted template file when resetting to defaults", async () => {
    const { app, files } = createMemoryApp();
    const store = createStore(app);
    await store.load("en");

    const custom = [...store.getRules()];
    custom[0] = { ...custom[0], name: "Temp" };
    await store.save(custom);

    // Simulate user deleting or corrupting rules_en.json
    files.set(store.templatePaths.en, "{corrupted");
    await store.resetToDefaults("en");

    assert.equal(files.get(store.templatePaths.en), serializeRulesFile(createDefaultRulesFile("en")));
    assert.equal(files.get(store.filePath), files.get(store.templatePaths.en));
    assert.equal(store.getRules()[0].group, "Delimiter Entry");
  });
});
