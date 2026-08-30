// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import express from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { getConfig, loadTestConfig } from './config/loader';

const app = express();

describe('API catalog', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get /.well-known/api-catalog', async () => {
    const { baseUrl, issuer } = getConfig();
    const res = await request(app).get('/.well-known/api-catalog');
    expect(res).toHaveStatus(200);
    expect(res.headers['content-type']).toStrictEqual(
      `${ContentType.LINKSET_JSON}; profile="https://www.rfc-editor.org/info/rfc9727"`
    );
    expect(res.headers['link']).toStrictEqual(`<${baseUrl}.well-known/api-catalog>; rel="api-catalog"`);

    const linkset = JSON.parse(res.text).linkset;
    expect(linkset).toStrictEqual([
      {
        anchor: `${baseUrl}fhir/R4`,
        'service-desc': [{ href: `${baseUrl}fhir/R4/metadata`, type: ContentType.FHIR_JSON }],
        'service-doc': [{ href: 'https://www.medplum.com/docs/api/fhir', type: ContentType.HTML }],
      },
      {
        anchor: `${baseUrl}oauth2`,
        'service-desc': [{ href: `${baseUrl}.well-known/oauth-authorization-server`, type: ContentType.JSON }],
        'service-doc': [{ href: 'https://www.medplum.com/docs/api/oauth', type: ContentType.HTML }],
      },
      {
        anchor: issuer,
        'service-desc': [{ href: `${baseUrl}.well-known/openid-configuration`, type: ContentType.JSON }],
        'service-doc': [{ href: 'https://www.medplum.com/docs/auth/medplum-as-idp', type: ContentType.HTML }],
      },
      {
        anchor: `${baseUrl}dicomweb`,
        'service-doc': [{ href: 'https://www.medplum.com/docs/dicom/dicomweb-api', type: ContentType.HTML }],
      },
      {
        anchor: `${baseUrl}scim/v2`,
        'service-doc': [{ href: 'https://www.medplum.com/docs/api/scim/overview', type: ContentType.HTML }],
      },
    ]);
  });

  test('Head /.well-known/api-catalog', async () => {
    const res = await request(app).head('/.well-known/api-catalog');
    expect(res).toHaveStatus(200);
    expect(res.headers['link']).toStrictEqual(`<${getConfig().baseUrl}.well-known/api-catalog>; rel="api-catalog"`);
    expect(res.headers['content-type']).toStrictEqual(
      `${ContentType.LINKSET_JSON}; profile="https://www.rfc-editor.org/info/rfc9727"`
    );
    expect(res.text).toBeUndefined();
  });

  test('Advertised endpoints resolve', async () => {
    const linkset = JSON.parse((await request(app).get('/.well-known/api-catalog')).text).linkset;
    const { baseUrl } = getConfig();

    // Only the machine-readable descriptions are hosted by this server.
    const serviceDescPaths = linkset
      .flatMap((context: any) => context['service-desc'] ?? [])
      .map((target: any) => target.href.substring(baseUrl.length - 1));
    expect(serviceDescPaths).toHaveLength(3);

    for (const path of serviceDescPaths) {
      expect(await request(app).get(path)).toHaveStatus(200);
    }
  });

  test('www.medplum.com redirects to the canonical catalog', () => {
    // RFC 9727 section 5.1 - other instances redirect to the canonical instance.
    // www.medplum.com is served by Vercel, so the redirect lives in the docs site config.
    const vercelConfig = JSON.parse(readFileSync(resolve(__dirname, '../../docs/vercel.json'), 'utf8'));
    expect(vercelConfig.redirects).toContainEqual({
      source: '/.well-known/api-catalog',
      destination: 'https://api.medplum.com/.well-known/api-catalog',
      permanent: true,
    });
  });

  test('Catalog is not project scoped', async () => {
    // RFC 9727 section 5.1 - there is only one authoritative catalog document.
    const projectId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/projects/${projectId}/.well-known/api-catalog`);
    expect(res).toHaveStatus(200);
    expect(JSON.parse(res.text)).toStrictEqual(JSON.parse((await request(app).get('/.well-known/api-catalog')).text));
  });
});
