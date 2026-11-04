// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { useDragReorder } from './useDragReorder';

const ROWS = ['a', 'b', 'c'];

function TestList(props: { readonly onReorder: (from: number, to: number) => void }): JSX.Element {
  const drag = useDragReorder(props.onReorder);
  return (
    <ul data-testid="list" data-dragging={drag.dragIndex ?? ''} data-over={drag.overIndex ?? ''}>
      {ROWS.map((row, index) => (
        <li key={row} data-testid={`row-${row}`} onPointerMove={() => drag.hover(index)}>
          <span data-testid={`grip-${row}`} onPointerDown={(e) => drag.startDrag(e, index)} />
        </li>
      ))}
    </ul>
  );
}

function setup(): { onReorder: ReturnType<typeof vi.fn>; unmount: () => void } {
  const onReorder = vi.fn();
  const { unmount } = render(<TestList onReorder={onReorder} />);
  return { onReorder, unmount };
}

describe('useDragReorder', () => {
  test('Tracks the dragged and hovered rows and reports the drop', async () => {
    const { onReorder } = setup();
    const list = screen.getByTestId('list');

    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('grip-c'));
    });
    expect(list).toHaveAttribute('data-dragging', '2');

    await act(async () => {
      fireEvent.pointerMove(screen.getByTestId('row-a'));
    });
    expect(list).toHaveAttribute('data-over', '0');

    await act(async () => {
      fireEvent.pointerUp(screen.getByTestId('row-a'));
    });
    expect(onReorder).toHaveBeenCalledWith(2, 0);
    expect(list).toHaveAttribute('data-dragging', '');
    expect(list).toHaveAttribute('data-over', '');
  });

  test('Hovering without a drag and dropping in place do nothing', async () => {
    const { onReorder } = setup();
    const list = screen.getByTestId('list');

    await act(async () => {
      fireEvent.pointerMove(screen.getByTestId('row-b'));
    });
    expect(list).toHaveAttribute('data-over', '');

    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('grip-b'));
      fireEvent.pointerUp(screen.getByTestId('row-b'));
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  test('A cancelled drag clears the state without reporting', async () => {
    const { onReorder } = setup();
    const list = screen.getByTestId('list');

    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('grip-c'));
      fireEvent.pointerMove(screen.getByTestId('row-a'));
      fireEvent(document, new Event('pointercancel'));
    });
    expect(list).toHaveAttribute('data-dragging', '');

    await act(async () => {
      fireEvent.pointerUp(screen.getByTestId('row-a'));
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  test('Unmounting mid-drag removes the document listeners', async () => {
    const { onReorder, unmount } = setup();
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('grip-a'));
      fireEvent.pointerMove(screen.getByTestId('row-c'));
    });

    const removeSpy = vi.spyOn(document, 'removeEventListener');
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    fireEvent(document, new Event('pointerup'));
    expect(onReorder).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });

  test('Uses the latest callback when it changes during a drag', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<TestList onReorder={first} />);

    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId('grip-a'));
      fireEvent.pointerMove(screen.getByTestId('row-b'));
    });
    rerender(<TestList onReorder={second} />);
    await act(async () => {
      fireEvent.pointerUp(screen.getByTestId('row-b'));
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(0, 1);
  });
});
