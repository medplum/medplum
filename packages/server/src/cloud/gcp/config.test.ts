// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { MedplumServerConfig } from '../../config/types';
import { loadGcpConfig } from './config';

jest.mock('@google-cloud/secret-manager');

describe('GCP Config', () => {
  const mockAccessSecretVersion = jest.fn();
  const mockClient = {
    accessSecretVersion: mockAccessSecretVersion,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (SecretManagerServiceClient as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  describe('loadGcpConfig', () => {
    test('loads and parses basic config correctly', async () => {
      const inputConfig: Partial<MedplumServerConfig> = {
        baseUrl: 'https://www.example.com',
        port: 8080,
      };

      mockAccessSecretVersion.mockResolvedValueOnce([{ payload: { data: JSON.stringify(inputConfig) } }]);

      const config = await loadGcpConfig('project-id:secret-id');

      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/project-id/secrets/secret-id/versions/latest',
      });

      expect(config).toMatchObject(inputConfig);
    });

    test('handles dot syntax', async () => {
      const inputConfig: Record<string, unknown> = {
        baseUrl: 'https://www.example.com',
        'database.host': 'localhost',
        'database.port': 5432,
        'database.ssl.require': 'true',
      };

      mockAccessSecretVersion.mockResolvedValueOnce([{ payload: { data: JSON.stringify(inputConfig) } }]);

      const config = await loadGcpConfig('project-id:secret-id');

      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/project-id/secrets/secret-id/versions/latest',
      });

      expect(config).toMatchObject({
        baseUrl: 'https://www.example.com',
        database: {
          host: 'localhost',
          port: 5432,
          ssl: {
            require: true,
          },
        },
      });
    });

    test('handles empty config object', async () => {
      mockAccessSecretVersion.mockResolvedValueOnce([{ payload: { data: '{}' } }]);
      const config = await loadGcpConfig('project-id:secret-id');
      expect(config).toEqual({});
    });

    test('throws error on empty config string', async () => {
      mockAccessSecretVersion.mockResolvedValueOnce([{ payload: { data: '' } }]);
      await expect(loadGcpConfig('project-id:secret-id')).rejects.toThrow('Secret payload is empty');
    });

    test('throws error when secret manager client fails', async () => {
      const errorMessage = 'Failed to access secret';
      mockAccessSecretVersion.mockRejectedValueOnce(new Error(errorMessage));

      await expect(loadGcpConfig('project-id:secret-id')).rejects.toThrow(errorMessage);
    });
  });
});
