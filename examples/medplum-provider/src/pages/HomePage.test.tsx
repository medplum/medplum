import { describe, test, expect, vi } from 'vitest';
import { HomePage } from './HomePage';

vi.mock('@medplum/react', () => ({
  Document: ({ children }: { children: any }) => <div data-testid="document">{children}</div>,
  ResourceName: ({ value }: { value: any }) => <h1 data-testid="resource-name">{value?.name?.[0]?.given?.[0] || 'Test User'}</h1>,
  SearchControl: () => <div data-testid="search-control"><input type="search" /></div>,
  useMedplumNavigate: () => vi.fn(),
  useMedplumProfile: () => ({ resourceType: 'Practitioner', id: '123', name: [{ given: ['Test'], family: 'User' }] }),
}));

vi.mock('@medplum/core', () => ({
  getReferenceString: () => 'Patient/123',
}));

vi.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet"></div>,
}));

describe('HomePage', () => {
  test('Component can be imported', () => {
    expect(HomePage).toBeDefined();
  });
});
