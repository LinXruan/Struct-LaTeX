import type { App, PluginManifest } from "obsidian";
import { t } from "../i18n";
import { stripUtf8Bom } from "../input/ruleHash";
import {
  cloneTriggerRule,
  compileTriggerRules,
  createDefaultTriggerFile,
  validateTriggerFile,
  validateTriggerRuleList,
} from "../input/triggerEngine";
import {
  CompiledTriggerRule,
  TriggerCategory,
  TriggerFileData,
  TriggerRule,
} from "../input/triggerTypes";
import { RuleStorageAdapter, RuleStoreAppLike } from "./ruleStore";

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}

export function serializeTriggerFile(data: TriggerFileData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export class TriggerStore {
  readonly filePath: string;
  private readonly dirPath: string;
  private readonly adapter: RuleStorageAdapter;
  private jumpRules: TriggerRule[] = [];
  private deleteRules: TriggerRule[] = [];
  private jumpCompiled: CompiledTriggerRule[] = [];
  private deleteCompiled: CompiledTriggerRule[] = [];
  private loadError: string | null = null;

  constructor(app: App | RuleStoreAppLike, manifest: Pick<PluginManifest, "id" | "dir">) {
    this.adapter = app.vault.adapter;
    this.dirPath = normalizeVaultPath(
      manifest.dir ?? `${app.vault.configDir}/plugins/${manifest.id}`
    );
    this.filePath = normalizeVaultPath(`${this.dirPath}/trigger.json`);
  }

  getRules(category: TriggerCategory): TriggerRule[] {
    return category === "jump" ? this.jumpRules : this.deleteRules;
  }

  getCompiled(category: TriggerCategory): CompiledTriggerRule[] {
    return category === "jump" ? this.jumpCompiled : this.deleteCompiled;
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  private applyData(data: TriggerFileData): void {
    this.jumpRules = data.jumpRules.map((r) => cloneTriggerRule(r));
    this.deleteRules = data.deleteRules.map((r) => cloneTriggerRule(r));
    this.jumpCompiled = compileTriggerRules(this.jumpRules);
    this.deleteCompiled = compileTriggerRules(this.deleteRules);
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.adapter.exists(this.dirPath))) {
      await this.adapter.mkdir(this.dirPath);
    }
  }

  private async writeTriggerFile(data: TriggerFileData): Promise<void> {
    await this.ensureDir();
    await this.adapter.write(this.filePath, serializeTriggerFile(data));
  }

  async load(): Promise<{ loadError: string | null }> {
    this.loadError = null;
    if (!(await this.adapter.exists(this.filePath))) {
      const defaults = createDefaultTriggerFile();
      this.applyData(defaults);
      await this.writeTriggerFile(defaults);
      return { loadError: null };
    }

    try {
      const raw = await this.adapter.read(this.filePath);
      const parsed: unknown = JSON.parse(stripUtf8Bom(raw));
      const validation = validateTriggerFile(parsed);
      if (!validation.valid) {
        this.applyData(createDefaultTriggerFile());
        this.loadError = validation.errors[0] ?? t("trigger.store.invalidFormat");
        return { loadError: this.loadError };
      }

      this.applyData(parsed as TriggerFileData);
      return { loadError: null };
    } catch (err) {
      this.applyData(createDefaultTriggerFile());
      this.loadError = t("trigger.store.readError", { msg: (err as Error).message });
      return { loadError: this.loadError };
    }
  }

  async saveCategory(category: TriggerCategory, nextRules: TriggerRule[]): Promise<void> {
    const check = validateTriggerRuleList(nextRules);
    if (!check.valid) {
      throw new Error(check.errors[0] ?? t("store.saveRejected"));
    }

    const payload: TriggerFileData = {
      version: 1,
      jumpRules:
        category === "jump"
          ? nextRules.map((r) => cloneTriggerRule(r))
          : this.jumpRules.map((r) => cloneTriggerRule(r)),
      deleteRules:
        category === "delete"
          ? nextRules.map((r) => cloneTriggerRule(r))
          : this.deleteRules.map((r) => cloneTriggerRule(r)),
    };

    const fullCheck = validateTriggerFile(payload);
    if (!fullCheck.valid) {
      throw new Error(fullCheck.errors[0] ?? t("store.saveRejected"));
    }

    await this.writeTriggerFile(payload);
    this.applyData(payload);
    this.loadError = null;
  }

  exportJson(): string {
    return serializeTriggerFile({
      version: 1,
      jumpRules: this.jumpRules,
      deleteRules: this.deleteRules,
    });
  }

  async importJson(raw: string): Promise<void> {
    const parsed: unknown = JSON.parse(stripUtf8Bom(raw));
    const validation = validateTriggerFile(parsed);
    if (!validation.valid) {
      throw new Error(validation.errors.slice(0, 3).join("\n"));
    }
    const data = parsed as TriggerFileData;
    await this.writeTriggerFile(data);
    this.applyData(data);
    this.loadError = null;
  }

  async resetCategory(category: TriggerCategory): Promise<void> {
    await this.saveCategory(category, []);
  }
}
