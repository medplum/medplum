import { Event } from './event';

describe('Event', () => {
  test('Constructor', () => {
    const event = new Event('test');
    expect(event).toBeInstanceOf(globalThis.Event);
    expect(event.type).toEqual('test');
  });

  test('Event phase enums', () => {
    expect(Event.NONE).toEqual(0);
    expect(Event.CAPTURING_PHASE).toEqual(1);
    expect(Event.AT_TARGET).toEqual(2);
    expect(Event.BUBBLING_PHASE).toEqual(3);

    const event = new Event('test');
    expect(event.NONE).toEqual(0);
    expect(event.CAPTURING_PHASE).toEqual(1);
    expect(event.AT_TARGET).toEqual(2);
    expect(event.BUBBLING_PHASE).toEqual(3);
  });

  test('Event phase', () => {
    const event = new Event('test');
    expect(event.eventPhase).toEqual(0);
  });

  test('Target', () => {
    const event = new Event('test');
    expect(event.currentTarget).toEqual(null);
    expect(event.target).toEqual(null);
    expect(event.srcElement).toEqual(null);
    expect(event.composedPath()).toEqual([]);
  });

  test('.bubbles', () => {
    const event1 = new Event('test');
    expect(event1.bubbles).toEqual(false);
    const event2 = new Event('test', { bubbles: true });
    expect(event2.bubbles).toEqual(true);
    const event3 = new Event('test', { bubbles: false });
    expect(event3.bubbles).toEqual(false);
  });

  test('.cancelable', () => {
    const event1 = new Event('test');
    expect(event1.cancelable).toEqual(false);
    const event2 = new Event('test', { cancelable: true });
    expect(event2.cancelable).toEqual(true);
    const event3 = new Event('test', { cancelable: false });
    expect(event3.cancelable).toEqual(false);
  });

  test('.stopPropagation', () => {
    const event = new Event('test');
    expect(event.cancelBubble).toEqual(false);
    event.stopPropagation();
    expect(event.cancelBubble).toEqual(true);
  });

  test('.stopImmediatePropagation', () => {
    const event = new Event('test');
    expect(event.cancelBubble).toEqual(false);
    event.stopImmediatePropagation();
    expect(event.cancelBubble).toEqual(true);
  });

  test('.cancelBubble', () => {
    const event = new Event('test');
    expect(event.cancelBubble).toEqual(false);
    event.cancelBubble = true;
    expect(event.cancelBubble).toEqual(true);
  });

  test('.returnValue', () => {
    const event = new Event('test', { cancelable: true });
    expect(event.returnValue).toEqual(true);
    expect(event.defaultPrevented).toEqual(false);
    event.returnValue = false;
    expect(event.returnValue).toEqual(false);
    expect(event.defaultPrevented).toEqual(true);
  });

  test('.preventDefault()', () => {
    const event = new Event('test', { cancelable: true });
    expect(event.defaultPrevented).toEqual(false);
    expect(event.returnValue).toEqual(true);
    event.preventDefault();
    expect(event.defaultPrevented).toEqual(true);
    expect(event.returnValue).toEqual(false);
  });

  test('.isTrusted', () => {
    const event = new Event('test');
    expect(event.isTrusted).toEqual(false);
  });

  test('.timeStamp', () => {
    const event = new Event('test');
    expect(event.timeStamp).toEqual(expect.any(Number));
  });

  test('.initEvent()', () => {
    const event = new Event('test');
    expect(event.type).toEqual('test');
    expect(event.bubbles).toEqual(false);
    expect(event.cancelable).toEqual(false);

    event.initEvent('prod', true, true);
    expect(event.type).toEqual('prod');
    expect(event.bubbles).toEqual(true);
    expect(event.cancelable).toEqual(true);
  });
});
