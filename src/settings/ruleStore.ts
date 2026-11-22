import type { App, PluginManifest } from "obsidian";
import { Locale, t } from "../i18n";
import { createDefaultRulesFile } from "../input/defaultRules";
import { CompiledRuleSet, compileRules } from "../input/ruleCompiler";
import { computeRulesHash, serializeRulesFile, stripUtf8Bom } from "../input/ruleHash";
import { InputRule, RulesFileData } from "../input/types";
import { cloneRule, validateRulesFile } from "../input/validation";

const SUPPORTED_LOCALES: readonly Locale[] = ["zh", "en"];

export interface RuleStorageAdapter {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

export interface RuleStoreAppLike {
  vault: {
    configDir: string;
    adapter: RuleStorageAdapter;
  };
}

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}

export class RuleStore {
  readonly filePath: string;
  readonly templatePaths: Record<Locale, string>;
  private readonly dirPath: string;
  private readonly adapter: RuleStorageAdapter;
  private rules: InputRule[] = [];
  private compiled: CompiledRuleSet;
  private loadError: string | null = null;

  constructor(app: App | RuleStoreAppLike, manifest: Pick<PluginManifest, "id" | "dir">) {
    this.adapter = app.vault.adapter;
    this.dirPath = normalizeVaultPath(
      manifest.dir ?? `${app.vault.configDir}/plugins/${manifest.id}`
    );
    this.filePath = normalizeVaultPath(`${this.dirPath}/rules.json`);
    this.templatePaths = {
      zh: normalizeVaultPath(`${this.dirPath}/rules_zh.json`),
      en: normalizeVaultPath(`${this.dirPath}/rules_en.json`),
    };
    const defaults = createDefaultRulesFile("zh");
    this.rules = defaults.rules;
    this.compiled = compileRules(this.rules);
  }

  getRules(): InputRule[] {
    return this.rules;
  }

