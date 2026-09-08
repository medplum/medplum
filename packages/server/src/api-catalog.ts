// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { concatUrls, ContentType } from '@medplum/core';
import type { Request, Response } from 'express';
import { getConfig } from './config/loader';

// RFC 9727 API catalog
// See: https://www.rfc-editor.org/rfc/rfc9727.html
//
// The catalog is a discovery bootstrap, not a replacement for the discovery mechanisms of the
// protocols it references. It lists only the major independently usable protocol surfaces, and
// points each one at its own native machine-readable description.  Individual FHIR capabilities
// such as SMART App Launch, Bulk Data, CDS Hooks, and FHIRcast have their own discovery
// mechanisms, and are intentionally not top level catalog entries.

const API_CATALOG_PATH = '.well-known/api-catalog';

const RFC_9727_PROFILE = 'https://www.rfc-editor.org/info/rfc9727';
const API_CATALOG_CONTENT_TYPE = `${ContentType.LINKSET_JSON}; profile="${RFC_9727_PROFILE}"`;
const DOCS_URL = 'https://www.medplum.com/docs/';

/** RFC 9264 link target object. */
interface LinksetTarget {
  readonly href: string;
  readonly type: string;
}

/** RFC 9264 link context object. */
interface LinksetContext {
  readonly anchor: string;
  readonly 'service-desc'?: LinksetTarget[];
  readonly 'service-doc'?: LinksetTarget[];
}

/**
 * Builds the RFC 9264 JSON Linkset describing this server's public protocol surfaces.
 * @returns The link context objects, one per API.
 */
function buildLinkset(): LinksetContext[] {
  const { baseUrl, issuer } = getConfig();
  return [
    {
      anchor: concatUrls(baseUrl, 'fhir/R4'),
      'service-desc': [{ href: concatUrls(baseUrl, 'fhir/R4/metadata'), type: ContentType.FHIR_JSON }],
      'service-doc': [{ href: concatUrls(DOCS_URL, 'api/fhir'), type: ContentType.HTML }],
    },
    {
      anchor: concatUrls(baseUrl, 'oauth2'),
      'service-desc': [{ href: concatUrls(baseUrl, '.well-known/oauth-authorization-server'), type: ContentType.JSON }],
      'service-doc': [{ href: concatUrls(DOCS_URL, 'api/oauth'), type: ContentType.HTML }],
    },
    {
      // OpenID Connect identifies its service by the Issuer Identifier, which is what the
      // OpenID Provider Configuration document advertises as "issuer".
      anchor: issuer,
      'service-desc': [{ href: concatUrls(baseUrl, '.well-known/openid-configuration'), type: ContentType.JSON }],
      'service-doc': [{ href: concatUrls(DOCS_URL, 'auth/medplum-as-idp'), type: ContentType.HTML }],
    },
    {
      // DICOMweb has no standard machine-readable service description, so "service-desc" is omitted.
      anchor: concatUrls(baseUrl, 'dicomweb'),
      'service-doc': [{ href: concatUrls(DOCS_URL, 'dicom/dicomweb-api'), type: ContentType.HTML }],
    },
    {
      // Medplum does not implement the SCIM discovery endpoints, so "service-desc" is omitted.
      anchor: concatUrls(baseUrl, 'scim/v2'),
      'service-doc': [{ href: concatUrls(DOCS_URL, 'api/scim/overview'), type: ContentType.HTML }],
    },
  ];
}

/**
 * Handles `GET` and `HEAD` of the RFC 9727 API catalog.
 *
 * There is exactly one authoritative catalog document, hosted on the API server. Other hosts, such
 * as the organizational web site, permanently redirect here rather than keeping their own copy.
 * @param _req - The request.
 * @param res - The response.
 */
export function apiCatalogHandler(_req: Request, res: Response): void {
  res.set('Link', `<${concatUrls(getConfig().baseUrl, API_CATALOG_PATH)}>; rel="api-catalog"`);
  res.set('Content-Type', API_CATALOG_CONTENT_TYPE);
  // Send a Buffer rather than using res.json(), because Express appends a "charset" parameter to
  // the Content-Type of string bodies, which would reorder the RFC 9727 "profile" parameter.
  res.status(200).send(Buffer.from(JSON.stringify({ linkset: buildLinkset() }), 'utf8'));
}
