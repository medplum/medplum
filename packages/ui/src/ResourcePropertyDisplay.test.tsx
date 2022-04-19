import { IndexedStructureDefinition, PropertyType } from '@medplum/core';
import {
  Address,
  Annotation,
  Attachment,
  CodeableConcept,
  Coding,
  ContactPoint,
  ElementDefinition,
  HumanName,
  Identifier,
  Period,
  Quantity,
  Range,
  Ratio,
  Reference,
  SubscriptionChannel,
} from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { getValueAndType, ResourcePropertyDisplay } from './ResourcePropertyDisplay';

const schema: IndexedStructureDefinition = {
  types: {
    Subscription: {
      display: 'Subscription',
      properties: {
        channel: {
          path: 'Subscription.channel',
          min: 1,
          max: '1',
          type: [
            {
              code: 'BackboneElement',
            },
          ],
        },
      },
    },
    SubscriptionChannel: {
      display: 'SubscriptionChannel',
      parentType: 'Subscription',
      properties: {
        type: {
          path: 'Subscription.channel.type',
          min: 1,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        endpoint: {
          path: 'Subscription.channel.endpoint',
          min: 0,
          max: '1',
          type: [
            {
              code: 'url',
            },
          ],
        },
        payload: {
          path: 'Subscription.channel.payload',
          min: 0,
          max: '1',
          type: [
            {
              code: 'code',
            },
          ],
        },
        header: {
          path: 'Subscription.channel.header',
          min: 0,
          max: '*',
          type: [
            {
              code: 'string',
            },
          ],
        },
      },
    },
  },
};

describe('ResourcePropertyDisplay', () => {
  test('Renders null value', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'string' }] }}
        propertyType={PropertyType.string}
        value={null}
      />
    );
  });

  test('Renders boolean true', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={true}
      />
    );
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.queryByText('false')).toBeNull();
  });

  test('Renders boolean false', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={false}
      />
    );
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.queryByText('true')).toBeNull();
  });

  test('Renders boolean undefined', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={undefined}
      />
    );
    expect(screen.queryByText('true')).toBeNull();
    expect(screen.queryByText('false')).toBeNull();
  });

  test('Renders string', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'string' }] }}
        propertyType={PropertyType.string}
        value={'hello'}
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('Renders canonical', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'canonical' }] }}
        propertyType={PropertyType.canonical}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('Renders url', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'url' }] }}
        propertyType={PropertyType.url}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  test('Renders uri', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'uri' }] }}
        propertyType={PropertyType.uri}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  test('Renders string array', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'string' }], max: '*' }}
        propertyType={PropertyType.string}
        value={['hello', 'world']}
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  test('Renders markdown', () => {
    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'markdown' }] }}
        propertyType={PropertyType.markdown}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('Renders Address', () => {
    const value: Address = {
      city: 'London',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Address' }] }}
        propertyType={PropertyType.Address}
        value={value}
      />
    );

    expect(screen.getByText('London')).toBeInTheDocument();
  });

  test('Renders Annotation', () => {
    const value: Annotation = {
      text: 'hello',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Annotation' }] }}
        propertyType={PropertyType.Annotation}
        value={value}
      />
    );

    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('Renders Attachment', () => {
    const value: Attachment = {
      contentType: 'text/plain',
      url: 'https://example.com/file.txt',
      title: 'file.txt',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Attachment' }] }}
        propertyType={PropertyType.Attachment}
        value={value}
      />
    );

    expect(screen.getByText('file.txt')).toBeInTheDocument();
  });

  test('Renders Attachment array', () => {
    const value: Attachment[] = [
      {
        contentType: 'text/plain',
        url: 'https://example.com/file.txt',
        title: 'file.txt',
      },
      {
        contentType: 'text/plain',
        url: 'https://example.com/file2.txt',
        title: 'file2.txt',
      },
    ];

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Attachment' }], max: '*' }}
        propertyType={PropertyType.Attachment}
        value={value}
      />
    );
    expect(screen.getByText('file.txt')).toBeInTheDocument();
    expect(screen.getByText('file2.txt')).toBeInTheDocument();
  });

  test('Renders CodeableConcept', () => {
    const value: CodeableConcept = {
      text: 'foo',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'CodeableConcept' }] }}
        propertyType={PropertyType.CodeableConcept}
        value={value}
      />
    );

    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  test('Renders Coding', () => {
    const value: Coding = {
      display: 'Test Coding',
      code: 'test-coding',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Coding' }] }}
        propertyType={PropertyType.Coding}
        value={value}
      />
    );

    expect(screen.getByText('Test Coding')).toBeInTheDocument();
  });

  test('Renders ContactPoint', () => {
    const value: ContactPoint = {
      system: 'email',
      value: 'foo@example.com',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'ContactPoint' }] }}
        propertyType={PropertyType.ContactPoint}
        value={value}
      />
    );

    expect(screen.getByText('foo@example.com [email]')).toBeInTheDocument();
  });

  test('Renders HumanName', () => {
    const value: HumanName = {
      family: 'Smith',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'HumanName' }] }}
        propertyType={PropertyType.HumanName}
        value={value}
      />
    );

    expect(screen.getByText('Smith')).toBeInTheDocument();
  });

  test('Renders Identifier', () => {
    const value: Identifier = {
      system: 'xyz',
      value: 'xyz123',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Identifier' }] }}
        propertyType={PropertyType.Identifier}
        value={value}
      />
    );

    expect(screen.getByText('xyz: xyz123')).toBeInTheDocument();
  });

  test('Renders Period', () => {
    const value: Period = {
      start: '2021-06-01T12:00:00Z',
      end: '2021-06-30T12:00:00Z',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Period' }] }}
        propertyType={PropertyType.Period}
        value={value}
      />
    );

    expect(screen.getByText('2021', { exact: false })).toBeInTheDocument();
  });

  test('Renders Quantity', () => {
    const value: Quantity = {
      value: 1,
      unit: 'mg',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Quantity' }] }}
        propertyType={PropertyType.Quantity}
        value={value}
      />
    );

    expect(screen.getByText('1 mg')).toBeInTheDocument();
  });

  test('Renders Range', () => {
    const value: Range = {
      low: { value: 5, unit: 'mg' },
      high: { value: 10, unit: 'mg' },
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Range' }] }}
        propertyType={PropertyType.Range}
        value={value}
      />
    );

    expect(screen.getByText('5 mg - 10 mg')).toBeInTheDocument();
  });

  test('Renders Ratio', () => {
    const value: Ratio = {
      numerator: { value: 5, unit: 'mg' },
      denominator: { value: 10, unit: 'ml' },
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ type: [{ code: 'Ratio' }] }}
        propertyType={PropertyType.Ratio}
        value={value}
      />
    );

    expect(screen.getByText('5 mg / 10 ml')).toBeInTheDocument();
  });

  test('Renders Reference', () => {
    const value: Reference = {
      reference: 'Patient/123',
      display: 'John Smith',
    };

    render(
      <MemoryRouter>
        <ResourcePropertyDisplay
          schema={schema}
          property={{ type: [{ code: 'Reference' }] }}
          propertyType={PropertyType.Reference}
          value={value}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(value.display as string)).toBeInTheDocument();
  });

  test('Renders BackboneElement', () => {
    const value: SubscriptionChannel = {
      type: 'rest-hook',
      endpoint: 'https://example.com/hook',
    };

    render(
      <ResourcePropertyDisplay
        schema={schema}
        property={{ path: 'Subscription.channel', type: [{ code: 'BackboneElement' }] }}
        propertyType={PropertyType.BackboneElement}
        value={value}
      />
    );

    expect(screen.getByText(value.endpoint as string)).toBeInTheDocument();
  });

  test('getValueAndType', () => {
    expect(getValueAndType(null, {} as ElementDefinition)[0]).toBeUndefined();
    expect(getValueAndType({}, {} as ElementDefinition)[0]).toBeUndefined();
    expect(getValueAndType({}, { path: '' } as ElementDefinition)[0]).toBeUndefined();
    expect(getValueAndType({}, { path: 'x' } as ElementDefinition)[0]).toBeUndefined();
    expect(getValueAndType({}, { path: 'x', type: [] } as ElementDefinition)[0]).toBeUndefined();
    expect(
      getValueAndType({}, { path: 'x', type: [{ code: 'foo' }, { code: 'bar' }] } as ElementDefinition)[0]
    ).toBeUndefined();
  });
});
