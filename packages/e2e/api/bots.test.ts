// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { expect, test } from '../fixtures/test';

test(
  'Bot fetches from an HTTPS server signed by the test CA',
  { tag: '@outbound' },
  async ({ superAdmin, testProject, startHttpsServer }) => {
    const { medplum, project } = testProject;
    await superAdmin.updateResource({ ...project, features: ['bots'] });
    const url = await startHttpsServer((_req, res) => res.end('hello from mock'));

    const bot = await medplum.post<Bot>(`admin/projects/${project.id}/bot`, { name: 'Fetch bot' });
    await medplum.post(medplum.fhirUrl('Bot', bot.id as string, '$deploy'), {
      code: 'exports.handler = async (medplum, event) => (await fetch(event.input)).text();',
    });

    expect(await medplum.executeBot(bot.id as string, url.toString(), ContentType.TEXT)).toBe('hello from mock');
  }
);
