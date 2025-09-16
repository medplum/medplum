// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
import { MemoryRouter } from 'react-router';
import { act, render, screen, userEvent } from '../test-utils/render';
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

  test('Renders string array with more than 50 items and shows total count', async () => {
    const manyStrings = Array.from({ length: 75 }, (_, index) => `item-${index + 1}`);

    await setup(
      <ResourcePropertyDisplay
        property={{ ...baseProperty, type: [{ code: 'string' }], max: Number.POSITIVE_INFINITY }}
        propertyType={PropertyType.string}
        value={manyStrings}
      />
    );

    expect(screen.getByText('item-1')).toBeInTheDocument();
    expect(screen.getByText('item-50')).toBeInTheDocument();

    expect(screen.queryByText('item-51')).not.toBeInTheDocument();
    expect(screen.queryByText('item-75')).not.toBeInTheDocument();

    expect(screen.getByText('... 75 total values')).toBeInTheDocument();
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
    await expect(
      setup(<ResourcePropertyDisplay propertyType={PropertyType.BackboneElement} value={{}} />)
    ).rejects.toThrow('Displaying property of type BackboneElement requires element schema');
  });

  describe('Secret field functionality', () => {
    test('Renders secret field with masked value by default', async () => {
      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'ClientApplication.clientSecret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="my-secret-value"
        />
      );

      // The secret value should be masked by default
      expect(screen.queryByText('my-secret-value')).not.toBeInTheDocument();

      // The masked bullets should be visible
      const maskedElement = screen.getByText('••••••••');
      expect(maskedElement).toBeInTheDocument();

      // The secret field should be rendered with the SecretFieldDisplay component
      // Check if the parent element has the Mantine Flex component classes and flex-related styles
      const parentElement = maskedElement.parentElement;
      expect(parentElement).toHaveClass('mantine-Flex-root');
      expect(parentElement).toHaveStyle({ 'align-items': 'center' });
      expect(parentElement?.style.gap).toBeTruthy();
    });

    test('Shows copy and show/hide buttons for secret field', async () => {
      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'ClientApplication.clientSecret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="my-secret-value"
        />
      );

      // Should have copy button
      const copyButton = screen.getByRole('button', { name: /copy secret/i });
      expect(copyButton).toBeInTheDocument();

      // Should have show/hide button
      const showHideButton = screen.getByRole('button', { name: /show secret/i });
      expect(showHideButton).toBeInTheDocument();
    });

    test('Toggles secret visibility when show/hide button is clicked', async () => {
      const user = userEvent.setup();

      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'ClientApplication.clientSecret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="my-secret-value"
        />
      );

      const showHideButton = screen.getByRole('button', { name: /show secret/i });

      // Initially should show the eye icon (hidden state)
      expect(showHideButton).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /show secret/i })).toBeInTheDocument();

      // Click to show
      await user.click(showHideButton);
      expect(screen.getByRole('button', { name: /hide secret/i })).toBeInTheDocument();

      // Click to hide again
      await user.click(screen.getByRole('button', { name: /hide secret/i }));
      expect(screen.getByRole('button', { name: /show secret/i })).toBeInTheDocument();
    });

    test('Copy button copies secret value to clipboard', async () => {
      const user = userEvent.setup();

      // Mock clipboard API
      const mockClipboard = {
        writeText: jest.fn().mockResolvedValue(undefined),
      };
      Object.defineProperty(navigator, 'clipboard', {
        value: mockClipboard,
        writable: true,
      });

      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'ClientApplication.clientSecret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="my-secret-value"
        />
      );

      const copyButton = screen.getByRole('button', { name: /copy secret/i });
      await user.click(copyButton);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('my-secret-value');
    });

    test('Shows success state when copy button is clicked', async () => {
      const user = userEvent.setup();

      // Mock clipboard API
      const mockClipboard = {
        writeText: jest.fn().mockResolvedValue(undefined),
      };
      Object.defineProperty(navigator, 'clipboard', {
        value: mockClipboard,
        writable: true,
      });

      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'ClientApplication.clientSecret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="my-secret-value"
        />
      );

      const copyButton = screen.getByRole('button', { name: /copy secret/i });
      await user.click(copyButton);

      // Should show copied state
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
    });

    test('Does not show action buttons for empty secret value', async () => {
      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'ClientApplication.clientSecret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value=""
        />
      );

      // Should not have copy or show/hide buttons
      expect(screen.queryByRole('button', { name: /copy secret/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /show secret/i })).not.toBeInTheDocument();
    });

    test('Does not show action buttons for null secret value', async () => {
      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'ClientApplication.clientSecret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value={null}
        />
      );

      // Should not have copy or show/hide buttons
      expect(screen.queryByRole('button', { name: /copy secret/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /show secret/i })).not.toBeInTheDocument();
    });

    test('Recognizes secret field path with clientSecret', async () => {
      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'ClientApplication.clientSecret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="test-secret"
        />
      );

      expect(screen.getByRole('button', { name: /copy secret/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /show secret/i })).toBeInTheDocument();
    });

    test('Recognizes secret field path with credentials.secret', async () => {
      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'Device.credentials.secret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="test-secret"
        />
      );

      expect(screen.getByRole('button', { name: /copy secret/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /show secret/i })).toBeInTheDocument();
    });

    test('Recognizes secret field path with just secret', async () => {
      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'secret', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="test-secret"
        />
      );

      expect(screen.getByRole('button', { name: /copy secret/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /show secret/i })).toBeInTheDocument();
    });

    test('Regular string fields do not have secret functionality', async () => {
      await setup(
        <ResourcePropertyDisplay
          property={{ ...baseProperty, path: 'Patient.name', type: [{ code: 'string' }] }}
          propertyType={PropertyType.string}
          value="John Doe"
        />
      );

      // Should not have secret functionality for regular strings
      expect(screen.queryByRole('button', { name: /copy secret/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /show secret/i })).not.toBeInTheDocument();

      // Should display normally
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });
});
