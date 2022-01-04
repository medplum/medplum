import { render, screen } from '@testing-library/react';
import React from 'react';
import { DateTimeDisplay } from './DateTimeDisplay';

describe('DateTimeDisplay', () => {
  test('Handles undefined value', () => {
    render(<DateTimeDisplay />);
  });

  test('Handles malformed value', () => {
    render(<DateTimeDisplay value="xyz" />);
  });

  test('Renders dateTime', () => {
    render(<DateTimeDisplay value="2021-06-01T12:00:00Z" />);
    expect(screen.getByText('2021', { exact: false })).toBeInTheDocument();
  });
});
