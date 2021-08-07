import { MedplumClient, ValueSet } from '@medplum/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { SmartText, SmartTextProps } from './SmartText';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

const valueSetResults: ValueSet = {
  resourceType: 'ValueSet',
  expansion: {
    contains: [
      { code: '316791000119102', display: 'Pain in left knee' },
      { code: '316931000119104', display: 'Pain in right knee' },
      { code: '287045000', display: 'Pain in left arm' },
      { code: '287046004', display: 'Pain in right arm' }
    ]
  }
};

function mockFetch(url: string, options: any): Promise<any> {
  let result: any;

  if (url.endsWith('/fhir/R4/ValueSet/$expand?url=https%3A%2F%2Fsnomed.info%2Fsct&filter=pain')) {
    result = valueSetResults;
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

const setup = (args?: SmartTextProps) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <SmartText id="foo" {...args} />
    </MedplumProvider>
  );
};

describe('SmartText', () => {

  beforeAll(async () => {
    global.Range = MockRange as any;
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  test('Renders', () => {
    setup();
    expect(screen.getByTestId('smarttext')).not.toBeUndefined();
  });

  test('Renders default value', async () => {
    setup({
      id: 'foo',
      value: 'Hello world'
    });

    expect(screen.getByTestId('smarttext-editor')).not.toBeUndefined();
  });

  test('Dismiss with Escape key', async () => {
    setup();

    // Input some text to trigger the dropdown
    await act(async () => {
      setEditorContents(screen.getByTestId('smarttext-editor'), 'pain');
    });

    // Wait for the dropdown
    await waitFor(() => screen.getByTestId('smarttext-dropdown'));

    // Press "Escape" to dismiss the dropdown
    await act(async () => {
      forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code: 'Escape' });
    });

    expect(screen.queryByTestId('smarttext-dropdown')).toBeNull();
  });

  test('Select with Enter key', async () => {
    setup();

    document.execCommand = jest.fn();

    // Input some text to trigger the dropdown
    await act(async () => {
      setEditorContents(screen.getByTestId('smarttext-editor'), 'pain');
    });

    // Wait for the dropdown
    await waitFor(() => screen.getByTestId('smarttext-dropdown'));

    // Press "Enter" to select the first input
    await act(async () => {
      forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code: 'Enter' });
    });

    expect(document.execCommand).toBeCalledWith('insertHtml', false, '<span class="concept" data-id="316791000119102">Pain in left knee</span>&nbsp;');
  });

  test('Select with Tab key', async () => {
    setup();

    document.execCommand = jest.fn();

    // Input some text to trigger the dropdown
    await act(async () => {
      setEditorContents(screen.getByTestId('smarttext-editor'), 'pain');
    });

    // Wait for the dropdown
    await waitFor(() => screen.getByTestId('smarttext-dropdown'));

    // Press "Tab" to select the first input
    await act(async () => {
      forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code: 'Tab' });
    });

    expect(document.execCommand).toBeCalledWith('insertHtml', false, '<span class="concept" data-id="316791000119102">Pain in left knee</span>&nbsp;');
  });

  test('Move with ArrowDown key', async () => {
    setup();

    document.execCommand = jest.fn();

    // Input some text to trigger the dropdown
    await act(async () => {
      setEditorContents(screen.getByTestId('smarttext-editor'), 'pain');
    });

    // Wait for the dropdown
    await waitFor(() => screen.getByTestId('smarttext-dropdown'));

    // Press "ArrowDown" twice to move down
    // First time to the first option
    // Second time to the second option
    for (const code of ['ArrowDown', 'ArrowDown']) {
      await act(async () => {
        forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code });
      });
    }

    // Press "Enter" to select the first input
    await act(async () => {
      forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code: 'Enter' });
    });

    expect(document.execCommand).toBeCalledWith('insertHtml', false, '<span class="concept" data-id="316931000119104">Pain in right knee</span>&nbsp;');
  });

  test('Move with ArrowDown key', async () => {
    setup();

    document.execCommand = jest.fn();

    // Input some text to trigger the dropdown
    await act(async () => {
      setEditorContents(screen.getByTestId('smarttext-editor'), 'pain');
    });

    // Wait for the dropdown
    await waitFor(() => screen.getByTestId('smarttext-dropdown'));

    // Press arrow keys to move down down up.
    for (const code of ['ArrowDown', 'ArrowDown', 'ArrowUp']) {
      await act(async () => {
        forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code });
      });
    }

    // Press "Enter" to select the first input
    await act(async () => {
      forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code: 'Enter' });
    });

    expect(document.execCommand).toBeCalledWith('insertHtml', false, '<span class="concept" data-id="316791000119102">Pain in left knee</span>&nbsp;');
  });

  test('Next placeholder with Tab key', async () => {
    setup();

    document.execCommand = jest.fn();

    // Input some text
    // Set the cursor at the beginning of the line
    await act(async () => {
      setEditorContents(screen.getByTestId('smarttext-editor'), '[x] [y] [z]', 0);
    });

    // Press "Tab" to move to the next placeholder
    await act(async () => {
      forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code: 'Tab' });
    });

    const range = window.getSelection()?.getRangeAt(0);
    expect(range?.startOffset).toEqual(0);
    expect(range?.endOffset).toEqual(3);
  });

  test('Next placeholder with Tab key 2x', async () => {
    setup();

    document.execCommand = jest.fn();

    // Input some text
    // Set the cursor at the beginning of the line
    await act(async () => {
      setEditorContents(screen.getByTestId('smarttext-editor'), '[x] [y] [z]', 0);
    });

    // Press "Tab" to move to the next placeholder
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code: 'Tab' });
      });
    }

    const range = window.getSelection()?.getRangeAt(0);
    expect(range?.startOffset).toEqual(4);
    expect(range?.endOffset).toEqual(7);
  });

  test('Previous placeholder with shift-Tab', async () => {
    setup();

    document.execCommand = jest.fn();

    // Input some text
    // Set the cursor at the beginning of the line
    await act(async () => {
      setEditorContents(screen.getByTestId('smarttext-editor'), '[x] [y] [z]', 0);
    });

    // Press "Tab" to move to the next placeholder
    for (const shiftKey of [false, false, true]) {
      await act(async () => {
        forceFireEvent(screen.getByTestId('smarttext-editor'), 'onKeyDown', { code: 'Tab', shiftKey });
      });
    }

    const range = window.getSelection()?.getRangeAt(0);
    expect(range?.startOffset).toEqual(0);
    expect(range?.endOffset).toEqual(3);
  });

});

