import { Extension, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { matchesKeyEventCombo } from "../input/keybindUtils";

export interface KeybindHijackOptions {
  isEnabled: () => boolean;
  getKeybind: () => string;
  defaultKeybind: string;
  isMac?: boolean;
  run: (view: EditorView) => boolean;
}

/**
 * Intercepts configured key events at highest editor precedence before `smartInput` and `keymap`.
 */
export function createKeybindHijackExtension(options: KeybindHijackOptions): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (!options.isEnabled()) return false;
        if (view.state.readOnly || view.composing || event.isComposing) return false;
        if (!matchesKeyEventCombo(event, options.getKeybind(), options.defaultKeybind, options.isMac)) {
          return false;
        }
        if (!options.run(view)) return false;

        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    })
  );
}
