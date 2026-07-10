// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import ipaddr from 'ipaddr.js';
import dns from 'node:dns';
import { Agent, buildConnector, setGlobalDispatcher } from 'undici';
import type { MedplumServerConfig } from '../config/types';

export interface OutboundUrlValidationOptions {
  readonly allowHttp?: boolean;
  readonly allowUnsafeHostname?: boolean;
}

const connector = buildConnector({});

export const safeAgent = new Agent({
  connect(options, callback) {
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
      connector({ ...options, hostname: address, servername: options.hostname }, callback);
    });
  },
});

/**
 * Installs the global SSRF-safe dispatcher unless unsafe outbound requests are explicitly allowed.
 * @param config - Server configuration.
 * @returns True if the safe dispatcher was installed.
 */
export function installSafeOutboundDispatcher(config: Pick<MedplumServerConfig, 'allowUnsafeOutbound'>): boolean {
  if (config.allowUnsafeOutbound) {
    return false;
  }
  setGlobalDispatcher(safeAgent);
  return true;
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
