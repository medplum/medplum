import { IndexedStructureDefinition } from '@medplum/core';
import { Address, Annotation, Attachment, CodeableConcept, ContactPoint, HumanName, Identifier, Quantity } from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

const schema = {} as IndexedStructureDefinition;

describe('ResourcePropertyDisplay', () => {

  test('Renders null value', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'string' }] }}
        value=""
      />
    );
  });

  test('Renders boolean', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'boolean' }] }}
        value={true}
      />
    );
    expect(screen.getByText('true')).toBeDefined();
  });

  test('Renders string', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'string' }] }}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeDefined();
  });

  test('Renders canonical', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'canonical' }] }}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeDefined();
  });

  test('Renders url', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'url' }] }}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeDefined();
  });

  test('Renders uri', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'uri' }] }}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeDefined();
  });

  test('Renders string array', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'string' }], max: '*' }}
        value={['hello', 'world']}
      />
    );
    expect(screen.getByText('hello')).toBeDefined();
    expect(screen.getByText('world')).toBeDefined();
  });

  test('Renders markdown', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'markdown' }] }}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeDefined();
  });

  test('Renders Address', () => {
    const value: Address = {
      city: 'London'
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Address' }] }}
        value={value}
      />
    );

    expect(screen.getByText('London')).toBeDefined();
  });

  test('Renders Annotation', () => {
    const value: Annotation = {
      text: 'hello'
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Annotation' }] }}
        value={value}
      />
    );

    expect(screen.getByText('hello')).toBeDefined();
  });

  test('Renders Attachment', () => {
    const value: Attachment = {
      contentType: 'text/plain',
      url: 'https://example.com/file.txt',
      title: 'file.txt'
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Attachment' }] }}
        value={value}
      />
    );

    expect(screen.getByText('file.txt')).toBeDefined();
  });

  test('Renders Attachment array', () => {
    const value: Attachment[] = [
      {
        contentType: 'text/plain',
        url: 'https://example.com/file.txt',
        title: 'file.txt'
      },
      {
        contentType: 'text/plain',
        url: 'https://example.com/file2.txt',
        title: 'file2.txt'
      }
    ];

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Attachment' }], max: '*' }}
        value={value}
      />
    );

    expect(screen.getByText('file.txt')).toBeDefined();
    expect(screen.getByText('file2.txt')).toBeDefined();
  });

  test('Renders CodeableConcept', () => {
    const value: CodeableConcept = {
      text: 'foo'
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'CodeableConcept' }] }}
        value={value}
      />
    );

    expect(screen.getByText('foo')).toBeDefined();
  });

  test('Renders ContactPoint', () => {
    const value: ContactPoint = {
      system: 'email',
      value: 'foo@example.com'
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'ContactPoint' }] }}
        value={value}
      />
    );

    expect(screen.getByText('foo@example.com [email]')).toBeDefined();
  });

  test('Renders HumanName', () => {
    const value: HumanName = {
      family: 'Smith'
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'HumanName' }] }}
        value={value}
      />
    );

    expect(screen.getByText('Smith')).toBeDefined();
  });

  test('Renders Identifier', () => {
    const value: Identifier = {
      system: 'xyz',
      value: 'xyz123'
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Identifier' }] }}
        value={value}
      />
    );

    expect(screen.getByText('xyz: xyz123')).toBeDefined();
  });

  test('Renders Quantity', () => {
    const value: Quantity = {
      value: 1,
      unit: 'mg'
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Quantity' }] }}
        value={value}
      />
    );

    expect(screen.getByText('1 mg')).toBeDefined();
  });

});
