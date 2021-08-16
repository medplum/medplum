import { Address, CodeableConcept, ContactPoint, HumanName, Identifier } from '@medplum/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

describe('ResourcePropertyDisplay', () => {

  test('Renders null value', () => {
    render(<ResourcePropertyDisplay property={{ type: [{ code: 'string' }] }} value="" />);
  });

  test('Renders string', () => {
    render(<ResourcePropertyDisplay property={{ type: [{ code: 'string' }] }} value="hello" />);
    expect(screen.getByText('hello')).not.toBeUndefined();
  });

  test('Renders canonical', () => {
    render(<ResourcePropertyDisplay property={{ type: [{ code: 'canonical' }] }} value="hello" />);
    expect(screen.getByText('hello')).not.toBeUndefined();
  });

  test('Renders url', () => {
    render(<ResourcePropertyDisplay property={{ type: [{ code: 'url' }] }} value="https://example.com" />);
    expect(screen.getByText('https://example.com')).not.toBeUndefined();
  });

  test('Renders uri', () => {
    render(<ResourcePropertyDisplay property={{ type: [{ code: 'uri' }] }} value="https://example.com" />);
    expect(screen.getByText('https://example.com')).not.toBeUndefined();
  });

  test('Renders string array', () => {
    render(<ResourcePropertyDisplay property={{ type: [{ code: 'string' }], max: '*' }} value={['hello', 'world']} />);
    expect(screen.getByText('hello')).not.toBeUndefined();
    expect(screen.getByText('world')).not.toBeUndefined();
  });

  test('Renders Address', () => {
    const value: Address = {
      city: 'London'
    };

    render(<ResourcePropertyDisplay
      property={{ type: [{ code: 'Address' }] }}
      value={value}
    />);

    expect(screen.getByText('London')).not.toBeUndefined();
  });

  test('Renders CodeableConcept', () => {
    const value: CodeableConcept = {
      text: 'foo'
    };

    render(<ResourcePropertyDisplay
      property={{ type: [{ code: 'CodeableConcept' }] }}
      value={value}
    />);

    expect(screen.getByText(JSON.stringify(value))).not.toBeUndefined();
  });

  test('Renders ContactPoint', () => {
    const value: ContactPoint = {
      system: 'email',
      value: 'foo@example.com'
    };

    render(<ResourcePropertyDisplay
      property={{ type: [{ code: 'ContactPoint' }] }}
      value={value}
    />);

    expect(screen.getByText('foo@example.com [email]')).not.toBeUndefined();
  });

  test('Renders HumanName', () => {
    const value: HumanName = {
      family: 'Smith'
    };

    render(<ResourcePropertyDisplay
      property={{ type: [{ code: 'HumanName' }] }}
      value={value}
    />);

    expect(screen.getByText('Smith')).not.toBeUndefined();
  });

  test('Renders Identifier', () => {
    const value: Identifier = {
      value: 'xyz123'
    };

    render(<ResourcePropertyDisplay
      property={{ type: [{ code: 'Identifier' }] }}
      value={value}
    />);

    expect(screen.getByText('xyz123')).not.toBeUndefined();
  });

});
