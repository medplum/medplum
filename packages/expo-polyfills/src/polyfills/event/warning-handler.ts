import { assertType } from './misc';

declare const console: any;

let currentWarnHandler: setWarningHandler.WarningHandler | undefined;

/**
 * Set the warning handler.
 * @param value - The warning handler to set.
 */
export function setWarningHandler(value: setWarningHandler.WarningHandler | undefined): void {
  assertType(
    typeof value === 'function' || value === undefined,
    'The warning handler must be a function or undefined, but got %o.',
    value
  );
  currentWarnHandler = value;
}
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace setWarningHandler {
  /**
   * The warning information.
   */
  export interface Warning {
    /**
     * The code of this warning.
     */
    code: string;
    /**
     * The message in English.
     */
    message: string;
    /**
     * The arguments for replacing placeholders in the text.
     */
    args: any[];
  }

  /**
   * The warning handler.
   * @param warning - The warning.
   */
  export type WarningHandler = (warning: Warning) => void;
}

/**
 * The warning information.
 */
export class Warning<TArgs extends any[]> {
  readonly code: string;
  readonly message: string;

  constructor(code: string, message: string) {
    this.code = code;
    this.message = message;
  }

  /**
   * Report this warning.
   * @param args - The arguments of the warning.
   */
  warn(...args: TArgs): void {
    try {
      // Call the user-defined warning handler if exists.
      if (currentWarnHandler) {
        currentWarnHandler({ ...this, args });
        return;
      }

      // Otherwise, print the warning.
      const stack = (new Error().stack ?? '').replace(/^(?:.+?\n){2}/gu, '\n');
      console.warn(this.message, ...args, stack);
    } catch {
      // Ignore.
    }
  }
}
