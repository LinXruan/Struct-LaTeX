import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { getLocale, LanguageSetting, t } from "../i18n";
import { InputRule, OutputDialect, PluginSettings } from "../input/types";
import { cloneRule } from "../input/validation";
import { LazyMathPreviewManager } from "./mathPreview";
import { RuleEditModal } from "./ruleEditModal";
import { ConfirmResetModal, JsonTransferModal } from "./ruleModals";
import { renderRuleRow, RuleRowCallbacks } from "./ruleRowRenderer";
import { RuleStore } from "./ruleStore";
import {
  createDefaultFilterState,
  createDraftRule,
  filterRules,
  FilterState,
  renderFilterToolbar,
} from "./settingToolbar";

export interface StructLatexSettingHost extends Plugin {
  settings: PluginSettings;
  ruleStore: RuleStore;
  saveSettings(): Promise<void>;
  syncLocale(): void;
}

export class StructLatexSettingTab extends PluginSettingTab {
  private readonly filter: FilterState = createDefaultFilterState();
  private pendingNewTextDraft: InputRule | null = null;
  private previewManager: LazyMathPreviewManager | null = null;
  private listContainer: HTMLElement | null = null;
  private readonly rowCache = new Map<string, { sig: string; el: HTMLElement }>();

  constructor(app: App, private readonly host: StructLatexSettingHost) {
    super(app, host);
  }

  private getRowSignature(rule: InputRule, isDraft: boolean): string {
    return `${this.host.settings.outputDialect}:${getLocale()}:${isDraft ? 1 : 0}:${JSON.stringify(rule)}`;
  }

  private buildRowCallbacks(previewManager: LazyMathPreviewManager): RuleRowCallbacks {
    return {
      getDialect: () => this.host.settings.outputDialect,
      previewManager,
      onCommitRule: async (updated, isDraft) => {
        const current = this.host.ruleStore.getRules().map((r) => cloneRule(r));
        if (isDraft) {
          this.pendingNewTextDraft = null;
          current.unshift(updated);
        } else {
          const idx = current.findIndex((r) => r.id === updated.id);
          if (idx >= 0) current[idx] = updated;
        }
        await this.host.ruleStore.save(current);
        if (isDraft) {
          this.display();
        } else {
          const cached = this.rowCache.get(updated.id);
          if (cached) cached.sig = this.getRowSignature(updated, false);
        }
      },
      onToggleEnabled: async (target, enabled) => {
        const current = this.host.ruleStore.getRules().map((r) => cloneRule(r));
        const found = current.find((r) => r.id === target.id);
        if (!found) return;
        found.enabled = enabled;
        await this.host.ruleStore.save(current);
        const cached = this.rowCache.get(found.id);
        if (cached) cached.sig = this.getRowSignature(found, false);
      },
      onOpenEditModal: (target) => {
        const isNew = this.pendingNewTextDraft?.id === target.id;
        new RuleEditModal(this.app, target, this.host.settings.outputDialect, isNew, async (saved) => {
          const current = this.host.ruleStore.getRules().map((r) => cloneRule(r));
          if (isNew) {
            this.pendingNewTextDraft = null;
            current.unshift(saved);
          } else {
            const idx = current.findIndex((r) => r.id === saved.id);
            if (idx >= 0) current[idx] = saved;
          }
          await this.host.ruleStore.save(current);
          this.display();
        }).open();
      },
      onDeleteRule: async (target, isDraft) => {
        if (isDraft) {
          this.pendingNewTextDraft = null;
          this.renderRuleList();
          return;
        }
        this.rowCache.delete(target.id);
        await this.host.ruleStore.save(this.host.ruleStore.getRules().filter((r) => r.id !== target.id));
        this.display();
      },
      onReorderRule: async (draggedId, beforeId, afterId) => {
        const next = this.host.ruleStore.getRules().map((r) => cloneRule(r));
        const fromIdx = next.findIndex((r) => r.id === draggedId);
        if (fromIdx < 0) return;
        const [moved] = next.splice(fromIdx, 1);

        let targetIdx = fromIdx;
        if (beforeId) {
          const idx = next.findIndex((r) => r.id === beforeId);
          if (idx >= 0) targetIdx = idx;
        } else if (afterId) {
          const idx = next.findIndex((r) => r.id === afterId);
          if (idx >= 0) targetIdx = idx + 1;
        }
        if (targetIdx === fromIdx) return;
        next.splice(targetIdx, 0, moved);
        await this.host.ruleStore.save(next);
        this.renderRuleList();
      },
    };
  }

