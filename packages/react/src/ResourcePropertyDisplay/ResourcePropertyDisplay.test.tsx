import { InternalSchemaElement, PropertyType } from '@medplum/core';
import {
  Address,
  Annotation,
  Attachment,
  CodeableConcept,
  Coding,
  ContactPoint,
  HumanName,
  Identifier,
  Period,
  Quantity,
  Range,
  Ratio,
  Reference,
  SubscriptionChannel,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';

const medplum = new MockClient();

const baseProperty: Omit<InternalSchemaElement, 'type'> = {
  min: 0,
  max: 1,
  description: '',
  isArray: false,
  constraints: [],
  path: '',
};
describe('ResourcePropertyDisplay', () => {
  function setup(children: ReactNode): void {
    render(<MedplumProvider medplum={medplum}>{children}</MedplumProvider>);
  }

  test('Renders null value', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'string' }] }}
        propertyType={PropertyType.string}
        value={null}
      />
    );
  });

  test('Renders boolean true', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={true}
      />
    );
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.queryByText('false')).toBeNull();
  });

  test('Renders boolean false', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={false}
      />
    );
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.queryByText('true')).toBeNull();
  });

  test('Renders boolean undefined', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={undefined}
      />
    );
    expect(screen.queryByText('true')).toBeNull();
    expect(screen.queryByText('false')).toBeNull();
  });

  test('Renders string', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'string' }] }}
        propertyType={PropertyType.string}
        value={'hello'}
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('Renders string with newline', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'string' }] }}
        propertyType={PropertyType.string}
        value={'hello\nworld'}
      />
    );
    const textElement = screen.getByText('hello world');
    const lines = textElement.textContent?.split('\n');
    const numberOfLines = lines?.length || 0;
    expect(numberOfLines).toBe(2);
    expect(numberOfLines).not.toBe(1);
  });

  test('Renders canonical', () => {
    setup(
      <MemoryRouter>
        <ResourcePropertyDisplay propertyType={PropertyType.canonical} value="Patient/123" />
      </MemoryRouter>
    );

    const el = screen.getByText('Patient/123');
    expect(el).toBeInTheDocument();
    expect(el).toBeInstanceOf(HTMLAnchorElement);
  });

  test('Renders url', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'url' }] }}
        propertyType={PropertyType.url}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  test('Renders uri', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'uri' }] }}
        propertyType={PropertyType.uri}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  test('Renders string array', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'string' }], max: Number.POSITIVE_INFINITY }}
        propertyType={PropertyType.string}
        value={['hello', 'world']}
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  test('Renders markdown', () => {
    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'markdown' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Address' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Annotation' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Attachment' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Attachment' }], max: Number.POSITIVE_INFINITY }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'CodeableConcept' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Coding' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'ContactPoint' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'HumanName' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Identifier' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Period' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Quantity' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Range' }] }}
        propertyType={PropertyType.Range}
        value={value}
      />
    );

    expect(screen.getByText('5 - 10 mg')).toBeInTheDocument();
  });

  test('Renders Ratio', () => {
    const value: Ratio = {
      numerator: { value: 5, unit: 'mg' },
      denominator: { value: 10, unit: 'ml' },
    };

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Ratio' }] }}
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

    setup(
      <MemoryRouter>
        <ResourcePropertyDisplay
          property={{ ...baseProperty, type: [{ code: 'Reference' }] }}
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

    setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, path: 'Subscription.channel', type: [{ code: 'SubscriptionChannel' }] }}
        propertyType={PropertyType.BackboneElement}
        value={value}
      />
    );

    expect(screen.getByText(value.endpoint as string)).toBeInTheDocument();
  });

  test('Handles unknown property', () => {
    console.error = jest.fn();
    expect(() =>
      setup(<ResourcePropertyDisplay propertyType={PropertyType.BackboneElement} value={{}} />)
    ).toThrowError(new Error('Displaying property of type BackboneElement requires element schema'));
    expect(console.error).toBeCalled();
  });
});
