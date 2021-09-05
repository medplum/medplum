import { render, screen } from '@testing-library/react';
import React from 'react';
import { Loading } from './Loading';

describe('Loading', () => {

  test('Renders', () => {
    render(<Loading />);
    expect(screen.getByRole('progressbar')).not.toBeUndefined();
  });

});
