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
      for (const listener of array) {
        listener.call(this, event);
      }
    }
    return !event.defaultPrevented;
  }

  removeAllListeners(): void {
    // @ts-expect-error Normally listeners is read-only. In this case we are dumping all listeners
    this.listeners = {};
  }
}

export class TypedEventTarget<TEvents extends Record<string, Event>> {
  private emitter = new EventTarget();

  dispatchEvent<TEventType extends keyof TEvents & string>(event: TEvents[TEventType]): void {
    this.emitter.dispatchEvent(event);
  }

  addEventListener<TEventType extends keyof TEvents & string>(
    type: TEventType,
    handler: (event: TEvents[TEventType]) => void
  ): void {
    this.emitter.addEventListener(type, handler as any);
  }

  removeEventListener<TEventType extends keyof TEvents & string>(
    type: TEventType,
    handler: (event: TEvents[TEventType]) => void
  ): void {
    this.emitter.removeEventListener(type, handler as any);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
