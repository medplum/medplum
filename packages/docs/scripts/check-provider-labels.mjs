// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global console */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Read the navigation declaration without importing the Provider application or its dependencies.
const root = new URL('../../../', import.meta.url);
const navigationPath = 'examples/medplum-provider/src/pages/patient/PatientPage.utils.ts';
const navigation = ts.createSourceFile(navigationPath, readFileSync(new URL(navigationPath, root), 'utf8'), ts.ScriptTarget.Latest);
const tabs = navigation.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => statement.declarationList.declarations)
  .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'PatientPageTabs')?.initializer;
assert(tabs && ts.isArrayLiteralExpression(tabs), `Cannot read PatientPageTabs in ${navigationPath}`);

function stringProperty(object, name) {
  const property = object.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(navigation) === name);
  assert(property && ts.isStringLiteral(property.initializer), `Expected a literal ${name} in PatientPageTabs`);
  return property.initializer.text;
}

const orders = tabs.elements.find((tab) => ts.isObjectLiteralExpression(tab) && stringProperty(tab, 'id') === 'orders');
assert(orders, 'Orders tab is missing; update its Provider documentation.');
const label = stringProperty(orders, 'label');

const docs = new URL('packages/docs/content/docs/provider/', root);
const guide = readFileSync(new URL('labs.md', docs), 'utf8');
const index = readFileSync(new URL('_index.md', docs), 'utf8');
const title = /^title: (.+)$/m.exec(guide)?.[1].replace(/^(['"])(.*)\1$/, '$2');

// Allow a scope qualifier such as "(Labs & Imaging)" while keeping the app label recognizable.
assert(title === label || title?.startsWith(`${label} (`), `labs.md title must start with the Provider tab label "${label}"`);
assert(index.includes(`[${title}](/docs/provider/labs)`), 'Provider index link must use the Orders guide title.');
assert(guide.includes(`select **${label}**`), `Orders guide instructions must use the Provider tab label "${label}"`);

console.log('Provider Orders label matches the guide title, index link, and navigation instructions.');
