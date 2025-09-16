// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// Example of requesting refresh tokens with email/password login
// start-block emailPasswordLogin
await medplum.startLogin({
  email: 'admin@example.com',
  password: 'password',
  scope: 'openid offline_access',
});
// end-block emailPasswordLogin

// Example of requesting refresh tokens with OAuth
// start-block oauthLogin
await medplum.signInWithRedirect({
  scope: 'openid offline_access',
});
// end-block oauthLogin

// Example of customizing token lifetimes
// start-block tokenLifetimes
const clientApplication = {
  resourceType: 'ClientApplication',
  // Set access token lifetime to 2 hours (7200 seconds)
  accessTokenLifetime: 7200,

  // Set refresh token lifetime to 180 days
  refreshTokenLifetime: 15552000,
};
// end-block tokenLifetimes
console.log(clientApplication);

// Example of customizing grace period
// start-block graceCustomization
// Initialize client with a 10-minute grace period
const customMedplum = new MedplumClient({
  refreshGracePeriod: 600000, // 10 minutes in milliseconds
});

// You can also check authentication status with a custom grace period
if (!customMedplum.isAuthenticated(300000)) {
  // Token will expire within 5 minutes
  await customMedplum.refreshIfExpired();
}
// end-block graceCustomization

// Example of best practices
// start-block bestPractices
const bestPracticesMedplum = new MedplumClient({
  refreshGracePeriod: 300000, // 5 minute grace period (default)
});
// end-block bestPractices
console.log(bestPracticesMedplum);
