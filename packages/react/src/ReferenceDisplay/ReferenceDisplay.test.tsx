import { Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '../test-utils/render';
import { ReferenceDisplay } from './ReferenceDisplay';

const medplum = new MockClient();

function setup(ui: ReactElement): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>{ui}</MedplumProvider>
    </MemoryRouter>
  );
}

describe('ReferenceDisplay', () => {
  test('Renders undefined', () => {
    setup(<ReferenceDisplay />);
  });

  test('Renders reference', () => {
    setup(<ReferenceDisplay value={{ reference: 'Organization/123' }} />);
    expect(screen.getByText('Organization/123')).toBeDefined();
    expect((screen.getByText('Organization/123') as HTMLAnchorElement).href).toMatch('Organization/123');
  });

  test('Renders reference and display', () => {
    setup(<ReferenceDisplay value={{ reference: 'Organization/123', display: 'Foo' }} />);
    expect(screen.getByText('Foo')).toBeDefined();
    expect((screen.getByText('Foo') as HTMLAnchorElement).href).toMatch('Organization/123');
  });

  test('Renders unknown properties', () => {
    setup(<ReferenceDisplay value={{ foo: 'bar' } as unknown as Reference} />);
    expect(screen.getByText('{"foo":"bar"}')).toBeDefined();
  });

  test('Renders reference no link', () => {
    setup(<ReferenceDisplay value={{ reference: 'Organization/123' }} link={false} />);
    expect(screen.getByText('Organization/123')).toBeDefined();
  });

  test('Renders reference and display no link', () => {
    setup(<ReferenceDisplay value={{ reference: 'Organization/123', display: 'Foo' }} link={false} />);
    expect(screen.getByText('Foo')).toBeDefined();
  });
});
