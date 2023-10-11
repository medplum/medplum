/*
 * Based on: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget
 */

export interface Event {
  readonly type: string;
  readonly defaultPrevented?: boolean;
}

export type EventListener = (e: Event) => void;

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

  removeEventListener(type: string, callback: EventListener): void {
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

export class TypedEventTarget<TEvents extends Record<string, any>> {
  private emitter = new EventTarget();

  dispatchEvent<TEventName extends keyof TEvents & string>(event: TEvents[TEventName]): void {
    this.emitter.dispatchEvent(event);
  }

  addEventListener<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    handler: (event: TEvents[TEventName]) => void
  ): void {
    this.emitter.addEventListener(eventName, handler as any);
  }

  removeEventListener<TEventName extends keyof TEvents & string>(
    eventName: TEventName,
    handler: (event: TEvents[TEventName]) => void
  ): void {
    this.emitter.removeEventListener(eventName, handler as any);
  }
}
