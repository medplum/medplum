import { Event } from './event';

describe('Event', () => {
  test('Constructor', () => {
    const event = new Event('test');
    expect(event).toBeInstanceOf(globalThis.Event);
    expect(event.type).toStrictEqual('test');
  });

  test('Event phase enums', () => {
    expect(Event.NONE).toStrictEqual(0);
    expect(Event.CAPTURING_PHASE).toStrictEqual(1);
    expect(Event.AT_TARGET).toStrictEqual(2);
    expect(Event.BUBBLING_PHASE).toStrictEqual(3);

    const event = new Event('test');
    expect(event.NONE).toStrictEqual(0);
    expect(event.CAPTURING_PHASE).toStrictEqual(1);
    expect(event.AT_TARGET).toStrictEqual(2);
    expect(event.BUBBLING_PHASE).toStrictEqual(3);
  });

  test('Event phase', () => {
    const event = new Event('test');
    expect(event.eventPhase).toStrictEqual(0);
  });

  test('Target', () => {
    const event = new Event('test');
    expect(event.currentTarget).toStrictEqual(null);
    expect(event.target).toStrictEqual(null);
    expect(event.srcElement).toStrictEqual(null);
    expect(event.composedPath()).toStrictEqual([]);
  });

  test('.bubbles', () => {
    const event1 = new Event('test');
    expect(event1.bubbles).toStrictEqual(false);
    const event2 = new Event('test', { bubbles: true });
    expect(event2.bubbles).toStrictEqual(true);
    const event3 = new Event('test', { bubbles: false });
    expect(event3.bubbles).toStrictEqual(false);
  });

  test('.cancelable', () => {
    const event1 = new Event('test');
    expect(event1.cancelable).toStrictEqual(false);
    const event2 = new Event('test', { cancelable: true });
    expect(event2.cancelable).toStrictEqual(true);
    const event3 = new Event('test', { cancelable: false });
    expect(event3.cancelable).toStrictEqual(false);
  });

  test('.stopPropagation', () => {
    const event = new Event('test');
    expect(event.cancelBubble).toStrictEqual(false);
    event.stopPropagation();
    expect(event.cancelBubble).toStrictEqual(true);
  });

  test('.stopImmediatePropagation', () => {
    const event = new Event('test');
    expect(event.cancelBubble).toStrictEqual(false);
    event.stopImmediatePropagation();
    expect(event.cancelBubble).toStrictEqual(true);
  });

  test('.cancelBubble', () => {
    const event = new Event('test');
    expect(event.cancelBubble).toStrictEqual(false);
    event.cancelBubble = true;
    expect(event.cancelBubble).toStrictEqual(true);
  });

  test('.returnValue', () => {
    const event = new Event('test', { cancelable: true });
    expect(event.returnValue).toStrictEqual(true);
    expect(event.defaultPrevented).toStrictEqual(false);
    event.returnValue = false;
    expect(event.returnValue).toStrictEqual(false);
    expect(event.defaultPrevented).toStrictEqual(true);
  });

  test('.preventDefault()', () => {
    const event = new Event('test', { cancelable: true });
    expect(event.defaultPrevented).toStrictEqual(false);
    expect(event.returnValue).toStrictEqual(true);
    event.preventDefault();
    expect(event.defaultPrevented).toStrictEqual(true);
    expect(event.returnValue).toStrictEqual(false);
  });

  test('.isTrusted', () => {
    const event = new Event('test');
    expect(event.isTrusted).toStrictEqual(false);
  });

  test('.timeStamp', () => {
    const event = new Event('test');
    expect(event.timeStamp).toStrictEqual(expect.any(Number));
  });

  test('.initEvent()', () => {
    const event = new Event('test');
    expect(event.type).toStrictEqual('test');
    expect(event.bubbles).toStrictEqual(false);
    expect(event.cancelable).toStrictEqual(false);

    event.initEvent('prod', true, true);
    expect(event.type).toStrictEqual('prod');
    expect(event.bubbles).toStrictEqual(true);
    expect(event.cancelable).toStrictEqual(true);
  });
});
