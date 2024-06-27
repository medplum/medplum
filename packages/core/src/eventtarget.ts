/*
 * Based on: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget
 */

export interface Event<T extends string = string> {
  readonly type: T;
  readonly defaultPrevented?: boolean;
}

export type TypedEvent<T extends string> = globalThis.Event & {
  type: T;
};

export type EventMap<T> = { [K in keyof T]: K extends string ? Event<K> | T[K] : never } | NoEventMap;
export type NoEventMap = [never];
export type Key<K, T> = T extends NoEventMap ? string : K | keyof T;
export type TargetEvent<K, T> = T extends NoEventMap ? Event : K extends keyof T & string ? T[K] & Event<K> : never;
export type EventListener<K, T> = T extends NoEventMap
  ? (event: Event) => void
  : K extends keyof T & string
    ? T[K] extends Event
      ? (event: T[K]) => void
      : never
    : never;
export type ListenersMap<T> = Record<Key<keyof T, T>, EventListener<keyof T, T>[]>;

export interface IEventTarget<TEvents extends EventMap<TEvents> = NoEventMap> {
  addEventListener<TEventType>(type: Key<TEventType, TEvents>, listener: EventListener<TEventType, TEvents>): void;
  removeEventListener<TEventType>(type: Key<TEventType, TEvents>, listener: EventListener<TEventType, TEvents>): void;
  dispatchEvent<TEventType>(event: TargetEvent<TEventType, TEvents>): boolean;
  removeAllListeners(): void;
}

export class EventTarget<TEvents extends EventMap<TEvents> = NoEventMap> implements IEventTarget<TEvents> {
  private listeners: ListenersMap<TEvents>;

  constructor() {
    this.listeners = {} as ListenersMap<TEvents>;
  }

  addEventListener<TEventType>(type: Key<TEventType, TEvents>, listener: EventListener<TEventType, TEvents>): void {
    if (!this.listeners[type as keyof ListenersMap<TEvents>]) {
      this.listeners[type as keyof ListenersMap<TEvents>] = [] as EventListener<keyof TEvents, TEvents>[];
    }
    this.listeners[type as keyof ListenersMap<TEvents>].push(listener as EventListener<keyof TEvents, TEvents>);
  }

  removeEventListener<TEventType>(type: Key<TEventType, TEvents>, callback: EventListener<TEventType, TEvents>): void {
    const array = this.listeners[type as keyof ListenersMap<TEvents>];
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

  dispatchEvent<TEventType>(event: TargetEvent<TEventType, TEvents>): boolean {
    const array = this.listeners[event.type as keyof ListenersMap<TEvents>];
    if (array) {
      for (const listener of array) {
        // @ts-expect-error This works but TS doesn't like it
        listener.call(this, event);
      }
    }
    return !event.defaultPrevented;
  }

  removeAllListeners(): void {
    this.listeners = {} as ListenersMap<TEvents>;
  }
}
