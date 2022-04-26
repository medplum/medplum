import { MedplumClient } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { MedplumProvider } from './MedplumProvider';
import { Popup } from './Popup';

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: async () => undefined,
});

function setup(children: React.ReactNode): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    </MemoryRouter>
  );
}

describe('Popup', () => {
  test('Hidden', () => {
    setup(
      <Popup visible={false} onClose={vi.fn()}>
        test
      </Popup>
    );
    expect(screen.getByTestId('popup').style.display).toEqual('none');
  });

  test('Visible', () => {
    setup(
      <Popup visible={true} onClose={vi.fn()}>
        test
      </Popup>
    );
    expect(screen.getByTestId('popup').style.display).toEqual('block');
  });

  test('Auto close on click outside of popup', async () => {
    const onClose = vi.fn();
    setup(
      <Popup visible={true} autoClose={true} onClose={onClose}>
        test
      </Popup>
    );

    await act(async () => {
      fireEvent.click(document.body);
    });

    expect(onClose).toHaveBeenCalled();
  });

  test('Disabled auto close', async () => {
    const onClose = vi.fn();
    setup(
      <Popup visible={true} autoClose={false} onClose={onClose}>
        test
      </Popup>
    );

    await act(async () => {
      fireEvent.click(document.body);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  test('Anchor happy path', () => {
    // window.innerWidth and window.innerHeight include scrollbars
    window.innerWidth = 1650;
    window.innerHeight = 950;

    // document.body.clientWidth and document.body.clientHeight do not include scrollbars
    Object.defineProperty(document.body, 'clientWidth', { value: 1600 });
    Object.defineProperty(document.body, 'clientHeight', { value: 900 });

    const anchor = { left: 10, right: 20, top: 10, bottom: 20 } as DOMRectReadOnly;

    setup(
      <Popup visible={true} anchor={anchor} onClose={vi.fn()}>
        test
      </Popup>
    );

    const popup = screen.getByTestId('popup');
    expect(popup.style.display).toEqual('block');
    expect(popup.style.left).toEqual('20px');
    expect(popup.style.top).toEqual('10px');
  });

  test('Anchor flip horizontal', () => {
    // window.innerWidth and window.innerHeight include scrollbars
    window.innerWidth = 1650;
    window.innerHeight = 950;

    // document.body.clientWidth and document.body.clientHeight do not include scrollbars
    Object.defineProperty(document.body, 'clientWidth', { value: 1600 });
    Object.defineProperty(document.body, 'clientHeight', { value: 900 });

    const anchor = { left: 1400, right: 1500, top: 10, bottom: 20 } as DOMRectReadOnly;

    setup(
      <Popup visible={true} anchor={anchor} onClose={vi.fn()}>
        test
      </Popup>
    );

    const popup = screen.getByTestId('popup');
    expect(popup.style.display).toEqual('block');
    expect(popup.style.right).toEqual('200px');
    expect(popup.style.top).toEqual('10px');
  });

  test('Anchor flip vertical', () => {
    window.innerWidth = 1600;
    window.innerHeight = 900;

    const anchor = { left: 10, right: 20, top: 800, bottom: 900 } as DOMRectReadOnly;

    setup(
      <Popup visible={true} anchor={anchor} onClose={vi.fn()}>
        test
      </Popup>
    );

    const popup = screen.getByTestId('popup');
    expect(popup.style.display).toEqual('block');
    expect(popup.style.left).toEqual('20px');
    expect(popup.style.bottom).toEqual('100px');
  });
});
