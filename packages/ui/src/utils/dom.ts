/**
 * Kills a browser event.
 * Prevents default behavior.
 * Stops event propagation.
 * @param e The event.
 */
export function killEvent(e: Event | React.SyntheticEvent): void {
  e.preventDefault();
  e.stopPropagation();
}
