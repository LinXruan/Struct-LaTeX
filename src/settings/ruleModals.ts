import { App, Modal, Notice, Setting } from "obsidian";
import { InputRule, OutputDialect } from "../input/types";
import { validateRule } from "../input/validation";
import { renderMathPreviewNow } from "./mathPreview";

const JS_API_REFERENCE = `ctx 只读属性:
  key: string              // 本次刚输入字符 (confirm/hotkey 模式为空串)
  before: string           // 光标前文本 (数学区内从块头起；非数学区从行首起)
  text: string             // before + key
  after: string            // 光标后文本
  inMath / inBlockMath / inCode: boolean
  inTextMode / inCommandTyping / inEnvName: boolean
  prevObject: LatexObject | null  // 左侧相邻结构对象 (.from / .to / .kind)
  currentSlot: Slot | null        // 当前所在括号槽位
  helpers: { isKnownCommand, isCommandPrefix, expandTemplate }

返回值: null (不触发) 或 {
  replaceLength: number,   // 从 ctx.text 末尾向前替换的字符数
  deleteAfter?: number,    // 向光标后额外删除字符数 (默认 0)
  insert: string,          // 插入文本
  cursorOffset?: number    // 光标相对 insert 起始处偏移 (默认 insert 末尾)
}`;

export function buildPreviewPanel(
  parentEl: HTMLElement,
  rule: InputRule,
  dialect: OutputDialect,
  evaluatePreview: (r: InputRule, d: OutputDialect) => { tex: string; rawOutput: string; error?: string }
): () => void {
  const box = parentEl.createDiv({ cls: "struct-latex-modal-preview-box" });
  box.createDiv({ cls: "struct-latex-modal-preview-label", text: "实时效果试跑预览：" });
  const rawEl = box.createDiv({ cls: "struct-latex-modal-preview-raw" });
  const mathEl = box.createDiv({ cls: "struct-latex-modal-preview-math" });

  return () => {
    const res = evaluatePreview(rule, dialect);
    if (res.error) {
      rawEl.setText(`异常: ${res.error}`);
      rawEl.addClass("struct-latex-preview-error");
      mathEl.empty();
      return;
    }
    rawEl.removeClass("struct-latex-preview-error");
    rawEl.setText(`输出: ${res.rawOutput}`);
    renderMathPreviewNow(mathEl, res);
  };
}

export function renderJsReferenceBlock(parentEl: HTMLElement): void {
  const details = parentEl.createEl("details", { cls: "struct-latex-js-ref" });
  details.createEl("summary", { text: "查看 ctx 上下文接口速查（可复制给 AI 辅助生成规则）" });
  details.createEl("pre", { text: JS_API_REFERENCE });
}

export function attachKeyRecorder(
  btnEl: HTMLButtonElement,
  isMac: boolean,
  onCaptured: (combo: string) => void,
  comboConverter: (ev: KeyboardEvent, isMac: boolean) => string | null,
  twoStep = false
): void {
  let recording = false;
  let step1: string | null = null;
  let cleanup: (() => void) | null = null;

  const stop = (label: string) => {
    recording = false;
    step1 = null;
    btnEl.setText(label);
    btnEl.removeClass("mod-cta");
    cleanup?.();
    cleanup = null;
  };

  btnEl.addEventListener("click", () => {
    if (recording) {
      stop(twoStep ? "录制连按" : "录制按键");
      return;
    }
    recording = true;
    step1 = null;
    btnEl.addClass("mod-cta");
    btnEl.setText(twoStep ? "请按第 1 键 (Esc取消)" : "请按键 (Esc取消)");

    const onKey = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === "Escape") {
        stop(twoStep ? "录制连按" : "录制按键");
        return;
      }
      const combo = comboConverter(ev, isMac);
      if (!combo) return;

      if (twoStep && !step1) {
        step1 = combo;
        btnEl.setText(`第 1 键 ${combo}，请按第 2 键`);
        return;
      }
      const finalHotkey = step1 ? `${step1} ${combo}` : combo;
      stop(twoStep ? "录制连按" : "录制按键");
      onCaptured(finalHotkey);
    };

    window.addEventListener("keydown", onKey, true);
    cleanup = () => window.removeEventListener("keydown", onKey, true);
  });
}

export function showValidationFailure(errorBanner: HTMLElement, rule: InputRule): boolean {
  const res = validateRule(rule);
  if (res.valid) {
    errorBanner.empty();
    errorBanner.style.display = "none";
    return true;
  }
  errorBanner.style.display = "block";
  errorBanner.setText(res.errors.join("；"));
  return false;
}

export class JsonTransferModal extends Modal {
  constructor(
    app: App,
    private readonly mode: "import" | "export",
    private readonly initialJson: string,
    private readonly onImport?: (raw: string) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", {
      text: this.mode === "export" ? "导出 rules.json" : "导入 rules.json",
    });

    const textarea = contentEl.createEl("textarea", {
      cls: "struct-latex-js-editor struct-latex-json-transfer",
    });
    textarea.value = this.initialJson;
    if (this.mode === "export") textarea.readOnly = true;

    const errEl = contentEl.createDiv({ cls: "struct-latex-modal-error" });
    errEl.style.display = "none";

    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    if (this.mode === "export") {
      new Setting(footer).addButton((b) =>
        b
          .setButtonText("复制 JSON")
          .setCta()
          .onClick(async () => {
            await navigator.clipboard.writeText(textarea.value);
            new Notice("已复制 rules.json 到剪贴板");
          })
      );
    } else {
      new Setting(footer)
        .addButton((b) => b.setButtonText("取消").onClick(() => this.close()))
        .addButton((b) =>
          b
            .setButtonText("校验并导入")
            .setCta()
            .onClick(async () => {
              try {
                await this.onImport?.(textarea.value);
                new Notice("已成功导入 rules.json");
                this.close();
              } catch (err) {
                errEl.style.display = "block";
                errEl.setText((err as Error).message);
              }
            })
        );
    }
  }
}

export class ConfirmResetModal extends Modal {
  constructor(app: App, private readonly onConfirm: () => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "恢复官方默认规则" });
    contentEl.createEl("p", {
      text: "该操作将用官方默认规则覆盖当前 rules.json（建议先导出备份自定义规则）。是否继续？",
    });
    const footer = contentEl.createDiv({ cls: "struct-latex-modal-footer" });
    new Setting(footer)
      .addButton((b) => b.setButtonText("取消").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("确认恢复默认")
          .setWarning()
          .onClick(async () => {
            await this.onConfirm();
            new Notice("已恢复官方默认 rules.json");
            this.close();
          })
      );
  }
}
