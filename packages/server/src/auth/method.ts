import { OperationOutcomeError, Operator, badRequest } from '@medplum/core';
import { DomainConfiguration } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { getConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { makeValidationMiddleware } from '../util/validator';

/*
 * The method handler is used to determine available login methods.
 * This is an unauthorized endpoint that does not require a login.
 * We do not leak the existence of a user account, but we do leak the existince of domain configurations.
 * For example, an unauthenticated user could determine if "foo.com" has a domain configuration.
 */

export const methodValidator = makeValidationMiddleware([
  body('email').isEmail().withMessage('Valid email address is required'),
]);

export async function methodHandler(req: Request, res: Response): Promise<void> {
  const externalAuth = await isExternalAuth(req.body.email);
  if (externalAuth) {
    // Return the authorization URL
    // This indicates the client should redirect to the authorization URL
    res.status(200).json(externalAuth);
    return;
  }

  // Send empty response indication no information available
  // This indicates the client should proceed with the default login flow
  res.status(200).json({});
}

/**
 * Checks if the given email address is configured for external authentication.
 * @param email - The user email address.
 * @returns External auth url if available. Otherwise undefined.
 */
export async function isExternalAuth(email: string): Promise<{ domain: string; authorizeUrl: string } | undefined> {
  const domain = email.split('@')[1];
  const domainConfig = await getDomainConfiguration(domain);
  if (!domainConfig) {
    return undefined;
  }

  const idp = domainConfig.identityProvider;
  if (!idp) {
    return undefined;
  }

  try {
    const url = new URL(idp.authorizeUrl as string);
    url.searchParams.set('client_id', idp.clientId as string);
    url.searchParams.set('redirect_uri', getConfig().baseUrl + 'auth/external');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    return { domain, authorizeUrl: url.toString() };
  } catch (_err) {
    globalLogger.error(`Error constructing URL for domain ${domain}:`);
    throw new OperationOutcomeError(badRequest('Failed to construct URL for the domain'));
  }
}

/**
 * Returns the domain configuration for the given domain name.
 * @param domain - The domain name.
 * @returns The domain configuration for the domain name if available.
 */
export async function getDomainConfiguration(domain: string): Promise<DomainConfiguration | undefined> {
  const systemRepo = getSystemRepo();
  const results = await systemRepo.search<DomainConfiguration>({
    resourceType: 'DomainConfiguration',
    filters: [
      {
        code: 'domain',
        operator: Operator.EQUALS,
        value: domain.toLowerCase(),
      },
    ],
  });
  return results.entry?.[0]?.resource;
}
