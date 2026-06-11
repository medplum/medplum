// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { RuleTester } from 'eslint';
import rule from './no-transaction-callback-invoking-repo.mjs';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
});

ruleTester.run('no-transaction-callback-invoking-repo', rule, {
  valid: [
    {
      code: 'repo.withTransaction(async (txRepo) => txRepo.createResource(resource));',
    },
    {
      code: 'repo.ensureInTransaction(async (txRepo) => txRepo.createResource(resource));',
    },
    {
      code: 'ctx.repo.withTransaction(async (txRepo) => txRepo.createResource(resource));',
    },
    {
      code: 'this.repo.withTransaction(async (txRepo) => this.withRepo(txRepo, () => this.processBatch()));',
    },
    {
      code: 'repo.withTransaction(async (repo) => repo.createResource(resource));',
    },
    {
      code: 'repo.withTransaction(txFn);',
    },
    {
      code: [
        'repo.withTransaction(async (txRepo) =>',
        '  txRepo.withTransaction(async (nestedRepo) => nestedRepo.createResource(resource))',
        ');',
      ].join('\n'),
    },
    {
      // Declaring a shadowing variable from the callback repo is fine; only the
      // initializer of a declaration counts as a reference, not the declared name
      code: [
        'repo.withTransaction(async (txRepo) => {',
        '  const repo = txRepo;',
        '  return repo.createResource(resource);',
        '});',
      ].join('\n'),
    },
  ],
  invalid: [
    {
      code: 'repo.withTransaction(async (txRepo) => repo.createResource(resource));',
      errors: [{ messageId: 'useCallbackRepo' }],
    },
    {
      code: 'repo.ensureInTransaction(async (txRepo) => repo.createResource(resource));',
      errors: [{ messageId: 'useCallbackRepo' }],
    },
    {
      code: 'ctx.repo.withTransaction(async (txRepo) => ctx.repo.createResource(resource));',
      errors: [{ messageId: 'useCallbackRepo' }],
    },
    {
      code: 'this.repo.withTransaction(async (txRepo) => this.repo.createResource(resource));',
      errors: [{ messageId: 'useCallbackRepo' }],
    },
    {
      code: [
        'repo.withTransaction(async (txRepo) =>',
        '  repo.withTransaction(async (nestedRepo) => nestedRepo.createResource(resource))',
        ');',
      ].join('\n'),
      errors: [{ messageId: 'useCallbackRepo' }],
    },
    {
      // Aliasing the invoking repo inside the callback is flagged at the alias declaration
      code: [
        'repo.withTransaction(async (txRepo) => {',
        '  const parent = repo;',
        '  return parent.createResource(resource);',
        '});',
      ].join('\n'),
      errors: [{ messageId: 'useCallbackRepo' }],
    },
    {
      code: [
        'ctx.repo.withTransaction(async (txRepo) => {',
        '  const parent = ctx.repo;',
        '  return parent.createResource(resource);',
        '});',
      ].join('\n'),
      errors: [{ messageId: 'useCallbackRepo' }],
    },
  ],
});
