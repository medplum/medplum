// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { act, fireEvent, render, screen } from '../test-utils/render';
import { ScannedImage } from './ScannedImage';

describe('ScannedImage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('retries after an image load error', () => {
    render(<ScannedImage alt="Scanned document" src="https://example.com/image.jpg" />);

    fireEvent.error(screen.getByAltText('Scanned document'));

    expect(document.querySelector('.mantine-Loader-root')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByAltText('Scanned document')).toBeInTheDocument();
  });

  test('shows a placeholder after the final retry fails', () => {
    render(<ScannedImage alt="Scanned document" src="https://example.com/image.jpg" maxRetries={1} />);

    fireEvent.error(screen.getByAltText('Scanned document'));

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    fireEvent.error(screen.getByAltText('Scanned document'));

    expect(screen.getByText('Image unavailable')).toBeInTheDocument();
  });

  test('clears the retry timer on unmount', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const { unmount } = render(<ScannedImage alt="Scanned document" src="https://example.com/image.jpg" />);

    fireEvent.error(screen.getByAltText('Scanned document'));
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
