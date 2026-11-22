import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { InputRule, OutputDialect, PluginSettings } from "../input/types";
import { cloneRule } from "../input/validation";
import { LazyMathPreviewManager } from "./mathPreview";
import { RuleEditModal } from "./ruleEditModal";
import { ConfirmResetModal, JsonTransferModal } from "./ruleModals";
import { renderRuleRow } from "./ruleRowRenderer";
import { RuleStore } from "./ruleStore";
import { createDraftRule, filterRules, FilterState, renderFilterToolbar } from "./settingToolbar";

export interface StructLatexSettingHost extends Plugin {
  settings: PluginSettings;
  ruleStore: RuleStore;
  saveSettings(): Promise<void>;
}

export class StructLatexSettingTab extends PluginSettingTab {
  private readonly filter: FilterState = {
    searchQuery: "",
    groupFilter: "all",
    typeFilter: "all",
  };
  private pendingNewTextDraft: InputRule | null = null;
  private previewManager: LazyMathPreviewManager | null = null;
  private listContainer: HTMLElement | null = null;

  constructor(app: App, private readonly host: StructLatexSettingHost) {
    super(app, host);
  }

  private renderRuleList(): void {
    const container = this.listContainer;
    if (!container) return;

    this.previewManager?.destroy();
    this.previewManager = new LazyMathPreviewManager();
    container.empty();

    const filtered = filterRules(this.host.ruleStore.getRules(), this.filter);
    const items: Array<{ rule: InputRule; isDraft: boolean }> = [];
    if (this.pendingNewTextDraft) {
      items.push({ rule: this.pendingNewTextDraft, isDraft: true });
    }
    for (const r of filtered) {
      items.push({ rule: r, isDraft: false });
    }

    if (items.length === 0) {
      container.createDiv({ cls: "struct-latex-empty", text: "没有符合条件的规则" });
      return;
    }

    for (const item of items) {
      renderRuleRow(container, item.rule, item.isDraft, {
        getDialect: () => this.host.settings.outputDialect,
        previewManager: this.previewManager,
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
          if (isDraft) this.display();
        },
        onToggleEnabled: async (target, enabled) => {
          const current = this.host.ruleStore.getRules().map((r) => cloneRule(r));
          const found = current.find((r) => r.id === target.id);
          if (!found) return;
          found.enabled = enabled;
          await this.host.ruleStore.save(current);
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
          const next = this.host.ruleStore.getRules().filter((r) => r.id !== target.id);
          await this.host.ruleStore.save(next);
          this.display();
        },
        onReorderRule: async (draggedId, targetId) => {
          const next = this.host.ruleStore.getRules().map((r) => cloneRule(r));
          const fromIdx = next.findIndex((r) => r.id === draggedId);
          const toIdx = next.findIndex((r) => r.id === targetId);
          if (fromIdx < 0 || toIdx < 0) return;
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          await this.host.ruleStore.save(next);
          this.renderRuleList();
        },
      });
    }
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
    containerEl.empty();
    containerEl.createEl("h2", { text: "Struct LaTeX 设置" });

    new Setting(containerEl)
      .setName("启用智能输入")
      .setDesc("纯替换、正则、JavaScript")
      .addToggle((t) =>
        t.setValue(this.host.settings.smartInputEnabled).onChange(async (v) => {
          this.host.settings.smartInputEnabled = v;
          await this.host.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("启用结构化整体删除 (Backspace)")
      .setDesc("基于关系树智能一键删除")
      .addToggle((t) =>
        t.setValue(this.host.settings.smartBackspaceEnabled).onChange(async (v) => {
          this.host.settings.smartBackspaceEnabled = v;
          await this.host.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("启用智能光标跳转 (Tab)")
      .setDesc("自动跳转至下一个输入位置")
      .addToggle((t) =>
        t.setValue(this.host.settings.smartJumpEnabled).onChange(async (v) => {
          this.host.settings.smartJumpEnabled = v;
          await this.host.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("输出风格（Unicode/LaTeX/根据rules.json）")
      .setDesc("不修改 rules.json，仅在输入展开时对输出结果进行风格转换")
      .addDropdown((dd) =>
        dd
          .addOption("latex", "标准 LaTeX（默认）")
          .addOption("unicode", "Unicode 符号")
          .addOption("raw", "按规则原样")
          .setValue(this.host.settings.outputDialect)
          .onChange(async (v) => {
            this.host.settings.outputDialect = v as OutputDialect;
            await this.host.saveSettings();
            this.renderRuleList();
          })
      );

    const loadErr = this.host.ruleStore.getLoadError();
    if (loadErr) {
      containerEl.createDiv({
        cls: "struct-latex-modal-error",
        text: `规则文件加载异常（当前临时使用内置默认规则，未覆盖您的文件）: ${loadErr}`,
      });
    }

    new Setting(containerEl)
      .setName("新增输入规则")
      .setDesc(`规则文件路径: ${this.host.ruleStore.filePath}（当前共 ${this.host.ruleStore.getRules().length} 条）`)
      .addButton((b) =>
        b.setButtonText("+ 纯替换").onClick(() => {
          this.pendingNewTextDraft = createDraftRule("text");
          this.renderRuleList();
        })
      )
      .addButton((b) => b.setButtonText("+ 正则").onClick(() => this.openNewModal("regex")))
      .addButton((b) => b.setButtonText("+ JS").onClick(() => this.openNewModal("js")));

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
    this.pendingNewTextDraft = null;
  }
}
