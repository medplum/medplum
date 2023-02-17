import {
  formatAddress,
  formatFamilyName,
  formatGivenName,
  formatHumanName,
  getDateProperty,
  getReferenceString,
  ProfileResource,
} from '@medplum/core';
import { Reference } from '@medplum/fhirtypes';
import { Request, RequestHandler, Response } from 'express';
import { asyncWrap } from '../async';
import { Repository } from '../fhir/repo';

/**
 * Handles the OAuth/OpenID UserInfo Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#UserInfo
 */
export const userInfoHandler: RequestHandler = asyncWrap(async (_req: Request, res: Response) => {
  const repo = res.locals.repo as Repository;
  const profile = await repo.readReference(res.locals.profile as Reference<ProfileResource>);
  const userInfo: Record<string, any> = {
    sub: profile.id,
  };

  if (res.locals.login.scope.includes('profile')) {
    buildProfile(userInfo, profile);
  }

  if (res.locals.login.scope.includes('email')) {
    buildEmail(userInfo, profile);
  }

  if (res.locals.login.scope.includes('phone')) {
    buildPhone(userInfo, profile);
  }

  if (res.locals.login.scope.includes('address')) {
    buildAddress(userInfo, profile);
  }

  res.status(200).json(userInfo);
});

function buildProfile(userInfo: Record<string, any>, profile: ProfileResource): void {
  userInfo.profile = getReferenceString(profile);
  userInfo.locale = 'en-US';
  userInfo.birthdate = profile.birthDate;

  const lastUpdated = getDateProperty(profile.meta?.lastUpdated);
  if (lastUpdated) {
    userInfo.updated_at = lastUpdated.getTime() / 1000;
  }

  const humanName = profile.name?.[0];
  if (humanName) {
    userInfo.name = formatHumanName(humanName);
    userInfo.given_name = formatGivenName(humanName);
    userInfo.middle_name = '';
    userInfo.family_name = formatFamilyName(humanName);
  }

  userInfo.website = '';
  userInfo.zoneinfo = '';
  userInfo.gender = '';
  userInfo.preferred_username = '';
  userInfo.picture = '';
  userInfo.nickname = '';
}

function buildEmail(userInfo: Record<string, any>, profile: ProfileResource): void {
  const contactPoint = profile.telecom?.find((cp) => cp.system === 'email');
  if (contactPoint) {
    userInfo.email = contactPoint.value;
    userInfo.email_verified = false;
  }
}

function buildPhone(userInfo: Record<string, any>, profile: ProfileResource): void {
  const contactPoint = profile.telecom?.find((cp) => cp.system === 'phone');
  if (contactPoint) {
    userInfo.phone_number = contactPoint.value;
    userInfo.phone_number_verified = false;
  }
}

function buildAddress(userInfo: Record<string, any>, profile: ProfileResource): void {
  const address = profile.address?.[0];
  if (address) {
    userInfo.address = {
      formatted: formatAddress(address),
    };
  }
}
