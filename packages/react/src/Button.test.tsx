import { render, screen } from '@testing-library/react';
import React from 'react';
import { Button } from './Button';

describe('Button', () => {
  test('Renders', () => {
    render(<Button>test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('medplum-button');
  });

  test('Primary', () => {
    render(<Button primary={true}>test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('medplum-button medplum-button-primary');
  });

  test('Submit', () => {
    render(<Button type="submit">test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('medplum-button medplum-button-primary');
  });

  test('Danger', () => {
    render(<Button danger={true}>test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('medplum-button medplum-button-danger');
  });

  test('Borderless', () => {
    render(<Button borderless={true}>test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('medplum-button medplum-button-borderless');
  });

  test('Small', () => {
    render(<Button size="small">test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('medplum-button medplum-button-small');
  });

  test('Large', () => {
    render(<Button size="large">test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('medplum-button medplum-button-large');
  });
});
