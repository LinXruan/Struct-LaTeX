import { Extension } from "@codemirror/state";
import { Plugin } from "obsidian";
import { createSmartBackspaceExtension } from "./editor/smartBackspace";
import { createSmartJumpExtension } from "./editor/smartJump";

export default class StructLatexPlugin extends Plugin {
  private editorExtensions: Extension[] = [];

  async onload(): Promise<void> {
    this.editorExtensions.push(createSmartBackspaceExtension(), createSmartJumpExtension());
    this.registerEditorExtension(this.editorExtensions);
  }

  onunload(): void {
    this.editorExtensions.length = 0;
  }
}