/**
 * The MockRange class is a simple mock for the Range class.
 * The JSDOM implementation does not play nicely with contenteditable.
 */
class MockRange {
  startContainer?: Node;
  startOffset?: number;
  endContainer?: Node;
  endOffset?: number;

  constructor() {
    // no-op
  }

  setStart(startContainer: Node, startOffset: number) {
    this.startContainer = startContainer;
    this.startOffset = startOffset;
  }

  setEnd(endContainer: Node, endOffset: number) {
    this.endContainer = endContainer;
    this.endOffset = endOffset;
  }

  getClientRects() {
    return [{ left: 100, bottom: 100 }];
  }
}

class MockSelection {
  ranges = [] as MockRange[];

  get rangeCount() {
    return this.ranges.length;
  }

  getRangeAt(index: number) {
    return this.ranges[index];
  }

  removeAllRanges(): void {
    this.ranges = [];
  }

  addRange(range: MockRange): void {
    this.ranges.push(range);
  }
}

/**
 * Sets the editor contents.
 * @param editor The editor element.
 * @param textContent The new text contents.
 * @param offset Optional cursor offset.  Default is end of the input text.
 * @param endOffset Optional end cursor offset if selecting a span.  Default is end of the input text.
 */
function setEditorContents(editor: any, textContent: string, offset?: number, endOffset?: number): void {
  editor.textContent = textContent;

  const range = new MockRange();
  range.setStart(editor, offset ?? textContent.length);
  range.setEnd(editor, endOffset ?? offset ?? textContent.length);

  const selection = new MockSelection();
  selection.addRange(range);

  window.getSelection = () => selection as any;

  forceFireEvent(editor, 'onInput', {});
}

/**
 * Fires an event handler.
 * This is to workaround lack of support for "contenteditable".
 * Testing Library: https://github.com/testing-library/dom-testing-library/pull/235
 * JSDOM: https://github.com/jsdom/jsdom/issues/1670
 * @param el The receiving element.
 * @param handler The event handler name.
 * @param event The event object to pass to the handler.
 */
function forceFireEvent(el: Element, handler: string, event: any): void {
  const fullEvent = {
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    ...event
  };
  const key = Object.keys(el).find(k => k.startsWith('__reactProps')) as string;
  (el as any)[key][handler](fullEvent);
}
