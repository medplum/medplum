import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  test('Hidden', () => {
    render(<Dialog visible={false} title="x" onOk={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Dialog')).toBeNull();
  });

  test('Renders', () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();

    render(
      <Dialog visible={true} title="title" onOk={onOk} onCancel={onCancel}>
        test
      </Dialog>
    );

    expect(screen.getByText('title')).toBeDefined();
    expect(screen.getByText('test')).toBeDefined();
  });

  test('Click OK', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();

    render(
      <Dialog visible={true} title="title" onOk={onOk} onCancel={onCancel}>
        test
      </Dialog>
    );

    await act(async () => {
      await fireEvent.click(screen.getByText('OK'));
    });

    expect(onOk).toBeCalled();
    expect(onCancel).not.toBeCalled();
  });

  test('Click Cancel', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();

    render(
      <Dialog visible={true} title="title" onOk={onOk} onCancel={onCancel}>
        test
      </Dialog>
    );

    await act(async () => {
      await fireEvent.click(screen.getByText('Cancel'));
    });

    expect(onOk).not.toBeCalled();
    expect(onCancel).toBeCalled();
  });

  test('Drag to move', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();

    render(
      <Dialog visible={true} title="title" onOk={onOk} onCancel={onCancel}>
        test
      </Dialog>
    );

    await act(async () => {
      await fireEvent.mouseDown(screen.getByText('title'), {
        clientX: 120,
        clientY: 120,
      });
    });

    await act(async () => {
      // Move 30 pixels to the right
      await fireEvent.mouseMove(document, { clientX: 150, clientY: 120 });
    });

    await act(async () => {
      await fireEvent.mouseUp(document);
    });

    const style = window.getComputedStyle(screen.getByTestId('dialog'));
    expect(style.left).toEqual('130px');
    expect(style.top).toEqual('100px');
  });
});
