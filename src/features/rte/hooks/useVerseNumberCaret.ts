import { useEffect, type RefObject } from 'react';

import {
  BLOCK_SELECTOR,
  EDITABLE_EDITOR_SELECTOR,
  VERSE_MARKER_SELECTOR,
  elementAt,
} from '../lib/editor-dom';

/** The editor pads its non-editable markers with these; they are not words. */
const INVISIBLE_CHARACTERS = /[\u200B\uFEFF]/g;

/** A verse is empty when nothing but other markers follows its number in the paragraph. */
function isEmptyVerse(marker: Element): boolean {
  for (let node = marker.nextSibling; node; node = node.nextSibling) {
    if (node instanceof Element && node.matches(VERSE_MARKER_SELECTOR)) return true;
    if ((node.textContent ?? '').replace(INVISIBLE_CHARACTERS, '').trim() !== '') return false;
  }
  return true;
}

/** The last verse number before the point in reading order, so the verse the click follows. */
function markerBefore(block: Element, x: number, y: number): Element | undefined {
  const rtl = getComputedStyle(block).direction === 'rtl';
  let found: Element | undefined;
  for (const marker of Array.from(block.children)) {
    if (!marker.matches(VERSE_MARKER_SELECTOR)) continue;
    const box = marker.getBoundingClientRect();
    const earlierLine = box.bottom <= y;
    const earlierOnLine = box.top <= y && y < box.bottom && (rtl ? box.right >= x : box.left <= x);
    if (earlierLine || earlierOnLine) found = marker;
  }
  return found;
}

/** The verse number under the point. */
function markerAt(block: Element, x: number, y: number): Element | undefined {
  return Array.from(block.children).find(marker => {
    if (!marker.matches(VERSE_MARKER_SELECTOR)) return false;
    const box = marker.getBoundingClientRect();
    return box.left <= x && x <= box.right && box.top <= y && y <= box.bottom;
  });
}

/**
 * Lets a click on a verse number, or in a verse that has no words yet, put the caret right after
 * that number (#314, #479).
 *
 * An empty verse is only its number, a non-editable element, so an undrafted pericope is a
 * paragraph of numbers with no text between them. Firefox cannot hold a caret between two
 * non-editable elements: a click there lands at the end of the paragraph, so the words go into the
 * last verse, or before the chapter number, where they are never saved. Clicking a number itself
 * leaves the caret outside the editor in Chromium too. Editorial moves the caret for its own
 * empty-verse placeholder only behind `hasActiveTextFocusBox`, which also draws its focus box.
 *
 * A number followed by words lets the pointer through to its paragraph, so a drag can start on it
 * (editor-shared.css). The browser then places a plain click on that number by itself and gets it
 * wrong: Firefox puts the caret at the end of the verse before, Chromium at the start of the
 * paragraph, so pasted words went into another verse.
 *
 * After the browser has handled a plain click on a verse number, or on the paragraph just after an
 * empty verse's number, this puts the caret in the paragraph right after that number. Lexical
 * picks the position up from `selectionchange`, so typing and pasting land in that verse.
 */
export function useVerseNumberCaret(
  containerRef: RefObject<HTMLElement | null>,
  readOnly: boolean
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;

    const onClick = (event: MouseEvent) => {
      // Double clicks select words and shift-clicks extend a selection; both stay native.
      if (event.button !== 0 || event.detail > 1 || event.shiftKey) return;
      const target = event.target instanceof Node ? elementAt(event.target) : null;
      const root = target?.closest<HTMLElement>(EDITABLE_EDITOR_SELECTOR);
      if (!target || !root || !container.contains(root)) return;
      const selection = window.getSelection();
      if (!selection || (selection.rangeCount > 0 && !selection.isCollapsed)) return;

      const clicked = target.closest(VERSE_MARKER_SELECTOR);
      const block = (clicked ?? target).closest(BLOCK_SELECTOR);
      if (!block || !root.contains(block)) return;
      // Clicks on words are the browser's to place.
      if (!clicked && target !== block) return;
      const number = clicked ?? markerAt(block, event.clientX, event.clientY);
      const marker = number ?? markerBefore(block, event.clientX, event.clientY);
      // A click in the paragraph past a verse's words is the browser's to place too.
      if (marker?.parentElement !== block || (!number && !isEmptyVerse(marker))) return;

      root.focus({ preventScroll: true });
      selection.collapse(block, Array.prototype.indexOf.call(block.childNodes, marker) + 1);
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [containerRef, readOnly]);
}