  getCompiled(): CompiledRuleSet {
    return this.compiled;
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  private applyRules(nextRules: readonly InputRule[]): void {
    this.rules = nextRules.map((r) => cloneRule(r));
    this.compiled = compileRules(this.rules);
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.adapter.exists(this.dirPath))) {
      await this.adapter.mkdir(this.dirPath);
    }
  }

  private async writeRulesFile(data: RulesFileData, targetPath = this.filePath): Promise<void> {
    await this.ensureDir();
    await this.adapter.write(targetPath, serializeRulesFile(data));
  }

  private async readValidRulesFile(
    path: string
  ): Promise<{ raw: string; data: RulesFileData; hash: string } | null> {
    if (!(await this.adapter.exists(path))) return null;
    try {
      const raw = await this.adapter.read(path);
      const parsed: unknown = JSON.parse(stripUtf8Bom(raw));
      if (!validateRulesFile(parsed).valid) return null;
      return {
        raw,
        data: parsed as RulesFileData,
        hash: computeRulesHash(raw),
      };
    } catch {
      return null;
    }
  }

  /**
   * Ensures `rules_zh.json` and `rules_en.json` exist and stay synced with the
   * latest built-in defaults on plugin upgrade, while collecting prior template hashes.
   */
  private async syncOfficialTemplates(): Promise<{
    latestHashes: Record<Locale, string>;
    officialHashes: Set<string>;
  }> {
    const latestHashes = {} as Record<Locale, string>;
    const officialHashes = new Set<string>();

    for (const locale of SUPPORTED_LOCALES) {
      const tplPath = this.templatePaths[locale];
      const existing = await this.readValidRulesFile(tplPath);
      if (existing) {
        officialHashes.add(existing.hash);
      }

      const expectedData = createDefaultRulesFile(locale);
      const expectedText = serializeRulesFile(expectedData);
      const expectedHash = computeRulesHash(expectedText);

      latestHashes[locale] = expectedHash;
      officialHashes.add(expectedHash);

      if (!existing || existing.hash !== expectedHash) {
        await this.ensureDir();
        await this.adapter.write(tplPath, expectedText);
      }
    }

    return { latestHashes, officialHashes };
  }

  private async loadRulesFromTemplate(locale: Locale): Promise<RulesFileData> {
    const existing = await this.readValidRulesFile(this.templatePaths[locale]);
    if (existing) {
      return {
        version: 1,
        rules: existing.data.rules.map((r) => cloneRule(r)),
      };
    }
    const fallback = createDefaultRulesFile(locale);
    await this.writeRulesFile(fallback, this.templatePaths[locale]);
    return fallback;
  }

  async load(activeLocale: Locale = "zh"): Promise<{ loadError: string | null }> {
    this.loadError = null;
    const { latestHashes, officialHashes } = await this.syncOfficialTemplates();

    if (!(await this.adapter.exists(this.filePath))) {
      const initialData = await this.loadRulesFromTemplate(activeLocale);
      this.applyRules(initialData.rules);
      await this.writeRulesFile(initialData);
      return { loadError: null };
    }

    try {
      const raw = await this.adapter.read(this.filePath);
      const parsed: unknown = JSON.parse(stripUtf8Bom(raw));
      const validation = validateRulesFile(parsed);
      if (!validation.valid) {
        this.applyRules(createDefaultRulesFile(activeLocale).rules);
        this.loadError = validation.errors[0] ?? t("store.invalidFormat");
        return { loadError: this.loadError };
      }

      const currentHash = computeRulesHash(raw);
      if (officialHashes.has(currentHash) && currentHash !== latestHashes[activeLocale]) {
        const targetData = await this.loadRulesFromTemplate(activeLocale);
        this.applyRules(targetData.rules);
        await this.writeRulesFile(targetData);
        return { loadError: null };
      }

      this.applyRules((parsed as RulesFileData).rules);
      return { loadError: null };
    } catch (err) {
      this.applyRules(createDefaultRulesFile(activeLocale).rules);
      this.loadError = t("store.readError", { msg: (err as Error).message });
      return { loadError: this.loadError };
    }
  }

  /**
   * Switches `rules.json` to `targetLocale` when its SHA-256 matches any official
   * template (`rules_zh.json` or `rules_en.json`), preserving user-edited files.
   */
  async syncRulesForLocale(targetLocale: Locale): Promise<boolean> {
    const { latestHashes, officialHashes } = await this.syncOfficialTemplates();

    if (!(await this.adapter.exists(this.filePath))) {
      const targetData = await this.loadRulesFromTemplate(targetLocale);
      this.applyRules(targetData.rules);
      await this.writeRulesFile(targetData);
      this.loadError = null;
      return true;
    }

    const existing = await this.readValidRulesFile(this.filePath);
    if (!existing) return false;
    if (!officialHashes.has(existing.hash) || existing.hash === latestHashes[targetLocale]) {
      return false;
    }

    const targetData = await this.loadRulesFromTemplate(targetLocale);
    this.applyRules(targetData.rules);
    await this.writeRulesFile(targetData);
    this.loadError = null;
    return true;
  }

  async save(nextRules: InputRule[]): Promise<void> {
    const payload: RulesFileData = {
      version: 1,
      rules: nextRules.map((r) => cloneRule(r)),
    };
    const validation = validateRulesFile(payload);
    if (!validation.valid) {
      throw new Error(validation.errors[0] ?? t("store.saveRejected"));
    }

    await this.writeRulesFile(payload);
    this.applyRules(payload.rules);
    this.loadError = null;
  }

  exportJson(): string {
    return serializeRulesFile({ version: 1, rules: this.rules });
  }

  async importJson(raw: string): Promise<void> {
    const parsed: unknown = JSON.parse(stripUtf8Bom(raw));
    const validation = validateRulesFile(parsed);
    if (!validation.valid) {
      throw new Error(validation.errors.slice(0, 3).join("\n"));
    }
    await this.save((parsed as RulesFileData).rules);
  }

  async resetToDefaults(activeLocale: Locale = "zh"): Promise<void> {
    await this.syncOfficialTemplates();
    const templateData = await this.loadRulesFromTemplate(activeLocale);
    await this.save(templateData.rules);
  }
}
