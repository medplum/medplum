// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, indexSearchParameterBundle, indexStructureDefinitionBundle, validateResource } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { MemoryRepository } from '@medplum/fhir-router';
import type { Bundle, Extension, Questionnaire, QuestionnaireItem, SearchParameter } from '@medplum/fhirtypes';
import { vi } from 'vitest';
import {
  ASSEMBLED_FROM_EXTENSION_URL,
  ASSEMBLE_EXPECTATION_EXTENSION_URL,
  SUB_QUESTIONNAIRE_EXTENSION_URL,
  VARIABLE_EXTENSION_URL,
  assembleQuestionnaire,
} from './questionnaireassembly';
import { KNOWLEDGE_CAPABILITY_URL, QuestionnaireResolver } from './questionnaireassemblyresolver';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/';
const library = 'http://hl7.org/fhir/StructureDefinition/cqf-library';
const constraint = 'http://hl7.org/fhir/StructureDefinition/targetConstraint';
const module = (
  name: string,
  item: QuestionnaireItem[] = [{ linkId: 'q', type: 'string', text: 'Answer' }]
): Questionnaire => ({
  resourceType: 'Questionnaire',
  status: 'active',
  url: `https://example.org/${name}`,
  version: '1',
  extension: [{ url: ASSEMBLE_EXPECTATION_EXTENSION_URL, valueCode: 'assemble-root-or-child' }],
  item,
});
const placeholder = (name: string, linkId = 'import'): QuestionnaireItem => ({
  linkId,
  type: 'display',
  text: 'Module unavailable',
  extension: [{ url: SUB_QUESTIONNAIRE_EXTENSION_URL, valueCanonical: `https://example.org/${name}|1` }],
});
const variable = (name: string, expression = "'value'"): Extension => ({
  url: VARIABLE_EXTENSION_URL,
  valueExpression: { name, language: 'text/fhirpath', expression },
});
const group = (prefix: string, item: QuestionnaireItem[]): QuestionnaireItem => ({
  linkId: prefix,
  type: 'group',
  extension: [variable('linkIdPrefix', `'${prefix}.'`)],
  item,
});
const launchContext = (types = ['Practitioner', 'PractitionerRole']): Extension => ({
  url: sdc + 'sdc-questionnaire-launchContext',
  extension: [
    {
      url: 'name',
      valueCoding: { system: 'http://hl7.org/fhir/uv/sdc/CodeSystem/launchContext', code: 'user', display: 'User' },
    },
    ...types.map((valueCode) => ({ url: 'type', valueCode })),
    { url: 'description', valueString: 'The person completing this form' },
    { url: 'multiplesAllowed', valueBoolean: false },
  ],
});
const targetConstraint = (key: string, expression = 'true'): Extension => ({
  url: constraint,
  extension: [
    { url: 'key', valueId: key },
    { url: 'severity', valueCode: 'error' },
    { url: 'expression', valueExpression: { language: 'text/fhirpath', expression } },
    { url: 'human', valueString: 'Example response constraint' },
  ],
});

beforeAll(() => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
});

