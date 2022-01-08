import { render, screen } from '@testing-library/react';
import React from 'react';
import { Scrollable } from './Scrollable';

describe('Scrollable', () => {
  test('Renders', () => {
    render(<Scrollable>test</Scrollable>);
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('test').style.height).toBe('100%');
  });

  test('Renders with height', () => {
    render(<Scrollable height={50}>test2</Scrollable>);
    expect(screen.getByText('test2')).toBeInTheDocument();
    expect(screen.getByText('test2').style.height).toBe('75px'); // Account for scrollbars
    expect(screen.getByText('test2').parentElement?.style?.height).toBe('50px');
  });

  test('Renders with className', () => {
    render(<Scrollable className="my-class">test3</Scrollable>);
    expect(screen.getByText('test3')).toBeInTheDocument();
    expect(screen.getByText('test3')).toHaveClass('my-class');
  });
});