  private renderRuleList(): void {
    const container = this.listContainer;
    if (!container) return;

    if (!this.previewManager) {
      this.previewManager = new LazyMathPreviewManager(container);
    }
    const previewManager = this.previewManager;

    const filtered = filterRules(this.host.ruleStore.getRules(), this.filter);
    const items: Array<{ rule: InputRule; isDraft: boolean }> = [];
    if (this.pendingNewTextDraft) {
      items.push({ rule: this.pendingNewTextDraft, isDraft: true });
    }
    for (const r of filtered) {
      items.push({ rule: r, isDraft: false });
    }

    if (items.length === 0) {
      container.replaceChildren();
      container.createDiv({ cls: "struct-latex-empty", text: t("settings.emptyList") });
      return;
    }

    const callbacks = this.buildRowCallbacks(previewManager);
    const doc = container.ownerDocument;
    const fragment = doc.createDocumentFragment();
    const scratch = doc.createElement("div");

    for (const item of items) {
      const sig = this.getRowSignature(item.rule, item.isDraft);
      const cached = this.rowCache.get(item.rule.id);
      if (cached && cached.sig === sig) {
        fragment.appendChild(cached.el);
      } else {
        const rowEl = renderRuleRow(scratch, item.rule, item.isDraft, callbacks);
        this.rowCache.set(item.rule.id, { sig, el: rowEl });
        fragment.appendChild(rowEl);
      }
    }

    container.replaceChildren(fragment);
  }

  private openNewModal(type: "regex" | "js"): void {
    const draft = createDraftRule(type);
    new RuleEditModal(this.app, draft, this.host.settings.outputDialect, true, async (saved) => {
      const current = [saved, ...this.host.ruleStore.getRules().map((r) => cloneRule(r))];
      await this.host.ruleStore.save(current);
      this.display();
    }).open();
  }

  display(): void {
    const { containerEl } = this;
    this.previewManager?.destroy();
    this.previewManager = null;
    this.rowCache.clear();
    containerEl.empty();
    containerEl.createEl("h2", { text: t("settings.title") });

    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((dd) =>
        dd
          .addOption("auto", t("settings.language.auto"))
          .addOption("zh", t("settings.language.zh"))
          .addOption("en", t("settings.language.en"))
          .setValue(this.host.settings.language)
          .onChange(async (v) => {
            this.host.settings.language = v as LanguageSetting;
            await this.host.saveSettings();
            this.host.syncLocale();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.smartInput.name"))
      .setDesc(t("settings.smartInput.desc"))
      .addToggle((tToggle) =>
        tToggle.setValue(this.host.settings.smartInputEnabled).onChange(async (v) => {
          this.host.settings.smartInputEnabled = v;
          await this.host.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.smartBackspace.name"))
      .setDesc(t("settings.smartBackspace.desc"))
      .addToggle((tToggle) =>
        tToggle.setValue(this.host.settings.smartBackspaceEnabled).onChange(async (v) => {
          this.host.settings.smartBackspaceEnabled = v;
          await this.host.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.smartJump.name"))
      .setDesc(t("settings.smartJump.desc"))
      .addToggle((tToggle) =>
        tToggle.setValue(this.host.settings.smartJumpEnabled).onChange(async (v) => {
          this.host.settings.smartJumpEnabled = v;
          await this.host.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.dialect.name"))
      .setDesc(t("settings.dialect.desc"))
      .addDropdown((dd) =>
        dd
          .addOption("latex", t("settings.dialect.latex"))
          .addOption("unicode", t("settings.dialect.unicode"))
          .addOption("raw", t("settings.dialect.raw"))
          .setValue(this.host.settings.outputDialect)
          .onChange(async (v) => {
            this.host.settings.outputDialect = v as OutputDialect;
            await this.host.saveSettings();
            this.previewManager?.destroy();
            this.previewManager = null;
            this.rowCache.clear();
            this.renderRuleList();
          })
      );

    const loadErr = this.host.ruleStore.getLoadError();
    if (loadErr) {
      containerEl.createDiv({
        cls: "struct-latex-modal-error",
        text: t("settings.loadError", { err: loadErr }),
      });
    }

    new Setting(containerEl)
      .setName(t("settings.addRule.name"))
      .setDesc(
        t("settings.addRule.desc", {
          path: this.host.ruleStore.filePath,
          count: this.host.ruleStore.getRules().length,
        })
      )
      .addButton((b) =>
        b.setButtonText(t("settings.addText")).onClick(() => {
          this.pendingNewTextDraft = createDraftRule("text");
          this.renderRuleList();
        })
      )
      .addButton((b) => b.setButtonText(t("settings.addRegex")).onClick(() => this.openNewModal("regex")))
      .addButton((b) => b.setButtonText(t("settings.addJs")).onClick(() => this.openNewModal("js")));

    renderFilterToolbar(
      containerEl,
      this.host.ruleStore.getRules(),
      this.filter,
      () => this.renderRuleList(),
      {
        onExport: () => new JsonTransferModal(this.app, "export", this.host.ruleStore.exportJson()).open(),
        onImport: () =>
          new JsonTransferModal(this.app, "import", "", async (raw) => {
            await this.host.ruleStore.importJson(raw);
            this.display();
          }).open(),
        onReset: () =>
          new ConfirmResetModal(this.app, async () => {
            await this.host.ruleStore.resetToDefaults();
            this.pendingNewTextDraft = null;
            this.display();
          }).open(),
      }
    );

    this.listContainer = containerEl.createDiv({ cls: "struct-latex-rule-list" });
    this.renderRuleList();
  }

  hide(): void {
    this.previewManager?.destroy();
    this.previewManager = null;
    this.rowCache.clear();
    this.pendingNewTextDraft = null;
  }
}
