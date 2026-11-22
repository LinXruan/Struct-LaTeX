export type ReorderCallback = (
  draggedId: string,
  beforeId: string | null,
  afterId: string | null
) => Promise<void>;

let cancelActiveDrag: (() => void) | null = null;

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  const win = el.ownerDocument.defaultView ?? window;
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const style = win.getComputedStyle(cur);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function getOrderedRuleSiblings(listEl: HTMLElement, excludeRow: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  for (let i = 0; i < listEl.children.length; i++) {
    const child = listEl.children[i];
    if (
      child.instanceOf(HTMLElement) &&
      child !== excludeRow &&
      child.classList.contains("struct-latex-rule-row") &&
      !child.classList.contains("struct-latex-rule-draft")
    ) {
      result.push(child);
    }
  }
  return result;
}

function movePlaceholderWithFlip(
  listEl: HTMLElement,
  placeholder: HTMLElement,
  nextSibling: HTMLElement | null,
  siblings: readonly HTMLElement[]
): void {
  if (placeholder.nextElementSibling === nextSibling) return;

  const oldTops = new Map<HTMLElement, number>();
  for (const sib of siblings) {
    oldTops.set(sib, sib.getBoundingClientRect().top);
  }

  if (nextSibling) {
    listEl.insertBefore(placeholder, nextSibling);
  } else {
    listEl.appendChild(placeholder);
  }

  const moved: Array<{ el: HTMLElement; delta: number }> = [];
  for (const sib of siblings) {
    const prevTop = oldTops.get(sib);
    if (prevTop === undefined) continue;
    const delta = prevTop - sib.getBoundingClientRect().top;
    if (Math.abs(delta) > 0.5) {
      sib.classList.remove("struct-latex-flip-animate");
      sib.classList.add("struct-latex-flip-none");
      sib.style.transform = `translateY(${delta}px)`;
      moved.push({ el: sib, delta });
    }
  }

  if (moved.length === 0) return;
  void listEl.offsetHeight;
  for (const item of moved) {
    item.el.classList.remove("struct-latex-flip-none");
    item.el.classList.add("struct-latex-flip-animate");
    item.el.style.transform = "";
  }
}

function findAdjacentIds(
  placeholder: HTMLElement,
  excludeRow: HTMLElement
): { beforeId: string | null; afterId: string | null } {
  let prevEl: Element | null = placeholder.previousElementSibling;
  while (prevEl) {
    if (
      prevEl.instanceOf(HTMLElement) &&
      prevEl !== excludeRow &&
      prevEl.classList.contains("struct-latex-rule-row") &&
      !prevEl.classList.contains("struct-latex-rule-draft") &&
      prevEl.dataset.ruleId
    ) {
      break;
    }
    prevEl = prevEl.previousElementSibling;
  }

  let nextEl: Element | null = placeholder.nextElementSibling;
  while (nextEl) {
    if (
      nextEl.instanceOf(HTMLElement) &&
      nextEl !== excludeRow &&
      nextEl.classList.contains("struct-latex-rule-row") &&
      !nextEl.classList.contains("struct-latex-rule-draft") &&
      nextEl.dataset.ruleId
    ) {
      break;
    }
    nextEl = nextEl.nextElementSibling;
  }

  return {
    afterId: prevEl?.instanceOf(HTMLElement) ? prevEl.dataset.ruleId ?? null : null,
    beforeId: nextEl?.instanceOf(HTMLElement) ? nextEl.dataset.ruleId ?? null : null,
  };
}

