import { App, Modal, Setting } from "obsidian";
import { evaluateRulePreview } from "../input/ruleEngine";
import { InputRule, OutputDialect, RuleScope, TriggerMode } from "../input/types";
import { cloneRule } from "../input/validation";
import { renderGuardsFields, renderKeybindFields } from "./ruleModalFields";
import { buildPreviewPanel, renderJsReferenceBlock, showValidationFailure } from "./ruleModals";

export class RuleEditModal extends Modal {
  private draft: InputRule;
  private refreshPreview: (() => void) | null = null;
  private errorEl!: HTMLElement;

  constructor(
    app: App,
    rule: InputRule,
    private readonly dialect: OutputDialect,
    private readonly isNew: boolean,
    private readonly onSave: (updated: InputRule) => Promise<void>
  ) {
    super(app);
    this.draft = cloneRule(rule);
  }

  private renderTypeBody(container: HTMLElement): void {
    if (this.draft.type === "text") {
      const rule = this.draft;
      new Setting(container).setName("触发词").addText((t) =>
        t.setValue(rule.trigger).onChange((v) => {
          rule.trigger = v;
        })
      );
      new Setting(container)
        .setName("替换内容")
        .setDesc("使用 $0 标记落光标位置")
        .addText((t) =>
          t.setValue(rule.replacement).onChange((v) => {
            rule.replacement = v;
            this.refreshPreview?.();
          })
        );
      return;
    }

    if (this.draft.type === "regex") {
      const rule = this.draft;
      new Setting(container)
        .setName("正则表达式（自动锚定光标前文本末尾）")
        .addText((t) =>
          t.setPlaceholder("如 bb([a-zA-Z])").setValue(rule.trigger).onChange((v) => {
            rule.trigger = v;
            this.refreshPreview?.();
          })
        );
      new Setting(container)
        .setName("正则标志（可选 i/u/s）")
        .addText((t) =>
          t.setPlaceholder("留空或 i").setValue(rule.flags ?? "").onChange((v) => {
            rule.flags = v.trim();
            this.refreshPreview?.();
          })
        );
      new Setting(container)
        .setName("替换模板")
        .setDesc("$1/$2 引用捕获组，$0 标记落光标位置")
        .addText((t) =>
          t.setValue(rule.replacement).onChange((v) => {
            rule.replacement = v;
            this.refreshPreview?.();
          })
        );
      new Setting(container)
        .setName("示例输入（用于预览试跑）")
        .addText((t) =>
          t.setPlaceholder("如 bbx").setValue(rule.exampleInput ?? "").onChange((v) => {
            rule.exampleInput = v;
            this.refreshPreview?.();
          })
        );
      return;
    }

    const rule = this.draft;
    new Setting(container)
      .setName("示例输入（右侧试跑与预览）")
      .setDesc("填写触发前文本或完整按键串，如 sm0n")
      .addText((t) =>
        t.setPlaceholder("如 sm0n").setValue(rule.exampleInput ?? "").onChange((v) => {
          rule.exampleInput = v;
          this.refreshPreview?.();
        })
      );

    container.createDiv({
      cls: "struct-latex-js-label",
      text: "JavaScript 函数体（接收 ctx，返回 RuleAction 或 null）：",
    });
    const editor = container.createEl("textarea", { cls: "struct-latex-js-editor" });
    editor.value = rule.code;
    editor.addEventListener("input", () => {
      rule.code = editor.value;
      this.refreshPreview?.();
    });
    editor.addEventListener("keydown", (ev) => {
      if (ev.key === "Tab") {
        ev.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.slice(0, start) + "  " + editor.value.slice(end);
        editor.selectionStart = editor.selectionEnd = start + 2;
        rule.code = editor.value;
      }
    });

    renderJsReferenceBlock(container);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("struct-latex-edit-modal");
    contentEl.empty();

    const typeTitle =
      this.draft.type === "text" ? "纯替换规则" : this.draft.type === "regex" ? "正则规则" : "JavaScript 规则";
    contentEl.createEl("h3", { text: `${this.isNew ? "新增" : "编辑"}${typeTitle}` });

    new Setting(contentEl).setName("规则名称").addText((t) =>
      t.setValue(this.draft.name).onChange((v) => {
        this.draft.name = v;
      })
    );
    new Setting(contentEl).setName("所属分组").addText((t) =>
      t.setValue(this.draft.group).onChange((v) => {
        this.draft.group = v.trim() || "自定义";
      })
    );
    new Setting(contentEl).setName("生效作用域").addDropdown((dd) =>
      dd
        .addOption("math", "仅数学模式")
        .addOption("text", "仅非数学正文")
        .addOption("any", "任意位置")
        .setValue(this.draft.scope)
        .onChange((v) => {
          this.draft.scope = v as RuleScope;
        })
    );

    const keybindHost = contentEl.createDiv();
    new Setting(contentEl).setName("触发方式").addDropdown((dd) =>
      dd
        .addOption("auto", "Auto（敲完末字自动触发）")
        .addOption("confirm", "触发词 + 确认键")
        .addOption("hotkey", "全局/局部组合键或连按")
        .setValue(this.draft.triggerMode)
        .onChange((v) => {
          this.draft.triggerMode = v as TriggerMode;
          renderKeybindFields(keybindHost, this.draft);
        })
    );
    contentEl.appendChild(keybindHost);
    renderKeybindFields(keybindHost, this.draft);

    this.renderTypeBody(contentEl);
    this.refreshPreview = buildPreviewPanel(contentEl, this.draft, this.dialect, evaluateRulePreview);
    this.refreshPreview();
    renderGuardsFields(contentEl, this.draft, () => this.refreshPreview?.());

    this.errorEl = contentEl.createDiv({ cls: "struct-latex-modal-error" });
    this.errorEl.style.display = "none";

    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    new Setting(footer)
      .addButton((b) => b.setButtonText("取消").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("校验并保存")
          .setCta()
          .onClick(async () => {
            if (!showValidationFailure(this.errorEl, this.draft)) return;
            try {
              await this.onSave(this.draft);
              this.close();
            } catch (err) {
              this.errorEl.style.display = "block";
              this.errorEl.setText((err as Error).message);
            }
          })
      );
  }
}
