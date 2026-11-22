import { Platform, Setting } from "obsidian";
import { keyboardEventToCombo } from "../input/keybindUtils";
import { InputRule, RuleGuardOptions } from "../input/types";
import { attachKeyRecorder } from "./ruleModals";

export function renderKeybindFields(container: HTMLElement, draft: InputRule): void {
  container.empty();
  if (draft.triggerMode === "auto") return;

  if (draft.triggerMode === "confirm") {
    let inputRef: HTMLInputElement | null = null;
    const setting = new Setting(container)
      .setName("确认键")
      .setDesc("输入触发词后再按下该键才触发（如 Space、Tab、Enter）")
      .addText((text) => {
        text.setPlaceholder("Space / Tab / Enter").setValue(draft.confirmKey ?? "");
        inputRef = text.inputEl;
        text.onChange((v) => {
          draft.confirmKey = v.trim();
        });
      });

    const recBtn = setting.controlEl.createEl("button", { text: "录制按键" });
    attachKeyRecorder(
      recBtn,
      Platform.isMacOS,
      (combo) => {
        draft.confirmKey = combo;
        if (inputRef) inputRef.value = combo;
      },
      keyboardEventToCombo,
      false
    );
    return;
  }

  let hkInput: HTMLInputElement | null = null;
  const setting = new Setting(container)
    .setName("快捷键 / 连按")
    .setDesc("支持单组合键（如 Alt+F）或二段连按（如 Mod+K F）")
    .addText((text) => {
      text.setPlaceholder("Alt+F 或 Mod+K F").setValue(draft.hotkey ?? "");
      hkInput = text.inputEl;
      text.onChange((v) => {
        draft.hotkey = v.trim();
      });
    });

  const btn1 = setting.controlEl.createEl("button", { text: "录制单键" });
  attachKeyRecorder(
    btn1,
    Platform.isMacOS,
    (combo) => {
      draft.hotkey = combo;
      if (hkInput) hkInput.value = combo;
    },
    keyboardEventToCombo,
    false
  );
  const btn2 = setting.controlEl.createEl("button", { text: "录制连按" });
  attachKeyRecorder(
    btn2,
    Platform.isMacOS,
    (chord) => {
      draft.hotkey = chord;
      if (hkInput) hkInput.value = chord;
    },
    keyboardEventToCombo,
    true
  );
}

export function renderGuardsFields(
  container: HTMLElement,
  draft: InputRule,
  onPreviewInvalidated: () => void
): void {
  const details = container.createEl("details", { cls: "struct-latex-guards-details" });
  details.createEl("summary", { text: "上下文守卫与高级选项" });
  if (!draft.guards) draft.guards = {};
  const guards: RuleGuardOptions = draft.guards;
  const isMath = draft.scope === "math";

  new Setting(details)
    .setName("词边界保护")
    .setDesc("触发词左侧紧接英文字母时不触发")
    .addToggle((t) =>
      t.setValue(Boolean(guards.wordBoundary)).onChange((v) => {
        guards.wordBoundary = v;
      })
    );
  new Setting(details)
    .setName("跳过 \\text{...} 文本槽")
    .addToggle((t) =>
      t.setValue(guards.excludeInTextMode ?? isMath).onChange((v) => {
        guards.excludeInTextMode = v;
      })
    );
  new Setting(details)
    .setName("跳过手写 \\command")
    .addToggle((t) =>
      t.setValue(guards.excludeInCommand ?? isMath).onChange((v) => {
        guards.excludeInCommand = v;
      })
    );
  new Setting(details)
    .setName("跳过 \\begin{...} 环境名")
    .addToggle((t) =>
      t.setValue(guards.excludeInEnvName ?? isMath).onChange((v) => {
        guards.excludeInEnvName = v;
      })
    );
  new Setting(details)
    .setName("跳过全局输出Unicode转换")
    .addToggle((t) =>
      t.setValue(Boolean(draft.skipDialect)).onChange((v) => {
        draft.skipDialect = v;
        onPreviewInvalidated();
      })
    );
  new Setting(details)
    .setName("自定义预览 LaTeX（可选）")
    .addText((t) =>
      t.setPlaceholder("留空则自动推导").setValue(draft.preview ?? "").onChange((v) => {
        draft.preview = v;
        onPreviewInvalidated();
      })
    );
}
