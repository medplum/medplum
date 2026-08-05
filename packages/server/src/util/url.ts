// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import ipaddr from 'ipaddr.js';
import dns from 'node:dns';
import type { Dispatcher } from 'undici';
import { Agent, buildConnector } from 'undici';
import { getConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';

export interface OutboundUrlValidationOptions {
  readonly allowHttp?: boolean;
  readonly allowUnsafeHostname?: boolean;
}

const connector = buildConnector({});

// The DOM RequestInit type used by built-in fetch does not include Undici's
// dispatcher option, even though Node's fetch accepts it.
type FetchInitWithDispatcher = RequestInit & { dispatcher?: Dispatcher };

export function createSafeConnect(connect: buildConnector.connector = connector): buildConnector.connector {
  return (options, callback) => {
    if (options.protocol !== 'https:') {
      callback(new Error('Outbound request blocked: HTTPS is required'), null);
      return;
    }

    if (isUnsafeHostname(options.hostname)) {
      callback(new Error(`Outbound request to unsafe hostname ${options.hostname} is blocked`), null);
      return;
    }

    dns.lookup(options.hostname, { all: true }, (err, addresses) => {
      if (err) {
        callback(err, null);
        return;
      }

      if (addresses.some(({ address }) => isUnsafeIpAddress(address))) {
        callback(new Error(`Outbound request to unsafe address ${options.hostname} is blocked`), null);
        return;
      }

      const [{ address }] = addresses;
      connect({ ...options, hostname: address, servername: options.hostname }, callback);
    });
  };
}

export const safeAgent = new Agent({
  connect: createSafeConnect(),
});

/**
 * Performs an outbound fetch with SSRF-safe connection handling unless unsafe outbound requests are explicitly allowed.
 * @param input - Fetch input.
 * @param init - Fetch options.
 * @returns Fetch response.
 */
export function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (getConfig().allowUnsafeOutbound) {
    return fetch(input, init);
  }
  return fetch(input, { ...init, dispatcher: safeAgent } as FetchInitWithDispatcher);
}

/**
 * Performs static outbound URL checks before enqueueing async jobs.
 * This prevents known-bad jobs from consuming retry attempts while leaving DNS and redirect safety to safeAgent.
 * @param value - URL string.
 * @param config - Server configuration.
 * @returns True if the URL should be queued for outbound fetch.
 */
export function isAllowedOutboundUrlForQueue(
  value: string,
  config: Pick<MedplumServerConfig, 'allowUnsafeOutbound'>
): boolean {
  try {
    validateOutboundUrl(value, {
      allowHttp: config.allowUnsafeOutbound,
      allowUnsafeHostname: config.allowUnsafeOutbound,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses and validates an outbound URL without making network calls.
 *
 * @param value - URL string or URL instance.
 * @param options - Validation options.
 * @returns Parsed URL.
 */
export function validateOutboundUrl(value: string | URL, options: OutboundUrlValidationOptions = {}): URL {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new Error('Invalid URL: must be an absolute URL');
  }

  if (url.protocol !== 'https:') {
    if (!(options.allowHttp && url.protocol === 'http:')) {
      throw new Error('Invalid URL: HTTPS is required');
    }
  }

  if (!options.allowUnsafeHostname && isUnsafeHostname(url.hostname)) {
    throw new Error('Invalid URL: unsafe hostname');
  }

  return url;
}

/**
 * Checks whether a hostname should be rejected for outbound requests.
 *
 * @param hostname - URL hostname.
 * @returns True when the hostname is localhost or an unsafe literal IP address.
 */
export function isUnsafeHostname(hostname: string): boolean {
  const normalizedHostname = stripIpv6Brackets(hostname).toLowerCase();
  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname === 'localhost.localdomain' ||
    normalizedHostname.endsWith('.localhost')
  ) {
    return true;
  }
  return isUnsafeIpAddress(normalizedHostname);
}

/**
 * Checks whether an IP address is not globally routable and should be rejected for outbound requests.
 *
 * @param address - IPv4 or IPv6 address.
 * @returns True when the IP address is loopback, private, link-local, multicast, or reserved.
 */
export function isUnsafeIpAddress(address: string): boolean {
  const normalizedAddress = stripIpv6Brackets(address).toLowerCase();
  if (!ipaddr.isValid(normalizedAddress)) {
    return false;
  }
  const parsedAddress = ipaddr.process(normalizedAddress);
  if (parsedAddress.kind() === 'ipv4' && parsedAddress.match(ipaddr.parse('198.18.0.0'), 15)) {
    return true;
  }
  return parsedAddress.range() !== 'unicast';
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}