describe('Whole-questionnaire assembly', () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  test('preserves nested prefix scopes, order, conditions, repeats, and runtime expressions', async () => {
    // Derived from SDC STU4 modular-contact/modular-name: omit item.definition,
    // align supplied versions, and assert structure from these controlled inputs.
    const expression = "%resource.item.where(linkId=%linkIdPrefix + 'family')";
    const name = module('name', [
      {
        linkId: 'family',
        type: 'string',
        required: true,
        maxLength: 50,
        extension: [
          {
            url: sdc + 'sdc-questionnaire-calculatedExpression',
            valueExpression: { language: 'text/fhirpath', expression },
          },
        ],
      },
    ]);
    const contact = module('contact', [
      {
        linkId: '1',
        type: 'group',
        repeats: true,
        extension: [variable('linkIdPrefix', "%linkIdPrefix + 'name.'")],
        item: [placeholder('name'), { linkId: 'own', type: 'boolean' }],
      },
      { linkId: '2', type: 'string', enableWhen: [{ question: '1', operator: 'exists', answerBoolean: true }] },
    ]);
    contact.extension?.push({ url: sdc + 'sdc-questionnaire-assembleContext', valueString: 'linkIdPrefix' });
    await repo.createResource(name);
    await repo.createResource(contact);
    const root = module('root', [
      group('patientcontact', [placeholder('contact')]),
      group('patientname', [placeholder('name')]),
    ]);
    const original = deepClone(root);
    const result = await assembleQuestionnaire(repo, root);
    expect(result.issues).toEqual([]);
    expect(result.questionnaire.item?.[0].item?.[0]).toMatchObject({
      linkId: 'patientcontact.1',
      repeats: true,
      extension: [variable('linkIdPrefix', "%linkIdPrefix + 'name.'")],
      item: [{ linkId: 'patientcontact.name.family', required: true, maxLength: 50 }, { linkId: 'patientcontact.own' }],
    });
    expect(result.questionnaire.item?.[0].item?.[1].enableWhen?.[0].question).toBe('patientcontact.1');
    expect(result.questionnaire.item?.[1].item?.[0].extension?.[0].valueExpression?.expression).toBe(expression);
    expect(root).toEqual(original);
    expect(result.questionnaire.url).toBe(root.url);
    expect(result.questionnaire.version).toBe('1');
    expect(result.questionnaire.extension?.filter((e) => e.url === ASSEMBLED_FROM_EXTENSION_URL)).toEqual(
      expect.arrayContaining([
        { url: ASSEMBLED_FROM_EXTENSION_URL, valueCanonical: 'https://example.org/contact|1' },
        { url: ASSEMBLED_FROM_EXTENSION_URL, valueCanonical: 'https://example.org/name|1' },
      ])
    );
  });

  test('preserves conditions referring to a nested module under an inherited prefix', async () => {
    await repo.createResource(module('grandchild', [{ linkId: 'city', type: 'string', text: 'City' }]));
    await repo.createResource(
      module('child', [
        { linkId: 'name', type: 'string', enableWhen: [{ question: 'city', operator: 'exists', answerBoolean: true }] },
        placeholder('grandchild'),
      ])
    );
    const result = await assembleQuestionnaire(repo, module('root', [group('person', [placeholder('child')])]));
    expect(result.issues).toEqual([]);
    expect(result.questionnaire.item?.[0].item).toMatchObject([
      { linkId: 'person.name', enableWhen: [{ question: 'person.city' }] },
      { linkId: 'person.city', text: 'City' },
    ]);
  });

  test.each([false, true])(
    'rejects child-root prefixes regardless of sibling order: prefix child first %s',
    async (first) => {
      const child = module('prefix-child', [{ linkId: 'a', type: 'string' }]);
      child.extension?.push(variable('linkIdPrefix', "'changed.'"));
      const stored = await repo.createResource(child);
      await repo.createResource(module('plain-child', [{ linkId: 'b', type: 'string' }]));
      const imports = [placeholder('prefix-child', 'a-import'), placeholder('plain-child', 'b-import')];
      const root = module('root', [{ linkId: 'section', type: 'group', item: first ? imports : imports.reverse() }]);
      const original = deepClone(root);
      await expect(assembleQuestionnaire(repo, root)).rejects.toThrow(
        'put linkIdPrefix on the parent or a group inside the module'
      );
      expect(root).toEqual(original);
      expect(await repo.readResource('Questionnaire', stored.id)).toEqual(stored);
    }
  );

  test('allows a root prefix and applies it consistently to sibling imports', async () => {
    await repo.createResource(module('a', [{ linkId: 'a', type: 'string' }]));
    await repo.createResource(module('b', [{ linkId: 'b', type: 'string' }]));
    const root = module('root', [placeholder('a', 'a-import'), placeholder('b', 'b-import')]);
    root.extension?.push(variable('linkIdPrefix', "'parent.'"));
    const result = await assembleQuestionnaire(repo, root);
    expect(result.questionnaire.item?.map((item) => item.linkId)).toEqual(['parent.a', 'parent.b']);
    expect(result.questionnaire.extension).toContainEqual(variable('linkIdPrefix', "'parent.'"));
    expect(result.issues).toEqual([]);
  });

  test('prefixes all typed contained references, including canonical arrays, without rewriting expressions', async () => {
    const child = module('child', [{ linkId: 'q', type: 'choice', answerValueSet: '#values' }]);
    child.contained = [
      { resourceType: 'ValueSet', id: 'values', status: 'active', compose: { include: [{ valueSet: ['#other'] }] } },
      { resourceType: 'ValueSet', id: 'other', status: 'active' },
      { resourceType: 'Patient', id: 'patient', managingOrganization: { reference: '#org' } },
      { resourceType: 'Organization', id: 'org' },
    ];
    await repo.createResource(child);
    const result = (
      await assembleQuestionnaire(
        repo,
        module('root', [group('a', [placeholder('child')]), group('b', [placeholder('child')])])
      )
    ).questionnaire;
    expect(result.contained?.map((r) => r.id)).toEqual([
      'a.values',
      'a.other',
      'a.patient',
      'a.org',
      'b.values',
      'b.other',
      'b.patient',
      'b.org',
    ]);
    expect(result.contained?.[0]).toMatchObject({ compose: { include: [{ valueSet: ['#a.other'] }] } });
    expect(result.contained?.[6]).toMatchObject({ managingOrganization: { reference: '#b.org' } });
    expect(result.item?.[0].item?.[0].answerValueSet).toBe('#a.values');
  });

  test('deduplicates identical contained resources and rejects conflicting IDs', async () => {
    const a = module('a', [{ linkId: 'a', type: 'choice', answerValueSet: '#values' }]);
    const b = module('b', [{ linkId: 'b', type: 'choice', answerValueSet: '#values' }]);
    a.contained = b.contained = [{ resourceType: 'ValueSet', id: 'values', status: 'active' }];
    await repo.createResource(a);
    const storedB = await repo.createResource(b);
    const root = module('root', [placeholder('a', 'a-import'), placeholder('b', 'b-import')]);
    expect((await assembleQuestionnaire(repo, root)).questionnaire.contained).toHaveLength(1);
    await repo.updateResource({ ...storedB, contained: [{ resourceType: 'ValueSet', id: 'values', status: 'draft' }] });
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('different resources');
  });

  test('propagates scoped metadata through nested top-level imports to the surviving container', async () => {
    const leaf = module('leaf');
    leaf.extension?.push(variable('leafVariable'), { url: constraint, extension: [{ url: 'key', valueId: 'rule' }] });
    const middle = module('middle', [placeholder('leaf')]);
    middle.extension?.push(variable('middleVariable'));
    await repo.createResource(leaf);
    await repo.createResource(middle);
    const result = (await assembleQuestionnaire(repo, module('root', [group('scope', [placeholder('middle')])])))
      .questionnaire;
    const names = result.item?.[0].extension
      ?.filter((e) => e.url === VARIABLE_EXTENSION_URL)
      .map((e) => e.valueExpression?.name);
    expect(names).toEqual(['linkIdPrefix', 'middleVariable', 'leafVariable']);
    expect(result.item?.[0].extension?.some((e) => e.url === constraint)).toBe(true);
    expect(result.extension?.some((e) => e.url === VARIABLE_EXTENSION_URL)).toBe(false);
  });

  test('requires context, allows nested shadowing, and rejects even identical duplicate variables in one scope', async () => {
    const child = module('child');
    child.extension?.push({ url: sdc + 'sdc-questionnaire-assembleContext', valueString: 'person' }, variable('x'));
    await repo.createResource(child);
    const root = module('root', [group('a', [placeholder('child')])]);
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('assembleContext');
    root.extension?.push(variable('person'), variable('x'));
    await expect(assembleQuestionnaire(repo, root)).resolves.toBeDefined();
    root.item?.[0].extension?.push(variable('x'));
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow("Variable 'x' is duplicated");
    await expect(assembleQuestionnaire(repo, child)).rejects.toThrow('through its parent');
  });

  test.each(['variable', 'launchContext'])(
    'allows a child to satisfy assembleContext with its own %s after propagation',
    async (kind) => {
      const declaration = kind === 'variable' ? variable('user') : launchContext();
      const child = module('child');
      child.extension?.push({ url: sdc + 'sdc-questionnaire-assembleContext', valueString: 'user' }, declaration);
      await repo.createResource(child);
      const root = module('root', [group('section', [placeholder('child')])]);
      const original = deepClone(root);
      const result = await assembleQuestionnaire(repo, root);
      expect(result.issues).toEqual([]);
      expect(result.questionnaire.item?.[0].item?.[0].linkId).toBe('section.q');
      const containingScope = kind === 'variable' ? result.questionnaire.item?.[0] : result.questionnaire;
      expect(containingScope?.extension).toContainEqual(declaration);
      expect(root).toEqual(original);
    }
  );

  test('deduplicates a shared parent and child launch context required by assembleContext', async () => {
    const launch = launchContext();
    const child = module('child');
    child.extension?.push({ url: sdc + 'sdc-questionnaire-assembleContext', valueString: 'user' }, launchContext());
    await repo.createResource(child);
    const root = module('root', [placeholder('child')]);
    root.extension?.push(launch);
    const result = await assembleQuestionnaire(repo, root);
    expect(result.issues).toEqual([]);
    expect(result.questionnaire.item?.[0].linkId).toBe('q');
    expect(result.questionnaire.extension?.filter((e) => e.url === launch.url)).toEqual([launch]);
  });

  test.each(['variable', 'launchContext'])(
    'resolves propagated %s dependencies from nested imports in either sibling order',
    async (kind) => {
      const provider = module('provider', [{ linkId: 'provider', type: 'string' }]);
      provider.extension?.push(kind === 'variable' ? variable('user') : launchContext());
      const consumer = module('consumer', [{ linkId: 'consumer', type: 'string' }]);
      consumer.extension?.push({ url: sdc + 'sdc-questionnaire-assembleContext', valueString: 'user' });
      await repo.createResource(provider);
      await repo.createResource(consumer);
      await repo.createResource(module('outer-provider', [placeholder('provider')]));
      await repo.createResource(module('outer-consumer', [placeholder('consumer')]));
      for (const order of [
        ['outer-provider', 'outer-consumer'],
        ['outer-consumer', 'outer-provider'],
      ]) {
        const root = module('root', [
          group(
            'section',
            order.map((name) => placeholder(name, name))
          ),
        ]);
        const original = deepClone(root);
        const result = await assembleQuestionnaire(repo, root);
        expect(result.issues).toEqual([]);
        expect(result.questionnaire.item?.[0].item?.map((item) => item.linkId)).toEqual(
          order.map((name) => 'section.' + name.replace('outer-', ''))
        );
        expect(root).toEqual(original);
      }
    }
  );

  test.each(['variable', 'launchContext'])(
    'keeps propagated %s in its specified scope across sibling groups',
    async (kind) => {
      const provider = module('provider', [{ linkId: 'provider', type: 'string' }]);
      provider.extension?.push(kind === 'variable' ? variable('user') : launchContext());
      const consumer = module('consumer');
      consumer.extension?.push({ url: sdc + 'sdc-questionnaire-assembleContext', valueString: 'user' });
      await repo.createResource(provider);
      await repo.createResource(consumer);
      for (const order of [
        ['provider', 'consumer'],
        ['consumer', 'provider'],
      ]) {
        const root = module(
          'root',
          order.map((name) => group(name, [placeholder(name)]))
        );
        if (kind === 'variable') {
          await expect(assembleQuestionnaire(repo, root)).rejects.toThrow("unavailable assembleContext 'user'");
        } else {
          expect((await assembleQuestionnaire(repo, root)).issues).toEqual([]);
        }
      }
    }
  );

  test.each(['root', 'launch-module', 'variable-module', 'both-modules'])(
    'rejects launch-context and variable name collisions at the root: %s',
    async (location) => {
      const launch = module('launch', [{ linkId: 'launch', type: 'string' }]);
      launch.extension?.push(launchContext());
      const vars = module('vars', [{ linkId: 'vars', type: 'string' }]);
      vars.extension?.push(variable('user'));
      await repo.createResource(launch);
      await repo.createResource(vars);
      for (const order of [
        ['launch', 'vars'],
        ['vars', 'launch'],
      ]) {
        const imported = order.filter(
          (name) =>
            location === 'both-modules' || location === (name === 'launch' ? 'launch-module' : 'variable-module')
        );
        const root = module('root', imported.length ? imported.map((name) => placeholder(name, name)) : undefined);
        if (!imported.includes('launch')) {
          root.extension?.push(launchContext());
        }
        if (!imported.includes('vars')) {
          root.extension?.push(variable('user'));
        }
        await expect(assembleQuestionnaire(repo, root)).rejects.toThrow("Duplicate or missing variable name 'user'");
      }
    }
  );

  test('allows a nested variable to shadow a launch context imported by a later module', async () => {
    const provider = module('provider', [{ linkId: 'provider', type: 'string' }]);
    provider.extension?.push(launchContext());
    await repo.createResource(provider);
    const section = group('section', [{ linkId: 'answer', type: 'string' }]);
    section.extension?.push(variable('user'));
    const result = await assembleQuestionnaire(repo, module('root', [section, placeholder('provider')]));
    expect(result.issues).toEqual([]);
    expect(result.questionnaire.item?.[0].extension).toContainEqual(variable('user'));
  });

  test.each(['same-scope', 'separate-groups'])(
    'warns on duplicate targetConstraint keys across the assembled resource: %s',
    async (location) => {
      const first = module('first', [{ linkId: 'first', type: 'string' }]);
      const second = module('second', [{ linkId: 'second', type: 'string' }]);
      first.extension?.push(targetConstraint('shared'));
      second.extension?.push(targetConstraint('shared', 'false'));
      await repo.createResource(first);
      await repo.createResource(second);
      const root = module(
        'root',
        ['first', 'second'].map((name) =>
          location === 'same-scope' ? placeholder(name, name) : group(name, [placeholder(name)])
        )
      );
      const result = await assembleQuestionnaire(repo, root);
      expect(result.issues).toEqual([
        expect.objectContaining({
          severity: 'warning',
          code: 'invariant',
          details: { text: expect.stringContaining("Duplicate targetConstraint key 'shared'") },
          expression: [expect.stringMatching(/^Questionnaire\.(item\[1\]\.)?extension\[\d+\]$/)],
        }),
      ]);
      const containers = location === 'same-scope' ? [result.questionnaire] : (result.questionnaire.item ?? []);
      expect(containers.flatMap((container) => container.extension?.filter((e) => e.url === constraint) ?? [])).toEqual(
        [targetConstraint('shared'), targetConstraint('shared', 'false')]
      );
    }
  );

  test('keeps distinct targetConstraint keys without warnings', async () => {
    const child = module('child');
    child.extension?.push(targetConstraint('child-rule'));
    await repo.createResource(child);
    const root = module('root', [placeholder('child')]);
    root.extension?.push(targetConstraint('root-rule'));
    const result = await assembleQuestionnaire(repo, root);
    expect(result.issues).toEqual([]);
    expect(result.questionnaire.extension?.filter((e) => e.url === constraint)).toEqual([
      targetConstraint('root-rule'),
      targetConstraint('child-rule'),
    ]);
  });

  test.each(['bad_', 'bad:', 'x'.repeat(58)])(
    'explains contained ID restrictions after applying prefix %s',
    async (prefix) => {
      const child = module('child', [{ linkId: 'q', type: 'choice', answerValueSet: '#values' }]);
      child.contained = [{ resourceType: 'ValueSet', id: 'values', status: 'active' }];
      await repo.createResource(child);
      await expect(
        assembleQuestionnaire(repo, module('root', [group(prefix, [placeholder('child')])]))
      ).rejects.toThrow(
        `Contained resource id '${prefix}.values' in https://example.org/child|1 is invalid after prefixing; use 1 to 64 characters from A-Z, a-z, 0-9, '-' or '.'`
      );
    }
  );

  test('allows a prefixed contained ID at the 64-character limit', async () => {
    const child = module('child', [{ linkId: 'q', type: 'choice', answerValueSet: '#values' }]);
    child.contained = [{ resourceType: 'ValueSet', id: 'values', status: 'active' }];
    await repo.createResource(child);
    const prefix = 'x'.repeat(57);
    const result = await assembleQuestionnaire(repo, module('root', [group(prefix, [placeholder('child')])]));
    expect(result.issues).toEqual([]);
    expect(result.questionnaire.contained?.[0].id).toBe(`${prefix}.values`);
  });

  test('bounds expanded bytes before cloning large inputs', async () => {
    const root = module('root');
    root.description = 'x'.repeat(5 * 1024 * 1024);
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('expanded-input limit');
  });

  test('retains distinct libraries, deduplicates identical references, and rejects conflicting versions', async () => {
    const child = module('child');
    child.extension?.push(
      { url: library, valueCanonical: 'https://example.org/lib-a|1' },
      { url: library, valueCanonical: 'https://example.org/lib-b|1' }
    );
    await repo.createResource(child);
    const root = module('root', [placeholder('child')]);
    root.extension?.push({ url: library, valueCanonical: 'https://example.org/lib-a|1' });
    const assembled = (await assembleQuestionnaire(repo, root)).questionnaire;
    expect(assembled.extension?.filter((e) => e.url === library).map((e) => e.valueCanonical)).toEqual([
      'https://example.org/lib-a|1',
      'https://example.org/lib-b|1',
    ]);
    root.extension?.push({ url: library, valueCanonical: 'https://example.org/lib-b|2' });
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('Incompatible library versions');
  });

  test('deduplicates equivalent launch contexts despite descriptions, display text, and type order', async () => {
    const launch = launchContext();
    const childLaunch = launchContext(['PractitionerRole', 'Practitioner']);
    const name = childLaunch.extension?.find((e) => e.url === 'name') as Extension;
    name.valueCoding = { ...name.valueCoding, display: 'Form user' };
    const description = childLaunch.extension?.find((e) => e.url === 'description') as Extension;
    description.valueString = 'The respondent';
    const child = module('child');
    child.extension?.push(childLaunch);
    await repo.createResource(child);
    const root = module('root', [placeholder('child')]);
    root.extension?.push(launch);
    const original = deepClone(root);
    const result = await assembleQuestionnaire(repo, root);
    expect(result.questionnaire.extension?.filter((e) => e.url === launch.url)).toEqual([launch]);
    expect(result.issues).toEqual([]);
    expect(root).toEqual(original);
  });

  test.each(['system', 'types', 'multiplicity'])('rejects conflicting launch-context %s', async (field) => {
    const launch = launchContext();
    const childLaunch = launchContext();
    if (field === 'system') {
      const name = childLaunch.extension?.find((e) => e.url === 'name') as Extension;
      name.valueCoding = { ...name.valueCoding, system: 'https://example.org/other-context' };
    } else if (field === 'types') {
      childLaunch.extension = childLaunch.extension?.filter((e) => e.valueCode !== 'PractitionerRole');
    } else {
      const multiples = childLaunch.extension?.find((e) => e.url === 'multiplesAllowed') as Extension;
      multiples.valueBoolean = true;
    }
    const child = module('child');
    child.extension?.push(childLaunch);
    await repo.createResource(child);
    const root = module('root', [placeholder('child')]);
    root.extension?.push(launch);
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow("Incompatible launchContext 'user'");
  });

  test('returns final validation findings as warnings while preserving diagnostic locations', async () => {
    const child = module('empty');
    delete child.item;
    await repo.createResource(child);
    const root = module('root', [{ linkId: 'group', type: 'group', item: [placeholder('empty')] }]);
    const original = deepClone(root);
    expect(validateResource(root)).toEqual([]);
    expect(validateResource(child)).toEqual([]);
    const result = await assembleQuestionnaire(repo, root);
    expect(result.questionnaire.item).toEqual([{ linkId: 'group', type: 'group', item: [] }]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'invariant',
        details: { text: expect.stringContaining('que-1') },
        expression: ['Questionnaire.item[0]'],
        diagnostics: expect.any(String),
      }),
    ]);
    expect(root).toEqual(original);
  });

  test.each(['implicitRules', 'language', 'security', 'endpoint', 'entryMode', 'performerType', 'criticalExtension'])(
    'rejects incompatible child %s',
    async (field) => {
      const child = module('child');
      if (field === 'implicitRules') {
        child.implicitRules = 'https://example.org/rules';
      } else if (field === 'language') {
        child.language = 'fr';
      } else if (field === 'security') {
        child.meta = { security: [{ system: 'https://example.org/security', code: 'restricted' }] };
      } else {
        child.extension?.push({
          url: sdc + (field === 'criticalExtension' ? 'sdc-rendering-' : 'sdc-questionnaire-') + field,
          valueCode: 'example',
        });
      }
      await repo.createResource(child);
      const root = module('root', [placeholder('child')]);
      await expect(assembleQuestionnaire(repo, root)).rejects.toThrow(/incompatible|security labels/);
      root.language = child.language;
      root.implicitRules = child.implicitRules;
      root.meta = child.meta;
      root.extension?.push(...(child.extension?.filter((e) => e.url !== ASSEMBLE_EXPECTATION_EXTENSION_URL) ?? []));
      await expect(assembleQuestionnaire(repo, root)).resolves.toBeDefined();
    }
  );

  test.each([
    'definitionExtract',
    'itemExtractionContext',
    'itemPopulationContext',
    'observationExtract',
    'observation-extract-category',
    'observationLinkPeriod',
    'preferredTerminologyServer',
    'templateExtract',
    'templateExtractContext',
  ])('rejects child-root %s', async (name) => {
    const child = module('child');
    child.extension?.push({ url: sdc + 'sdc-questionnaire-' + name, valueBoolean: true });
    await repo.createResource(child);
    await expect(assembleQuestionnaire(repo, module('root', [placeholder('child')]))).rejects.toThrow('child root');
  });

  test.each(['adaptive', 'modifierRoot', 'modifierItem', 'assemble-root', 'invalid'])(
    'rejects unsafe child %s',
    async (kind) => {
      const child = module('child');
      if (kind === 'adaptive') {
        child.extension?.push({ url: sdc + 'sdc-questionnaire-questionnaireAdaptive', valueBoolean: true });
      } else if (kind === 'modifierRoot') {
        child.modifierExtension = [{ url: 'https://example.org/modifier', valueBoolean: true }];
      } else if (kind === 'modifierItem') {
        (child.item as QuestionnaireItem[])[0].modifierExtension = [
          { url: 'https://example.org/modifier', valueBoolean: true },
        ];
      } else {
        child.extension = [{ url: ASSEMBLE_EXPECTATION_EXTENSION_URL, valueCode: kind }];
      }
      await repo.createResource(child);
      await expect(assembleQuestionnaire(repo, module('root', [placeholder('child')]))).rejects.toThrow(
        /adaptive|modifierExtension|assemble-root|invalid/
      );
    }
  );

  test.each(['notDisplay', 'enableWhen', 'enableWhenExpression', 'variable', 'fragment'])(
    'rejects unsupported placeholder %s without modifying input',
    async (kind) => {
      await repo.createResource(module('child'));
      const item = placeholder('child');
      if (kind === 'notDisplay') {
        item.type = 'group';
      }
      if (kind === 'enableWhen') {
        item.enableWhen = [{ question: 'q', operator: 'exists', answerBoolean: true }];
      }
      if (kind === 'enableWhenExpression') {
        item.extension?.push({
          url: sdc + 'sdc-questionnaire-enableWhenExpression',
          valueExpression: { language: 'text/fhirpath', expression: 'true' },
        });
      }
      if (kind === 'variable') {
        item.extension?.push(variable('linkIdPrefix', "'x.'"));
      }
      if (kind === 'fragment') {
        (item.extension as Extension[])[0].valueCanonical += '#q';
      }
      const root = module('root', [item]);
      const before = deepClone(root);
      await expect(assembleQuestionnaire(repo, root)).rejects.toThrow();
      expect(root).toEqual(before);
    }
  );

  test.each(['now()', "%linkIdPrefix + 'x.'", "'a' | 'b'"])(
    'rejects unsupported or unresolved prefix %s',
    async (expression) => {
      const root = module('root');
      root.extension?.push(variable('linkIdPrefix', expression));
      await expect(assembleQuestionnaire(repo, root)).rejects.toThrow(/linkIdPrefix/);
    }
  );

  test.each([
    'https://example.org/Questionnaire/library|1#address',
    'https://example.org/StructureDefinition/example#Example.name',
  ])('rejects deferred item.definition before resolving %s', async (definition) => {
    const search = vi.spyOn(repo, 'searchResources');
    const read = vi.spyOn(repo, 'readResource');
    const root = module('root', [{ linkId: 'q', type: 'string', text: 'Answer', definition }]);
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('item.definition assembly is not supported');
    expect(search).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  test('rejects cycles spanning multiple modules', async () => {
    const first = await repo.createResource(module('first', [placeholder('second')]));
    await repo.createResource(module('second', [placeholder('first')]));
    await expect(assembleQuestionnaire(repo, first)).rejects.toThrow('circular');
  });

  test('rejects duplicate linkIds even without imports', async () => {
    const root = module('root', [
      { linkId: 'q', type: 'string' },
      { linkId: 'q', type: 'string' },
    ]);
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('Duplicate');
  });

  test('rejects dangling conditions and contained references', async () => {
    const root = module('root', [
      { linkId: 'q', type: 'string', enableWhen: [{ question: 'gone', operator: 'exists', answerBoolean: true }] },
    ]);
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('dangling');
    root.item = [{ linkId: 'q', type: 'choice', answerValueSet: '#missing' }];
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('Dangling contained');
  });

  test('bounds repeated expansion and nesting, not just unique module reads', async () => {
    const child = module(
      'child',
      Array.from({ length: 200 }, (_, i) => ({ linkId: `q${i}`, type: 'string' }))
    );
    await repo.createResource(child);
    const root = module(
      'root',
      Array.from({ length: 60 }, (_, i) => group(`g${i}`, [placeholder('child')]))
    );
    await expect(assembleQuestionnaire(repo, root)).rejects.toThrow('item limit');
    let item: QuestionnaireItem = { linkId: 'leaf', type: 'string' };
    for (let i = 0; i < 34; i++) {
      item = { linkId: `g${i}`, type: 'group', item: [item] };
    }
    await expect(assembleQuestionnaire(repo, module('root', [item]))).rejects.toThrow(/depth|deeply/);
  });

  test('removes a modular-only profile without leaving empty storage metadata', async () => {
    const root = module('root');
    root.meta = { versionId: '1', profile: [sdc + 'sdc-questionnaire-modular|4.0.0'] };
    expect((await assembleQuestionnaire(repo, root)).questionnaire.meta).toBeUndefined();
  });

  test.each([
    ['assemble-root', undefined],
    ['assemble-child', 'independent-child'],
    ['assemble-root-or-child', 'independent-root-or-child'],
    ['independent-child', 'independent-child'],
  ])('finalizes %s without changing business identity', async (input, output) => {
    const root = module('root');
    root.id = 'source-id';
    root.meta = {
      versionId: '9',
      lastUpdated: '2026-01-01T00:00:00Z',
      project: 'project',
      security: [{ code: 'test' }],
      profile: [sdc + 'sdc-questionnaire-modular', 'http://hl7.org/fhir/StructureDefinition/Questionnaire'],
    };
    root.extension = [
      { url: ASSEMBLE_EXPECTATION_EXTENSION_URL, valueCode: input },
      ...['computable', 'executable', 'executable'].map((code) => ({ url: KNOWLEDGE_CAPABILITY_URL, valueCode: code })),
    ];
    const result = (await assembleQuestionnaire(repo, root)).questionnaire;
    expect(result.id).toBeUndefined();
    expect(result.meta).toEqual({
      security: [{ code: 'test' }],
      profile: ['http://hl7.org/fhir/StructureDefinition/Questionnaire'],
    });
    expect(result.url).toBe(root.url);
    expect(result.version).toBe(root.version);
    expect(result.extension?.find((e) => e.url === ASSEMBLE_EXPECTATION_EXTENSION_URL)?.valueCode).toBe(output);
    expect(result.extension?.filter((e) => e.url === KNOWLEDGE_CAPABILITY_URL).map((e) => e.valueCode)).toEqual([
      'computable',
      'executable',
    ]);
    // Existing R4 validator, with the base profile definitions indexed above.
    expect(validateResource(result).filter((issue) => issue.severity === 'error')).toEqual([]);
  });
});

