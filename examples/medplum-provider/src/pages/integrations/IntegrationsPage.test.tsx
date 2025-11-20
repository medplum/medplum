// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { IntegrationsPage } from './IntegrationsPage';
import { render, screen, fireEvent } from '../../test-utils/render';

describe('IntegrationsPage', () => {
  let mockLocationHref: string;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.location.href
    mockLocationHref = '';
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        get href() {
          return mockLocationHref;
        },
        set href(value: string) {
          mockLocationHref = value;
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  function setup(): void {
    render(<IntegrationsPage />);
  }

  test('Renders all integrations', () => {
    setup();

    // Check that all integration names are rendered
    expect(screen.getByText('Okta')).toBeInTheDocument();
    expect(screen.getByText('Auth0')).toBeInTheDocument();
    expect(screen.getByText('Google Authentication')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Entra SSO')).toBeInTheDocument();
    expect(screen.getByText('Labcorp')).toBeInTheDocument();
    expect(screen.getByText('Quest Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Health Gorilla')).toBeInTheDocument();
    expect(screen.getByText('Candid Health')).toBeInTheDocument();
    expect(screen.getByText('Particle')).toBeInTheDocument();
    expect(screen.getByText('Epic Systems')).toBeInTheDocument();
    expect(screen.getByText('reCAPTCHA')).toBeInTheDocument();
    expect(screen.getByText('Datadog')).toBeInTheDocument();
    expect(screen.getByText('Sumo Logic')).toBeInTheDocument();
    expect(screen.getByText('Snowflake')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Stripe')).toBeInTheDocument();
    expect(screen.getByText('Acuity Scheduling')).toBeInTheDocument();
    expect(screen.getByText('Cal.com')).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('DeepSeek')).toBeInTheDocument();
    expect(screen.getByText('Azure')).toBeInTheDocument();
    expect(screen.getByText('Healthie')).toBeInTheDocument();
  });

  test('Renders integration descriptions', () => {
    setup();

    expect(
      screen.getByText(/Implement SSO for healthcare staff with HIPAA-compliant authentication protocols/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Manage identity access for patient portals/)).toBeInTheDocument();
    expect(
      screen.getByText(/Place orders and receive lab results directly in your EHR from Labcorp/)
    ).toBeInTheDocument();
  });

  test('Renders integration tags', () => {
    setup();

    // Check for various tags
    expect(screen.getAllByText('Authentication').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Diagnostics').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Billing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HIE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EHR').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Security').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Observability').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AI').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Scheduling').length).toBeGreaterThan(0);
  });

  test('Renders Request Integration buttons for all integrations', () => {
    setup();

    // There should be 22 integration cards, each with a "Request Integration" button
    const requestButtons = screen.getAllByRole('button', { name: 'Request Integration' });
    expect(requestButtons.length).toBe(22);
  });

  test('Clicking Request Integration opens mailto link with correct subject', () => {
    setup();

    const oktaButton = screen.getAllByRole('button', { name: 'Request Integration' })[0];
    fireEvent.click(oktaButton);

    expect(mockLocationHref).toContain('mailto:hello@medplum.com');
    expect(mockLocationHref).toContain('subject=');
    expect(decodeURIComponent(mockLocationHref)).toContain('Integration Request: Okta');
  });

  test('Clicking Request Integration opens mailto link with correct body', () => {
    setup();

    const oktaButton = screen.getAllByRole('button', { name: 'Request Integration' })[0];
    fireEvent.click(oktaButton);

    const decodedHref = decodeURIComponent(mockLocationHref);
    expect(decodedHref).toContain('Hello Medplum team');
    expect(decodedHref).toContain('I would like to request an integration with Okta');
    expect(decodedHref).toContain('Name: Okta');
    expect(decodedHref).toContain(
      'Description: Implement SSO for healthcare staff with HIPAA-compliant authentication protocols.'
    );
    expect(decodedHref).toContain('URL: https://www.okta.com');
    expect(decodedHref).toContain('Thank you!');
  });

  test('Clicking different integration opens mailto with correct integration details', () => {
    setup();

    // Find Health Gorilla button (should be one of the later ones)
    const buttons = screen.getAllByRole('button', { name: 'Request Integration' });
    const healthGorillaButton = buttons.find((button) => {
      const card = button.closest('[class*="Paper"]');
      return card?.textContent?.includes('Health Gorilla');
    });

    expect(healthGorillaButton).toBeDefined();

    if (healthGorillaButton) {
      fireEvent.click(healthGorillaButton);

      const decodedHref = decodeURIComponent(mockLocationHref);
      expect(decodedHref).toContain('Integration Request: Health Gorilla');
      expect(decodedHref).toContain('I would like to request an integration with Health Gorilla');
      expect(decodedHref).toContain('Name: Health Gorilla');
      expect(decodedHref).toContain('URL: https://www.healthgorilla.com');
    }
  });

  test('Mailto link properly encodes special characters', () => {
    setup();

    // Find an integration with special characters in description
    const buttons = screen.getAllByRole('button', { name: 'Request Integration' });
    const microsoftButton = buttons.find((button) => {
      const card = button.closest('[class*="Paper"]');
      return card?.textContent?.includes('Microsoft Entra SSO');
    });

    expect(microsoftButton).toBeDefined();

    if (microsoftButton) {
      fireEvent.click(microsoftButton);

      // The URL should be properly encoded
      expect(mockLocationHref).toContain('mailto:hello@medplum.com');
      expect(mockLocationHref).toContain('subject=');
      expect(mockLocationHref).toContain('body=');

      // Decoded should contain the correct content
      const decodedHref = decodeURIComponent(mockLocationHref);
      expect(decodedHref).toContain("Integrate Microsoft's identity platform");
    }
  });

  test('Renders integration display URLs', () => {
    setup();

    // Check that display URLs are rendered as links
    expect(screen.getByText('okta.com')).toBeInTheDocument();
    expect(screen.getByText('auth0.com')).toBeInTheDocument();
    expect(screen.getByText('labcorp.com')).toBeInTheDocument();
  });

  test('Integration links open in new tab', () => {
    setup();

    const oktaLink = screen.getByText('okta.com').closest('a');
    expect(oktaLink).toHaveAttribute('href', 'https://www.okta.com');
    expect(oktaLink).toHaveAttribute('target', '_blank');
    expect(oktaLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('Renders correct number of integrations', () => {
    setup();

    // Count unique integration names
    const integrationNames = [
      'Okta',
      'Auth0',
      'Google Authentication',
      'Microsoft Entra SSO',
      'Labcorp',
      'Quest Diagnostics',
      'Health Gorilla',
      'Candid Health',
      'Particle',
      'Epic Systems',
      'reCAPTCHA',
      'Datadog',
      'Sumo Logic',
      'Snowflake',
      'OpenAI',
      'Stripe',
      'Acuity Scheduling',
      'Cal.com',
      'Claude',
      'DeepSeek',
      'Azure',
      'Healthie',
    ];

    integrationNames.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });
});
