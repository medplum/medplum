import { render, screen } from '@testing-library/react';
import React from 'react';
import { TitleBar } from './TitleBar';

describe('TitleBar', () => {

  test('Renders', () => {
    render(<TitleBar>test</TitleBar>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('medplum-title-bar');
  });

});
