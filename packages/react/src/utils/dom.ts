import { SyntheticEvent } from 'react';

/**
 * Kills a browser event.
 * Prevents default behavior.
 * Stops event propagation.
 * @param e - The event.
 */
export function killEvent(e: Event | SyntheticEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Returns true if the element is a checkbox or a table cell containing a checkbox.
 * Table cells containing checkboxes are commonly accidentally clicked.
 * @param el - The HTML DOM element.
 * @returns True if the element is a checkbox or a table cell containing a checkbox.
 */
export function isCheckboxCell(el: Element): boolean {
  if (isCheckboxElement(el)) {
    return true;
  }

  if (el instanceof HTMLTableCellElement) {
    const children = el.children;
    if (children.length === 1 && isCheckboxElement(children[0])) {
      return true;
    }
  }

  return false;
}

function isCheckboxElement(el: Element): boolean {
  return el instanceof HTMLInputElement && el.type === 'checkbox';
}
