// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * HealthieClient provides methods to interact with the Healthie API.
 */
export class HealthieClient {
  private baseURL: string;
  private clientSecret: string;

  /**
   * Creates a new HealthieClient instance.
   * @param baseURL - The base URL for the Healthie API.
   * @param clientSecret - The API secret for authentication.
   */
  constructor(baseURL: string, clientSecret: string) {
    this.baseURL = baseURL;
    this.clientSecret = clientSecret;
  }

  /**
   * Executes a GraphQL query against the Healthie API.
   * @param query - The GraphQL query string.
   * @param variables - Optional variables for the GraphQL query.
   * @returns The query result data.
   */
  async query<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
    if (!this.clientSecret) {
      throw new Error('Healthie credentials not provided');
    }

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.clientSecret}`,
        AuthorizationSource: 'API',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    const result = (await response.json()) as HealthieGraphQLResponse<T>;

    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL Error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data) {
      throw new Error('No data returned from Healthie API');
    }

    return result.data;
  }
}

/**
 * Interface for Healthie GraphQL API responses.
 */
interface HealthieGraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}
