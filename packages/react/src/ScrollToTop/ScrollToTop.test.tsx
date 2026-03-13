// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render } from '../test-utils/render';
import { ScrollToTop } from './ScrollToTop';

describe('ScrollToTop', () => {
  beforeEach(() => {
    window.scrollTo = jest.fn();
  });

  test('scrolls to top on route change', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/initial']}>
        <Routes>
          <Route path="*" element={<ScrollToTop />} />
        </Routes>
        <Link to="/new-route">Navigate</Link>
      </MemoryRouter>
    );

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    // Clear mock calls
    (window.scrollTo as jest.Mock).mockClear();

    // Simulate navigation
    await act(() => fireEvent.click(container.querySelector('a') as HTMLAnchorElement));

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
