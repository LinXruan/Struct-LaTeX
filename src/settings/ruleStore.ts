import { App, PluginManifest, normalizePath } from "obsidian";
import { createDefaultRulesFile } from "../input/defaultRules";
import { CompiledRuleSet, compileRules } from "../input/ruleCompiler";
import { InputRule, RulesFileData } from "../input/types";
import { cloneRule, validateRulesFile } from "../input/validation";

export class RuleStore {
  readonly filePath: string;
  private readonly dirPath: string;
  private rules: InputRule[] = [];
  private compiled: CompiledRuleSet;
  private loadError: string | null = null;

  constructor(private readonly app: App, manifest: PluginManifest) {
    this.dirPath = normalizePath(
      manifest.dir ?? `${app.vault.configDir}/plugins/${manifest.id}`
    );
    this.filePath = normalizePath(`${this.dirPath}/rules.json`);
    const defaults = createDefaultRulesFile();
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

  private async writeRulesFile(data: RulesFileData): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.dirPath))) {
      await adapter.mkdir(this.dirPath);
    }
    const content = JSON.stringify(data, null, 2) + "\n";
    await adapter.write(this.filePath, content);
  }

  async load(): Promise<{ loadError: string | null }> {
    const adapter = this.app.vault.adapter;
    this.loadError = null;

    if (!(await adapter.exists(this.filePath))) {
      const defaults = createDefaultRulesFile();
      this.rules = defaults.rules;
      this.compiled = compileRules(this.rules);
      await this.writeRulesFile(defaults);
      return { loadError: null };
    }

    try {
      const raw = await adapter.read(this.filePath);
      const parsed: unknown = JSON.parse(raw);
      const validation = validateRulesFile(parsed);
      if (!validation.valid) {
        this.loadError = validation.errors[0] ?? "rules.json 格式校验失败";
        return { loadError: this.loadError };
      }
      const fileData = parsed as RulesFileData;
      this.rules = fileData.rules.map((r) => cloneRule(r));
      this.compiled = compileRules(this.rules);
      return { loadError: null };
    } catch (err) {
      this.loadError = `读取 rules.json 失败: ${(err as Error).message}`;
      return { loadError: this.loadError };
    }
  }

  async save(nextRules: InputRule[]): Promise<void> {
    const payload: RulesFileData = {
      version: 1,
      rules: nextRules.map((r) => cloneRule(r)),
    };
    const validation = validateRulesFile(payload);
    if (!validation.valid) {
      throw new Error(validation.errors[0] ?? "规则校验未通过，拒绝写入");
    }

    await this.writeRulesFile(payload);
    this.rules = payload.rules;
    this.compiled = compileRules(this.rules);
    this.loadError = null;
  }

  exportJson(): string {
    return JSON.stringify({ version: 1, rules: this.rules }, null, 2) + "\n";
  }

  async importJson(raw: string): Promise<void> {
    const parsed: unknown = JSON.parse(raw);
    const validation = validateRulesFile(parsed);
    if (!validation.valid) {
      throw new Error(validation.errors.slice(0, 3).join("\n"));
    }
    await this.save((parsed as RulesFileData).rules);
  }

  async resetToDefaults(): Promise<void> {
    const defaults = createDefaultRulesFile();
    await this.save(defaults.rules);
  }
}
