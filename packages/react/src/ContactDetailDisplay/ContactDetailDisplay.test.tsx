import { render, screen } from '@testing-library/react';
import React from 'react';
import { ContactDetailDisplay } from './ContactDetailDisplay';

describe('ContactDetailDisplay', () => {
  test('Handles undefined value', () => {
    render(<ContactDetailDisplay />);
  });

  test('Handles empty value', () => {
    render(<ContactDetailDisplay value={{}} />);
  });

  test('Renders named value', () => {
    render(<ContactDetailDisplay value={{ name: 'Foo', telecom: [{ value: 'homer@example.com' }] }} />);
    expect(screen.getByText('Foo: homer@example.com', { exact: false })).toBeInTheDocument();
  });
});
