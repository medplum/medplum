// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource } from '@medplum/core';
import {
  formatAddress,
  formatFamilyName,
  formatGivenName,
  formatHumanName,
  getDateProperty,
  getExtensionValue,
  getReferenceString,
  HTTP_HL7_ORG,
} from '@medplum/core';
import type { Bot, ClientApplication, Reference, User } from '@medplum/fhirtypes';
import type { Request, RequestHandler, Response } from 'express';
import { getAuthenticatedContext } from '../context';

/**
 * Handles the OAuth/OpenID UserInfo Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#UserInfo
 * @param _req - The request object
 * @param res - The response object
 */
export const userInfoHandler: RequestHandler = async (_req: Request, res: Response): Promise<void> => {
  const ctx = getAuthenticatedContext();
  const user = await ctx.systemRepo.readReference(ctx.login.user as Reference<User>);
  const profile = await ctx.repo.readReference(ctx.profile);
  const userInfo: Record<string, any> = {
    sub: user.id,
  };

  const scopes = ctx.login.scope?.split(' ');
  if (scopes?.includes('profile')) {
    buildProfile(userInfo, profile);
  }
  if (scopes?.includes('email')) {
    buildEmail(userInfo, profile, user);
  }
  if (scopes?.includes('phone')) {
    buildPhone(userInfo, profile);
  }
  if (scopes?.includes('address')) {
    buildAddress(userInfo, profile);
  }

  res.status(200).json(userInfo);
};

function buildProfile(userInfo: Record<string, any>, profile: ProfileResource | Bot | ClientApplication): void {
  userInfo.profile = getReferenceString(profile);
  userInfo.locale = 'en-US';

  const lastUpdated = getDateProperty(profile.meta?.lastUpdated);
  if (lastUpdated) {
    userInfo.updated_at = lastUpdated.getTime() / 1000;
  }

  if (profile.resourceType !== 'Patient' && profile.resourceType !== 'Practitioner') {
    // The rest of the profile information is only available for Patient and Practitioner resources
    return;
  }

  const humanName = profile.name?.[0];
  if (humanName) {
    userInfo.name = formatHumanName(humanName);
    userInfo.family_name = formatFamilyName(humanName);

    const givenNameParts = formatGivenName(humanName).split(' ');
    userInfo.given_name = givenNameParts[0];
    userInfo.middle_name = givenNameParts.slice(1).join(' ');
  }

  userInfo.birthdate = profile.birthDate;
  userInfo.gender = profile.gender;
  userInfo.picture = profile.photo?.[0]?.url;
  userInfo.nickname = profile.name?.find((n) => n.use === 'nickname')?.given?.[0];
  userInfo.website = profile.telecom?.find((cp) => cp.system === 'url')?.value;
  userInfo.preferred_username = profile.telecom?.find((cp) => cp.system === 'email')?.value?.split('@')[0];
  userInfo.zoneinfo = getExtensionValue(profile, `${HTTP_HL7_ORG}/fhir/StructureDefinition/timezone`);
}

function buildEmail(
  userInfo: Record<string, any>,
  profile: ProfileResource | Bot | ClientApplication,
  user: User
): void {
  if (user.email) {
    userInfo.email = user.email;
    userInfo.email_verified = Boolean(user.emailVerified);
  } else {
    const contactPoint = 'telecom' in profile ? profile.telecom?.find((cp) => cp.system === 'email') : undefined;
    if (contactPoint) {
      userInfo.email = contactPoint.value;
      userInfo.email_verified = false;
    }
  }
}

function buildPhone(userInfo: Record<string, any>, profile: ProfileResource | Bot | ClientApplication): void {
  const contactPoint = 'telecom' in profile ? profile.telecom?.find((cp) => cp.system === 'phone') : undefined;
  if (contactPoint) {
    userInfo.phone_number = contactPoint.value;
    userInfo.phone_number_verified = false;
  }
}

function buildAddress(userInfo: Record<string, any>, profile: ProfileResource | Bot | ClientApplication): void {
  const address = 'address' in profile ? profile.address?.[0] : undefined;
  if (address) {
    userInfo.address = {
      formatted: formatAddress(address),
      street_address: address.line?.join(' '),
      locality: address.city,
      region: address.state,
      postal_code: address.postalCode,
      country: address.country,
    };
  }
}