describe('Questionnaire module resolution', () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  test('uses exact business versions and warns rather than guessing for an unversioned canonical', async () => {
    const a = await repo.createResource(module('versioned'));
    const resolver = new QuestionnaireResolver(repo);
    expect((await resolver.resolve(a.url as string)).id).toBe(a.id);
    expect(resolver.issues[0].severity).toBe('warning');
    const b = await repo.createResource({ ...module('versioned'), version: '2' });
    await expect(new QuestionnaireResolver(repo).resolve(a.url as string)).rejects.toThrow('business version');
    expect((await new QuestionnaireResolver(repo).resolve(`${a.url}|2`)).id).toBe(b.id);
    await expect(new QuestionnaireResolver(repo).resolve(`${a.url}|3`)).rejects.toThrow('not found');
  });

  test('checks all pages and prefers only a single computable source without executable', async () => {
    for (let i = 0; i < 101; i++) {
      await repo.createResource({
        ...module('many'),
        extension: [
          { url: KNOWLEDGE_CAPABILITY_URL, valueCode: 'executable' },
          { url: KNOWLEDGE_CAPABILITY_URL, valueCode: 'computable' },
        ],
      });
    }
    const source = await repo.createResource({
      ...module('many'),
      extension: [{ url: KNOWLEDGE_CAPABILITY_URL, valueCode: 'computable' }],
    });
    const resolver = new QuestionnaireResolver(repo);
    const search = vi.spyOn(repo, 'searchResources');
    expect((await resolver.resolve(`${source.url}|1`)).id).toBe(source.id);
    expect(search).toHaveBeenCalledTimes(2);
    await resolver.resolve(`${source.url}|1`);
    expect(search).toHaveBeenCalledTimes(2);
    await repo.createResource({
      ...module('many'),
      extension: [{ url: KNOWLEDGE_CAPABILITY_URL, valueCode: 'computable' }],
    });
    await expect(new QuestionnaireResolver(repo).resolve(`${source.url}|1`)).rejects.toThrow('Ambiguous');
    expect((await new QuestionnaireResolver(repo).resolve({ reference: `Questionnaire/${source.id}` })).id).toBe(
      source.id
    );
  });

  test.each([
    'https://remote.example/Questionnaire/local',
    'Questionnaire/local/_history/1',
    'Patient/local',
    '#contained',
  ])('rejects unsupported Reference %s', async (reference) => {
    const read = vi.spyOn(repo, 'readResource');
    await expect(new QuestionnaireResolver(repo).resolve({ reference })).rejects.toThrow('local Questionnaire/id');
    expect(read).not.toHaveBeenCalled();
  });

  test.each(['https://example.org/a|', 'https://example.org/a|1|2', 'https://example.org/a#q'])(
    'rejects malformed canonical %s',
    async (canonical) => {
      await expect(new QuestionnaireResolver(repo).resolve(canonical)).rejects.toThrow('optional |version');
    }
  );
});
