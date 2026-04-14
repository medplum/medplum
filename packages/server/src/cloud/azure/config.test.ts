// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SecretClient } from '@azure/keyvault-secrets';
import { mockGetSecret } from '../../__mocks__/@azure/keyvault-secrets';
import type { MedplumServerConfig } from '../../config/types';
import { loadAzureConfig } from './config';

jest.mock('@azure/keyvault-secrets');
jest.mock('@azure/identity');

describe('Azure Config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadAzureConfig', () => {
    test('loads and parses basic config correctly', async () => {
      const inputConfig: Partial<MedplumServerConfig> = {
        baseUrl: 'https://www.example.com',
        port: 8080,
      };

      mockGetSecret.mockResolvedValueOnce({
        value: JSON.stringify(inputConfig),
      });

      const config = await loadAzureConfig('medplum-vault.vault.azure.net:medplum-config');

      expect(SecretClient).toHaveBeenCalledWith('https://medplum-vault.vault.azure.net', expect.anything());
      expect(mockGetSecret).toHaveBeenCalledWith('medplum-config');
      expect(config).toMatchObject(inputConfig);
    });

    test('handles dot syntax for nested config', async () => {
      const inputConfig: Record<string, unknown> = {
        baseUrl: 'https://www.example.com',
        'database.host': 'localhost',
        'database.port': 5432,
        'database.ssl.require': 'true',
        'database.ssl.rejectUnauthorized': 'false',
      };

      mockGetSecret.mockResolvedValueOnce({
        value: JSON.stringify(inputConfig),
      });

      const config = await loadAzureConfig('medplum-vault.vault.azure.net:medplum-config');

      expect(mockGetSecret).toHaveBeenCalledWith('medplum-config');
      expect(config).toMatchObject({
        baseUrl: 'https://www.example.com',
        database: {
          host: 'localhost',
          port: 5432,
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        },
      });
    });

    test('handles complex nested config with arrays', async () => {
      const inputConfig: Record<string, unknown> = {
        baseUrl: 'https://www.example.com',
        port: 8080,
        botCustomFunctionsEnabled: 'true',
        logAuditEvents: 'false',
        registerEnabled: 'false',
        defaultProjectSystemSetting: JSON.stringify([
          { name: 'someSetting', valueString: 'someValue' },
          { name: 'secondSetting', valueInteger: 5 },
        ]),
      };

      mockGetSecret.mockResolvedValueOnce({
        value: JSON.stringify(inputConfig),
      });

      const config = await loadAzureConfig('medplum-vault.vault.azure.net:medplum-config');

      expect(config).toMatchObject({
        baseUrl: 'https://www.example.com',
        port: 8080,
        botCustomFunctionsEnabled: true,
        logAuditEvents: false,
        registerEnabled: false,
        defaultProjectSystemSetting: [
          { name: 'someSetting', valueString: 'someValue' },
          { name: 'secondSetting', valueInteger: 5 },
        ],
      });
    });

    test('handles empty config object', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: '{}',
      });

      const config = await loadAzureConfig('medplum-vault.vault.azure.net:medplum-config');

      expect(config).toEqual({});
    });

    test('throws error when secret value is empty', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: undefined,
      });

      await expect(loadAzureConfig('medplum-vault.vault.azure.net:medplum-config')).rejects.toThrow(
        'Secret payload is empty'
      );
    });

    test('throws error when secret value is null', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: null,
      });

      await expect(loadAzureConfig('medplum-vault.vault.azure.net:medplum-config')).rejects.toThrow(
        'Secret payload is empty'
      );
    });

    test('throws error when Key Vault client fails', async () => {
      const errorMessage = 'Failed to retrieve secret from Key Vault';
      mockGetSecret.mockRejectedValueOnce(new Error(errorMessage));

      await expect(loadAzureConfig('medplum-vault.vault.azure.net:medplum-config')).rejects.toThrow(errorMessage);
    });

    test('handles invalid JSON in secret', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: 'not valid json{',
      });

      await expect(loadAzureConfig('medplum-vault.vault.azure.net:medplum-config')).rejects.toThrow();
    });

    test('correctly constructs Key Vault URL with https prefix', async () => {
      const inputConfig = { baseUrl: 'https://www.example.com' };

      mockGetSecret.mockResolvedValueOnce({
        value: JSON.stringify(inputConfig),
      });

      await loadAzureConfig('my-keyvault.vault.azure.net:my-secret');

      // Verify the SecretClient was constructed with the correct URL (with https://)
      expect(SecretClient).toHaveBeenCalledWith('https://my-keyvault.vault.azure.net', expect.anything());
    });
  });
});
