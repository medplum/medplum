import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ScrollToTop } from './ScrollToTop';

describe('ScrollToTop', () => {
  beforeEach(() => {
    window.scrollTo = jest.fn();
  });

  test('scrolls to top on route change', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/initial']}>
        <Routes>
          <Route path="*" element={<ScrollToTop />} />
        </Routes>
      </MemoryRouter>
    );

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    // Clear mock calls
    (window.scrollTo as jest.Mock).mockClear();

    // Simulate route change
    rerender(
      <MemoryRouter initialEntries={['/new-route']}>
        <Routes>
          <Route path="*" element={<ScrollToTop />} />
        </Routes>
      </MemoryRouter>
    );

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
