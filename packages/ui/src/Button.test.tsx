import { render, screen } from '@testing-library/react';
import React from 'react';
import { Button } from './Button';

describe('Button', () => {
  test('Renders', () => {
    render(<Button>test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('btn');
  });

  test('Primary', () => {
    render(<Button primary={true}>test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('btn btn-primary');
  });

  test('Submit', () => {
    render(<Button type="submit">test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('btn btn-primary');
  });

  test('Danger', () => {
    render(<Button danger={true}>test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('btn btn-danger');
  });

  test('Borderless', () => {
    render(<Button borderless={true}>test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('btn btn-borderless');
  });

  test('Small', () => {
    render(<Button size="small">test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('btn btn-small');
  });

  test('Large', () => {
    render(<Button size="large">test</Button>);
    expect(screen.getByText('test')).toBeDefined();
    expect(screen.getByText('test').className).toEqual('btn btn-large');
  });
});
