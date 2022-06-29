import { render, screen } from '@testing-library/react';
import React from 'react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  test('Renders', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toBeDefined();
    expect(screen.getByText('active').className).toEqual('medplum-status medplum-status-active');
  });
});
