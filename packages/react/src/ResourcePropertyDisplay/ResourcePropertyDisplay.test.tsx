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
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '../test-utils/render';
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
  async function setup(children: ReactNode): Promise<void> {
    await act(async () => {
      render(<MedplumProvider medplum={medplum}>{children}</MedplumProvider>);
    });
  }

  test('Renders null value', async () => {
    await await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'string' }] }}
        propertyType={PropertyType.string}
        value={null}
      />
    );
  });

  test('Renders boolean true', async () => {
    await await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={true}
      />
    );
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.queryByText('false')).toBeNull();
  });

  test('Renders boolean false', async () => {
    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={false}
      />
    );
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.queryByText('true')).toBeNull();
  });

  test('Renders boolean undefined', async () => {
    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'boolean' }] }}
        propertyType={PropertyType.boolean}
        value={undefined}
      />
    );
    expect(screen.queryByText('true')).toBeNull();
    expect(screen.queryByText('false')).toBeNull();
  });

  test('Renders string', async () => {
    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'string' }] }}
        propertyType={PropertyType.string}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('Renders string with newline', async () => {
    await setup(
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

  test('Renders canonical', async () => {
    await setup(
      <MemoryRouter>
        <ResourcePropertyDisplay propertyType={PropertyType.canonical} value="Patient/123" />
      </MemoryRouter>
    );

    const el = screen.getByText('Patient/123');
    expect(el).toBeInTheDocument();
    expect(el).toBeInstanceOf(HTMLAnchorElement);
  });

  test('Renders url', async () => {
    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'url' }] }}
        propertyType={PropertyType.url}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  test('Renders uri', async () => {
    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'uri' }] }}
        propertyType={PropertyType.uri}
        value="https://example.com"
      />
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  test('Renders string array', async () => {
    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'string' }], max: Number.POSITIVE_INFINITY }}
        propertyType={PropertyType.string}
        value={['hello', 'world']}
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  test('Renders markdown', async () => {
    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'markdown' }] }}
        propertyType={PropertyType.markdown}
        value="hello"
      />
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('Renders Address', async () => {
    const value: Address = {
      city: 'London',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Address' }] }}
        propertyType={PropertyType.Address}
        value={value}
      />
    );

    expect(screen.getByText('London')).toBeInTheDocument();
  });

  test('Renders Annotation', async () => {
    const value: Annotation = {
      text: 'hello',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Annotation' }] }}
        propertyType={PropertyType.Annotation}
        value={value}
      />
    );

    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('Renders Attachment', async () => {
    const value: Attachment = {
      contentType: 'text/plain',
      url: 'https://example.com/file.txt',
      title: 'file.txt',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Attachment' }] }}
        propertyType={PropertyType.Attachment}
        value={value}
      />
    );

    expect(screen.getByText('file.txt')).toBeInTheDocument();
  });

  test('Renders Attachment array', async () => {
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

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Attachment' }], max: Number.POSITIVE_INFINITY }}
        propertyType={PropertyType.Attachment}
        value={value}
      />
    );
    expect(screen.getByText('file.txt')).toBeInTheDocument();
    expect(screen.getByText('file2.txt')).toBeInTheDocument();
  });

  test('Renders CodeableConcept', async () => {
    const value: CodeableConcept = {
      text: 'foo',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'CodeableConcept' }] }}
        propertyType={PropertyType.CodeableConcept}
        value={value}
      />
    );

    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  test('Renders Coding', async () => {
    const value: Coding = {
      display: 'Test Coding',
      code: 'test-coding',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Coding' }] }}
        propertyType={PropertyType.Coding}
        value={value}
      />
    );

    expect(screen.getByText('Test Coding')).toBeInTheDocument();
  });

  test('Renders ContactPoint', async () => {
    const value: ContactPoint = {
      system: 'email',
      value: 'foo@example.com',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'ContactPoint' }] }}
        propertyType={PropertyType.ContactPoint}
        value={value}
      />
    );

    expect(screen.getByText('foo@example.com [email]')).toBeInTheDocument();
  });

  test('Renders HumanName', async () => {
    const value: HumanName = {
      family: 'Smith',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'HumanName' }] }}
        propertyType={PropertyType.HumanName}
        value={value}
      />
    );

    expect(screen.getByText('Smith')).toBeInTheDocument();
  });

  test('Renders Identifier', async () => {
    const value: Identifier = {
      system: 'xyz',
      value: 'xyz123',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Identifier' }] }}
        propertyType={PropertyType.Identifier}
        value={value}
      />
    );

    expect(screen.getByText('xyz: xyz123')).toBeInTheDocument();
  });

  test('Renders Period', async () => {
    const value: Period = {
      start: '2021-06-01T12:00:00Z',
      end: '2021-06-30T12:00:00Z',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Period' }] }}
        propertyType={PropertyType.Period}
        value={value}
      />
    );

    expect(screen.getByText('2021', { exact: false })).toBeInTheDocument();
  });

  test('Renders Quantity', async () => {
    const value: Quantity = {
      value: 1,
      unit: 'mg',
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Quantity' }] }}
        propertyType={PropertyType.Quantity}
        value={value}
      />
    );

    expect(screen.getByText('1 mg')).toBeInTheDocument();
  });

  test('Renders Range', async () => {
    const value: Range = {
      low: { value: 5, unit: 'mg' },
      high: { value: 10, unit: 'mg' },
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Range' }] }}
        propertyType={PropertyType.Range}
        value={value}
      />
    );

    expect(screen.getByText('5 - 10 mg')).toBeInTheDocument();
  });

  test('Renders Ratio', async () => {
    const value: Ratio = {
      numerator: { value: 5, unit: 'mg' },
      denominator: { value: 10, unit: 'ml' },
    };

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'Ratio' }] }}
        propertyType={PropertyType.Ratio}
        value={value}
      />
    );

    expect(screen.getByText('5 mg / 10 ml')).toBeInTheDocument();
  });

  test('Renders Reference', async () => {
    const value: Reference = {
      reference: 'Patient/123',
      display: 'John Smith',
    };

    await setup(
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

  test('Renders BackboneElement', async () => {
    const value: SubscriptionChannel = {
      type: 'rest-hook',
      endpoint: 'https://example.com/hook',
    };

    await setup(
      <ResourcePropertyDisplay
        path="Subscription.channel"
        property={{ ...baseProperty, path: 'Subscription.channel', type: [{ code: 'SubscriptionChannel' }] }}
        propertyType={PropertyType.BackboneElement}
        value={value}
      />
    );

    expect(screen.getByText(value.endpoint as string)).toBeInTheDocument();
  });

  test('Handles unknown property', async () => {
    console.error = jest.fn();
    await expect(
      setup(<ResourcePropertyDisplay propertyType={PropertyType.BackboneElement} value={{}} />)
    ).rejects.toThrow('Displaying property of type BackboneElement requires element schema');
    expect(console.error).toHaveBeenCalled();
  });
});
