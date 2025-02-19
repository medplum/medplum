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

export type Command<T = string> = {
  command: string;
  value?: T;
};

/**
 * Sends a structured command to the iframe using postMessage.
 *
 * Normally postMessage implies global event listeners. This method uses
 * MessageChannel to create a message channel between the iframe and the parent.
 * @param frame - The receiving IFrame.
 * @param command - The command to send.
 * @returns Promise to the response from the IFrame.
 * @see https://advancedweb.hu/how-to-use-async-await-with-postmessage/
 */
export async function sendCommand<T = string, R = unknown>(frame: HTMLIFrameElement, command: Command<T>): Promise<R> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = ({ data }) => {
      channel.port1.close();
      if (data.error) {
        reject(data.error);
      } else {
        resolve(data.result);
      }
    };

    frame.contentWindow?.postMessage(command, new URL(frame.src).origin, [channel.port2]);
  });
}
