import { render, screen } from '@testing-library/react';
import React from 'react';
import { Logo } from './Logo';

describe('Logo', () => {
  test('Renders', () => {
    render(<Logo size={100} />);
    expect(screen.getByTitle('Medplum Logo')).toBeDefined();
  });
});
