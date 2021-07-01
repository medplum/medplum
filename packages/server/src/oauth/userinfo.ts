import { formatAddress, formatFamilyName, formatGivenName, formatHumanName, getDateProperty, getReferenceString, ProfileResource } from '@medplum/core';
import { Request, RequestHandler, Response } from 'express';
import { asyncWrap } from '../async';
import { isOk, repo } from '../fhir';

/**
 * Handles the OAuth/OpenID UserInfo Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#UserInfo
 */
export const userInfoHandler: RequestHandler = asyncWrap(async (req: Request, res: Response) => {
  const userInfo: Record<string, any> = {
    sub: res.locals.user
  };

  const [outcome, resource] = await repo.readReference({ reference: res.locals.profile });
  if (!isOk(outcome) || !resource) {
    console.log('Error reading profile', outcome);
    return res.sendStatus(500);
  }

  const profile = resource as ProfileResource;

  if (res.locals.scope.includes('profile')) {
    buildProfile(userInfo, profile);
  }

  if (res.locals.scope.includes('email')) {
    buildContact(userInfo, profile, 'email');
  }

  if (res.locals.scope.includes('phone')) {
    buildContact(userInfo, profile, 'phone');
  }

  if (res.locals.scope.includes('address')) {
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
    userInfo.family_name = formatFamilyName(humanName);
  }

  userInfo.website = '';
  userInfo.zoneinfo = '';
  userInfo.gender = '';
  userInfo.preferred_username = '';
  userInfo.picture = '';
  userInfo.nickname = '';
}

function buildContact(userInfo: Record<string, any>, profile: ProfileResource, system: string): void {
  const contactPoint = profile.telecom?.find(cp => cp.system === system);
  if (contactPoint) {
    userInfo[system] = contactPoint.value;
  }
}

function buildAddress(userInfo: Record<string, any>, profile: ProfileResource): void {
  const address = profile.address?.[0];
  if (address) {
    userInfo.address = formatAddress(address);
  }
}
