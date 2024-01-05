import { ResourceType } from '@medplum/fhirtypes';
import { SearchParameterDetails, getSearchParameterDetails } from './details';
import { Filter, parseParameter } from './search';
import { getSearchParameter } from '../types';
import { splitN } from '../utils';

export interface ChainedSearchLink {
  resourceType: string;
  details: SearchParameterDetails;
  reverse?: boolean;
  filter?: Filter;
}

export interface ChainedSearchParameter {
  chain: ChainedSearchLink[];
}

export function looksLikeChain(code: string): boolean {
  if (code.includes('.') || code.startsWith('_has:')) {
    return true;
  }
  return false;
}

export function parseChainedParameter(resourceType: string, key: string, value: string): ChainedSearchParameter {
  const param: ChainedSearchParameter = {
    chain: [],
  };
  let currentResourceType = resourceType;

  const parts = splitChainedSearch(key);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('_has')) {
      const link = parseReverseChainLink(part, currentResourceType);
      param.chain.push(link);
      currentResourceType = link.resourceType;
    } else if (i === parts.length - 1) {
      const [code, modifier] = splitN(part, ':', 2);
      const searchParam = getSearchParameter(currentResourceType, part);
      if (!searchParam) {
        throw new Error(`Invalid search parameter at end of chain: ${currentResourceType}?${code}`);
      }
      param.chain[param.chain.length - 1].filter = parseParameter(searchParam, modifier, value);
    } else {
      const link = parseChainLink(part, currentResourceType);
      param.chain.push(link);
      currentResourceType = link.resourceType;
    }
  }
  return param;
}

function parseChainLink(param: string, currentResourceType: string): ChainedSearchLink {
  const [code, modifier] = splitN(param, ':', 2);
  const searchParam = getSearchParameter(currentResourceType, code);
  if (!searchParam) {
    throw new Error(`Invalid search parameter in chain: ${currentResourceType}?${code}`);
  }
  let resourceType: string;
  if (searchParam.target?.length === 1) {
    resourceType = searchParam.target[0];
  } else if (searchParam.target?.includes(modifier as ResourceType)) {
    resourceType = modifier;
  } else {
    throw new Error(`Unable to identify next resource type for search parameter: ${currentResourceType}?${code}`);
  }
  const details = getSearchParameterDetails(currentResourceType, searchParam);
  return { resourceType, details };
}

function parseReverseChainLink(param: string, targetResourceType: string): ChainedSearchLink {
  const [, resourceType, code] = splitN(param, ':', 3);
  const searchParam = getSearchParameter(resourceType, code);
  if (!searchParam) {
    throw new Error(`Invalid search parameter in chain: ${resourceType}?${code}`);
  } else if (!searchParam.target?.includes(targetResourceType as ResourceType)) {
    throw new Error(
      `Invalid reverse chain link: search parameter ${resourceType}?${code} does not refer to ${targetResourceType}`
    );
  }
  const details = getSearchParameterDetails(resourceType, searchParam);
  return { resourceType, details, reverse: true };
}

function splitChainedSearch(chain: string): string[] {
  const params: string[] = [];
  while (chain) {
    const peek = chain.slice(0, 5);
    if (peek === '_has:') {
      const resourceTypeDelim = chain.indexOf(':', 5);
      const codeDelim = chain.indexOf(':', resourceTypeDelim + 1);
      if (resourceTypeDelim < 0 || resourceTypeDelim >= codeDelim) {
        throw new Error('Invalid search chain: ' + chain);
      }
      params.push(chain.slice(0, codeDelim));
      chain = chain.slice(codeDelim + 1);
    } else {
      let nextDot = chain.indexOf('.');
      if (nextDot === -1) {
        nextDot = chain.length;
      }
      params.push(chain.slice(0, nextDot));
      chain = chain.slice(nextDot + 1);
    }
  }
  return params;
}
