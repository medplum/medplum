import { render, screen } from '@testing-library/react';
import React from 'react';
import { CodeableConceptDisplay } from './CodeableConceptDisplay';

describe('CodeableConceptDisplay', () => {
  test('Handles undefined value', () => {
    render(<CodeableConceptDisplay />);
  });

  test('Handles empty value', () => {
    render(<CodeableConceptDisplay value={{}} />);
  });

  test('Renders text', () => {
    render(<CodeableConceptDisplay value={{ text: 'foo' }} />);
    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  test('Renders single code', () => {
    render(<CodeableConceptDisplay value={{ coding: [{ code: 'foo' }] }} />);
    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  test('Renders multiple code', () => {
    render(<CodeableConceptDisplay value={{ coding: [{ code: 'foo' }, { code: 'bar' }] }} />);
    expect(screen.getByText('foo, bar')).toBeInTheDocument();
  });
});
