// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { loadTestConfig } from '../config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import { indexDefinitionsEqual } from './migrate';
import {
  doubleEscapeSingleQuotes,
  escapeMixedCaseIdentifier,
  escapeUnicode,
  getColumns,
  getFunctionDefinition,
  parseIndexColumns,
  parseIndexDefinition,
  splitIndexColumnNames,
  tsVectorExpression,
} from './migrate-utils';
import type { IndexDefinition } from './types';

describe('migration-utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.database.runMigrations = false;
    config.database.disableRunPostDeployMigrations = true;
    await initDatabase(config);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('escapeMixedCaseIdentifier', () => {
    expect(escapeMixedCaseIdentifier('system')).toEqual('system');
    expect(escapeMixedCaseIdentifier('System')).toEqual('"System"');
    expect(escapeMixedCaseIdentifier('system__display')).toEqual('system__display');
    expect(escapeMixedCaseIdentifier('system__Display')).toEqual('"system__Display"');
  });

  test('doubleEscapeSingleQuotes', () => {
    expect(doubleEscapeSingleQuotes("to_tsvector('simple'::regconfig, value)")).toEqual(
      "to_tsvector(\\'simple\\'::regconfig, value)"
    );
  });

  test('tsVectorExpression', () => {
    expect(tsVectorExpression('simple', 'all_lower')).toEqual("to_tsvector('simple'::regconfig, all_lower)");
    expect(tsVectorExpression('simple', 'someUpper')).toEqual('to_tsvector(\'simple\'::regconfig, "someUpper")');
  });

  test('splitIndexColumnNames', () => {
    expect(splitIndexColumnNames('col1__col2___col3')).toEqual(['col1', '_col2', '__col3']);
  });

  test.each([
    ["system, to_tsvector('english'::regconfig, display)", ['system', "to_tsvector('english'::regconfig, display)"]],
  ])('parseIndexColumns %s', (input, expected) => {
    expect(parseIndexColumns(input)).toEqual(expected);
  });

  test('escapeUnicode', () => {
    expect(escapeUnicode('lighthouse')).toEqual('lighthouse');
    expect(escapeUnicode('\t')).toEqual('\t');
    expect(escapeUnicode('apple\tbanana\tcherry')).toEqual('apple\tbanana\tcherry');
    expect(escapeUnicode('\x01')).toEqual('\\x01');
    expect(escapeUnicode('\x7F')).toEqual('\\x7f');
    expect(escapeUnicode('🦄')).toEqual('\\ud83e\\udd84');
    expect(escapeUnicode('\u{1F984}')).toEqual('\\ud83e\\udd84');
    expect(escapeUnicode('\ud83e\udd84')).toEqual('\\ud83e\\udd84');
  });

  test('getColumns', async () => {
    const client = await getDatabasePool(DatabaseMode.WRITER);
    const result = await getColumns(client, 'DatabaseMigration');
    expect(result).toEqual([
      {
        defaultValue: null,
        name: 'id',
        notNull: true,
        primaryKey: true,
        type: 'INTEGER',
      },
      {
        defaultValue: null,
        name: 'version',
        notNull: true,
        primaryKey: false,
        type: 'INTEGER',
      },
      {
        defaultValue: null,
        name: 'dataVersion',
        notNull: true,
        primaryKey: false,
        type: 'INTEGER',
      },
      {
        defaultValue: 'false',
        name: 'firstBoot',
        notNull: true,
        primaryKey: false,
        type: 'BOOLEAN',
      },
    ]);
  });

  describe('getFunctionDefinition', () => {
    test('getFunctionDefinition', async () => {
      const client = await getDatabasePool(DatabaseMode.WRITER);
      const result = await getFunctionDefinition(client, 'token_array_to_text');
      expect(result).toEqual({
        name: 'token_array_to_text',
        createQuery: expect.stringContaining('CREATE OR REPLACE FUNCTION public.token_array_to_text'),
      });
    });

    test('getFunctionDefinition', async () => {
      const client = await getDatabasePool(DatabaseMode.WRITER);
      const result = await getFunctionDefinition(client, 'non_existent_function');
      expect(result).toBeUndefined();
    });
  });

  describe('parseIndexDefinition', () => {
    test('parse index', () => {
      const indexdef =
        'CREATE INDEX "DomainConfiguration_compartments_idx" ON public."DomainConfiguration" USING gin (compartments)';

      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = {
        columns: ['compartments'],
        indexType: 'gin',
        unique: false,
        indexdef,
      };

      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('parse UNIQUE index', () => {
      const indexdef = 'CREATE UNIQUE INDEX "Coding_pkey" ON public."Coding" USING btree (id)';

      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = {
        columns: ['id'],
        indexType: 'btree',
        unique: true,
        indexdef,
      };

      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('parse expressions', () => {
      const indexdef =
        'CREATE INDEX "Address_address_idx_tsv" ON public."Address" USING gin (to_tsvector(\'simple\'::regconfig, address))';

      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = {
        columns: [{ expression: "to_tsvector('simple'::regconfig, address)", name: 'address' }],
        indexType: 'gin',
        unique: false,
        indexdef,
      };
      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('parse INCLUDE', () => {
      const indexdef =
        'CREATE INDEX "Patient_Token_code_system_value_idx" ON public."Patient_Token" USING btree (code, system, value) INCLUDE ("resourceId")';

      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = {
        indexType: 'btree',
        columns: ['code', 'system', 'value'],
        include: ['resourceId'],
        unique: false,
        indexdef,
      };
      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('parse WHERE', () => {
      const indexdef =
        'CREATE INDEX "Coding_Property_target_property_coding_idx" ON public."Coding_Property" USING btree (target, property, coding) WHERE (target IS NOT NULL)';
      const def = parseIndexDefinition(indexdef);
      const expected: IndexDefinition = {
        columns: ['target', 'property', 'coding'],
        indexType: 'btree',
        where: 'target IS NOT NULL',
        unique: false,
        indexdef,
      };
      expect(def).toStrictEqual(expected);
      expect(indexDefinitionsEqual(def, expected)).toBeTruthy();
    });

    test('missing index type and columns', () => {
      const indexdef = 'CREATE INDEX "DomainConfiguration_compartments_idx" ON "DomainConfiguration"';

      expect(() => parseIndexDefinition(indexdef)).toThrow('Could not parse index type and expressions from');
    });

    test('missing index name', () => {
      const indexdef = 'CREATE INDEX ON "DomainConfiguration" USING gin ((some_column > 5))';

      expect(() => parseIndexDefinition(indexdef)).toThrow('Could not parse index name from');
    });

    test('parse unsupported index type', () => {
      const indexdef =
        'CREATE INDEX "DomainConfiguration_compartments_idx" ON "DomainConfiguration" USING bad_type (compartments)';

      expect(() => parseIndexDefinition(indexdef)).toThrow('Invalid index type: bad_type');
    });
  });
});
