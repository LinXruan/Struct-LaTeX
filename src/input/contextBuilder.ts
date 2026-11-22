import { tokenizeMath } from "../parser/tokenizer";
import { LatexObject, MathTree, Slot } from "../parser/types";
import { isCommandPrefix, isKnownCommand } from "./commandCatalog";
import { InputRuleContext, InputRuleHelpers } from "./types";

const TEXT_MODE_COMMANDS = new Set(["\\text", "\\textrm", "\\textbf", "\\textit", "\\mbox"]);

/**
 * Expands `$0` caret placeholders inside a replacement template.
 * Unescaped `$0` sets the cursor position and is stripped; `\$0` keeps `$0` literal.
 */
export function expandTemplate(tpl: string): { insert: string; cursorOffset: number } {
  let out = "";
  let cursorOffset: number | null = null;
  let i = 0;

  while (i < tpl.length) {
    if (tpl[i] === "$" && tpl[i + 1] === "0") {
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && tpl[j] === "\\"; j--) backslashes++;

      if (backslashes % 2 === 0) {
        if (cursorOffset === null) cursorOffset = out.length;
        i += 2;
        continue;
      }
    }
    out += tpl[i];
    i++;
  }

  return {
    insert: out,
    cursorOffset: cursorOffset ?? out.length,
  };
}

const DEFAULT_HELPERS: InputRuleHelpers = {
  isKnownCommand,
  isCommandPrefix,
  expandTemplate,
};

function findDeepestSlot(objects: readonly LatexObject[], relPos: number): Slot | null {
  for (const obj of objects) {
    if (obj.kind !== "bracket") continue;
    if (relPos < obj.coreFrom || relPos > obj.coreTo) continue;

    for (const slot of obj.slots) {
      if (relPos >= slot.bodyFrom && relPos <= slot.bodyTo) {
        return findDeepestSlot(slot.children, relPos) ?? slot;
      }
    }
  }
  return null;
}

function findPrevObject(list: readonly LatexObject[], relPos: number): LatexObject | null {
  let prev: LatexObject | null = null;
  for (const obj of list) {
    if (obj.to <= relPos || obj.coreTo <= relPos) {
      prev = obj;
    } else if (obj.coreFrom >= relPos) {
      break;
    }
  }
  return prev;
}

function isInTextModeSlot(before: string, tree: MathTree | null, relPos: number): boolean {
  if (tree) {
    for (const obj of tree.allObjects) {
      if (obj.kind !== "bracket") continue;
      for (const slot of obj.slots) {
        if (slot.textMode && relPos >= slot.bodyFrom && relPos <= slot.bodyTo) {
          return true;
        }
      }
    }
  }

  const tokens = tokenizeMath(before);
  const stack: boolean[] = [];
  let expectingBrace = false;
  for (const tok of tokens) {
    if (expectingBrace) {
      if (tok.kind === "whitespace") continue;
      expectingBrace = false;
      if (tok.kind === "brace_open") {
        stack.push(true);
        continue;
      }
    }
    if (tok.kind === "command" && TEXT_MODE_COMMANDS.has(tok.text)) {
      expectingBrace = true;
    } else if (tok.kind === "brace_open") {
      stack.push(false);
    } else if (tok.kind === "brace_close") {
      stack.pop();
    }
  }
  return stack.some(Boolean);
}

const UNESCAPED_CMD_TAIL_RE = /(?:^|[^\\])(?:\\\\)*\\([a-zA-Z]*)$/;

function isTypingEnvName(before: string): boolean {
  return /\\(?:begin|end)\s*\{[a-zA-Z0-9*]*$/.test(before);
}

function isTypingCommand(before: string, key: string): boolean {
  const match = UNESCAPED_CMD_TAIL_RE.exec(before);
  if (!match) return false;
  const letters = match[1];
  // Bare unescaped `\`: any typed character begins `\cmd` or a control symbol (`\_`, `\^`, `\/`).
  if (letters.length === 0) return key.length > 0;
  // Inside `\[a-zA-Z]+`: only letters extend the command name; operators like `_`, `^`, `/` end it.
  if (/^[a-zA-Z]/.test(key)) return true;
  // `\left/` and `\right/` form single delimiter tokens in `tokenizeMath`.
  if (key === "/" && (letters === "left" || letters === "right")) return true;
  return false;
}

/**
 * Returns true when `matchStart` falls strictly inside an existing backslash-prefixed
 * token (e.g. `\sm`, `\;`, `\|`, `\left|`) in `before`, which would slice off the `\` prefix.
 */
export function slicesBackslashToken(before: string, matchStart: number): boolean {
  if (matchStart <= 0 || matchStart >= before.length) return false;
  const lineStart = before.lastIndexOf("\n", matchStart - 1) + 1;
  const relStart = matchStart - lineStart;
  const tokens = tokenizeMath(before.slice(lineStart));
  for (const tok of tokens) {
    if (tok.from >= relStart) break;
    if (tok.to > relStart && tok.text.startsWith("\\")) {
      return true;
    }
  }
  return false;
}

export interface ContextBuildParams {
  key: string;
  before: string;
  after: string;
  inMath: boolean;
  inBlockMath: boolean;
  inCode: boolean;
  tree: MathTree | null;
  relPos: number;
}

/**
 * Builds the read-only `InputRuleContext` shared uniformly by text, regex, and JS rules.
 */
export function buildRuleContext(params: ContextBuildParams): InputRuleContext {
  const { key, before, after, inMath, inBlockMath, inCode, tree, relPos } = params;
  const currentSlot = tree ? findDeepestSlot(tree.roots, relPos) : null;
  const containerList = currentSlot ? currentSlot.children : tree?.roots ?? [];
  const prevObject = tree ? findPrevObject(containerList, relPos) : null;

  return {
    key,
    before,
    text: before + key,
    after,
    inMath,
    inBlockMath,
    inCode,
    inTextMode: inMath ? isInTextModeSlot(before, tree, relPos) : false,
    inCommandTyping: inMath ? isTypingCommand(before, key) : false,
    inEnvName: inMath ? isTypingEnvName(before) : false,
    tree,
    relPos,
    prevObject,
    currentSlot,
    helpers: DEFAULT_HELPERS,
  };
}
