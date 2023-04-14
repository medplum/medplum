/*
 * Based on: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget
 */

interface Event {
  readonly type: string;
  readonly defaultPrevented?: boolean;
}

type EventListener = (e: Event) => void;

export class EventTarget {
  private readonly listeners: Record<string, EventListener[]>;

  constructor() {
    this.listeners = {};
  }

  addEventListener(type: string, callback: EventListener): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
  }

  removeEventListeneer(type: string, callback: EventListener): void {
    const array = this.listeners[type];
    if (!array) {
      return;
    }
    for (let i = 0; i < array.length; i++) {
      if (array[i] === callback) {
        array.splice(i, 1);
        return;
      }
    }
  }

  dispatchEvent(event: Event): boolean {
    const array = this.listeners[event.type];
    if (array) {
      array.forEach((listener) => listener.call(this, event));
    }
    return !event.defaultPrevented;
  }
}
