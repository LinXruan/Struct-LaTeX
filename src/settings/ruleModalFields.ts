import { Platform, Setting } from "obsidian";
import { t } from "../i18n";
import { keyboardEventToCombo } from "../input/keybindUtils";
import { InputRule, RuleGuardOptions } from "../input/types";
import { attachKeyRecorder } from "./ruleModals";

export function renderKeybindFields(container: HTMLElement, draft: InputRule): void {
  container.empty();
  if (draft.triggerMode === "auto") return;

  if (draft.triggerMode === "confirm") {
    let inputRef: HTMLInputElement | null = null;
    const setting = new Setting(container)
      .setName(t("fields.confirmKey.name"))
      .setDesc(t("fields.confirmKey.desc"))
      .addText((text) => {
        text.setPlaceholder(t("fields.confirmKey.placeholder")).setValue(draft.confirmKey ?? "");
        inputRef = text.inputEl;
        text.onChange((v) => {
          draft.confirmKey = v.trim();
        });
      });

    const recBtn = setting.controlEl.createEl("button", { text: t("fields.recordKey") });
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
    .setName(t("fields.hotkey.name"))
    .setDesc(t("fields.hotkey.desc"))
    .addText((text) => {
      text.setPlaceholder(t("fields.hotkey.placeholder")).setValue(draft.hotkey ?? "");
      hkInput = text.inputEl;
      text.onChange((v) => {
        draft.hotkey = v.trim();
      });
    });

  const btn1 = setting.controlEl.createEl("button", { text: t("fields.recordSingle") });
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
  const btn2 = setting.controlEl.createEl("button", { text: t("fields.recordChord") });
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
  details.createEl("summary", { text: t("fields.guards.summary") });
  if (!draft.guards) draft.guards = {};
  const guards: RuleGuardOptions = draft.guards;
  const isMath = draft.scope === "math";

  new Setting(details)
    .setName(t("fields.guards.wordBoundary.name"))
    .setDesc(t("fields.guards.wordBoundary.desc"))
    .addToggle((tInput) =>
      tInput.setValue(Boolean(guards.wordBoundary)).onChange((v) => {
        guards.wordBoundary = v;
      })
    );
  new Setting(details)
    .setName(t("fields.guards.excludeText"))
    .addToggle((tInput) =>
      tInput.setValue(guards.excludeInTextMode ?? isMath).onChange((v) => {
        guards.excludeInTextMode = v;
      })
    );
  new Setting(details)
    .setName(t("fields.guards.excludeCmd"))
    .addToggle((tInput) =>
      tInput.setValue(guards.excludeInCommand ?? isMath).onChange((v) => {
        guards.excludeInCommand = v;
      })
    );
  new Setting(details)
    .setName(t("fields.guards.excludeEnv"))
    .addToggle((tInput) =>
      tInput.setValue(guards.excludeInEnvName ?? isMath).onChange((v) => {
        guards.excludeInEnvName = v;
      })
    );
  new Setting(details)
    .setName(t("fields.guards.skipDialect"))
    .addToggle((tInput) =>
      tInput.setValue(Boolean(draft.skipDialect)).onChange((v) => {
        draft.skipDialect = v;
        onPreviewInvalidated();
      })
    );
  new Setting(details)
    .setName(t("fields.guards.preview.name"))
    .addText((tInput) =>
      tInput
        .setPlaceholder(t("fields.guards.preview.placeholder"))
        .setValue(draft.preview ?? "")
        .onChange((v) => {
          draft.preview = v;
          onPreviewInvalidated();
        })
    );
}
