import { Hl7CloseEvent, Hl7ErrorEvent, Hl7MessageEvent } from './events';

export interface Hl7EventMap {
  message: Hl7MessageEvent;
  error: Hl7ErrorEvent;
  close: Hl7CloseEvent;
}

export abstract class Hl7Base extends EventTarget {
  addEventListener<K extends keyof Hl7EventMap>(
    type: K,
    listener: ((event: Hl7EventMap[K]) => void) | EventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, listener, options);
  }
  removeEventListener<K extends keyof Hl7EventMap>(
    type: K,
    listener: ((event: Hl7EventMap[K]) => void) | EventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.removeEventListener(type, listener, options);
  }
}