export function attachPointerDragSort(
  handle: HTMLElement,
  row: HTMLElement,
  ruleId: string,
  onReorder: ReorderCallback
): void {
  handle.addEventListener("pointerdown", (downEv) => {
    if (downEv.button !== 0) return;
    cancelActiveDrag?.();
    const listEl = row.parentElement;
    if (!listEl) return;

    downEv.preventDefault();
    const doc = row.ownerDocument;
    const win = doc.defaultView ?? window;
    const startX = downEv.clientX;
    const startY = downEv.clientY;
    let lastClientX = startX;
    let lastClientY = startY;
    let active = false;
    let ghost: HTMLElement | null = null;
    let placeholder: HTMLElement | null = null;
    let scrollRaf: number | null = null;
    const scrollContainer = findScrollContainer(listEl);

    const updatePlacement = () => {
      if (!active || !placeholder) return;
      const siblings = getOrderedRuleSiblings(listEl, row);
      let nextSib: HTMLElement | null = null;
      for (const sib of siblings) {
        const rect = sib.getBoundingClientRect();
        if (lastClientY < rect.top + rect.height / 2) {
          nextSib = sib;
          break;
        }
      }
      movePlaceholderWithFlip(listEl, placeholder, nextSib, siblings);
    };

    const tickAutoScroll = () => {
      if (!active || !scrollContainer) {
        scrollRaf = null;
        return;
      }
      const rect = scrollContainer.getBoundingClientRect();
      const edge = 48;
      let delta = 0;
      if (lastClientY < rect.top + edge) {
        delta = -Math.ceil(((rect.top + edge - lastClientY) / edge) * 12);
      } else if (lastClientY > rect.bottom - edge) {
        delta = Math.ceil(((lastClientY - (rect.bottom - edge)) / edge) * 12);
      }
      if (delta !== 0) {
        scrollContainer.scrollTop += delta;
        updatePlacement();
      }
      scrollRaf = win.requestAnimationFrame(tickAutoScroll);
    };

    const activateDrag = () => {
      active = true;
      const rowRect = row.getBoundingClientRect();
      ghost = row.cloneNode(true) as HTMLElement;
      const srcInputs = row.querySelectorAll("input");
      const dstInputs = ghost.querySelectorAll("input");
      for (let i = 0; i < srcInputs.length && i < dstInputs.length; i++) {
        dstInputs[i].value = srcInputs[i].value;
      }
      ghost.addClass("struct-latex-drag-ghost");
      ghost.style.width = `${rowRect.width}px`;
      ghost.style.height = `${rowRect.height}px`;
      ghost.style.left = `${rowRect.left}px`;
      ghost.style.top = `${rowRect.top}px`;
      doc.body.appendChild(ghost);

      placeholder = doc.createElement("div");
      placeholder.className = "struct-latex-drop-placeholder";
      placeholder.style.height = `${rowRect.height}px`;
      listEl.insertBefore(placeholder, row);
      row.addClass("struct-latex-hidden");
      doc.body.classList.add("struct-latex-is-dragging");

      if (scrollContainer) {
        scrollRaf = win.requestAnimationFrame(tickAutoScroll);
      }
    };

    const onMove = (moveEv: PointerEvent) => {
      lastClientX = moveEv.clientX;
      lastClientY = moveEv.clientY;
      const dx = lastClientX - startX;
      const dy = lastClientY - startY;
      if (!active) {
        if (Math.hypot(dx, dy) < 4) return;
        activateDrag();
      }
      if (ghost) {
        ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      }
      updatePlacement();
    };

    const cleanup = (commit: boolean) => {
      cancelActiveDrag = null;
      win.removeEventListener("pointermove", onMove, true);
      win.removeEventListener("pointerup", onUp, true);
      win.removeEventListener("pointercancel", onCancel, true);
      win.removeEventListener("blur", onCancel);
      if (scrollRaf !== null) {
        win.cancelAnimationFrame(scrollRaf);
        scrollRaf = null;
      }
      if (!active) return;

      doc.body.classList.remove("struct-latex-is-dragging");
      ghost?.remove();
      ghost = null;

      const siblings = getOrderedRuleSiblings(listEl, row);
      for (const sib of siblings) {
        sib.classList.remove("struct-latex-flip-none", "struct-latex-flip-animate");
        sib.style.transform = "";
      }

      const adj = placeholder ? findAdjacentIds(placeholder, row) : { beforeId: null, afterId: null };
      if (commit && placeholder && (adj.beforeId || adj.afterId)) {
        listEl.insertBefore(row, placeholder);
      }
      placeholder?.remove();
      placeholder = null;
      row.removeClass("struct-latex-hidden");

      if (commit && (adj.beforeId || adj.afterId)) {
        void onReorder(ruleId, adj.beforeId, adj.afterId);
      }
    };

    const onUp = () => cleanup(true);
    const onCancel = () => cleanup(false);
    cancelActiveDrag = onCancel;

    win.addEventListener("pointermove", onMove, true);
    win.addEventListener("pointerup", onUp, true);
    win.addEventListener("pointercancel", onCancel, true);
    win.addEventListener("blur", onCancel);
  });
}
