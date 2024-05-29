import { readFileSync, writeFileSync } from 'node:fs';
import { evalFhirPath } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { XMLParser } from 'fast-xml-parser';
import fhirpath from 'fhirpath';

const root = './src/fhirpath/r4/';

const xmlData = readFileSync(root + 'tests-fhir-r4.xml', 'utf-8');

const resources: Record<string, Resource> = {
  observation: JSON.parse(readFileSync(root + 'observation-example.json', 'utf-8')),
  patient: JSON.parse(readFileSync(root + 'patient-example.json', 'utf-8')),
  questionnaire: JSON.parse(readFileSync(root + 'questionnaire-example.json', 'utf-8')),
  valueSet: JSON.parse(readFileSync(root + 'valueset-example-expansion.json', 'utf-8')),
};

const options = {
  attributeNamePrefix: '@_',
  attrNodeName: 'attr',
  textNodeName: '#text',
  ignoreAttributes: false,
  ignoreNameSpace: false,
  allowBooleanAttributes: true,
  parseNodeValue: true,
  parseAttributeValue: true,
  trimValues: true,
};

const parser = new XMLParser(options);
const jsonObj = parser.parse(xmlData);

const lines = [
  `
<html>
<head>
<title>FHIRPath Comparison</title>
<style>
* {
  font-size: 10px;
  font-family: monospace;
}
table {
  width: 100%;
  border-collapse: collapse;
  border-top: 0.1px solid #888;
  border-left: 0.1px solid #888;
  table-layout: fixed;
}
td, th {
  border-right: 0.1px solid #888;
  border-bottom: 0.1px solid #888;
  padding: 4px;
  width: 20%;
}
pre {
  max-height: 100px;
  overflow: hidden;
}
.good {
  background-color: #efe;
  color: #080;
}
.bad {
  background-color: #fee;
  color: #800;
}
.mixed {
  background-color: #fffcee;
  color: #860;
}
</style>
</head>
<body>
<h1>FHIRPath Comparison</h1>
<table>
<thead>
<tr>
<th>Name</th>
<th>Expression</th>
<th>Expected</th>
<th>FHIRPath.js</th>
<th>Medplum</th>
</tr>
</thead>
<tbody>
`,
];

const counts = [
  [0, 0, 0],
  [0, 0, 0],
];

function getName(obj: any): string {
  return obj['@_description'] || obj['@_name'];
}

function processTests(tests: any): void {
  if (tests.group) {
    if (Array.isArray(tests.group)) {
      tests.group.forEach(processGroup);
    } else {
      processGroup(tests.group);
    }
  }
}

function processGroup(group: any): void {
  if (group.test) {
    if (Array.isArray(group.test)) {
      group.test.forEach(processTest);
    } else {
      processTest(group.test);
    }
  }
}

function processTest(test: any): void {
  if (test['@_predicate'] === true) {
    // Ignore predicate tests
    // There is only one currently, and it is duplicative
    return;
  }

  const name = getName(test);
  lines.push('<tr>');
  lines.push(`<td>${escapeXml(name)}</td>`);

  let expr = '';
  let valid = true;

  if (typeof test.expression === 'string') {
    expr = unescapeXml(test.expression);
  } else if (typeof test.expression === 'object' && test.expression['#text']) {
    expr = unescapeXml(test.expression['#text']);
    valid = !test.expression?.['@_invalid'];
  } else {
    console.log('unknown test expression');
    console.log(test);
    console.log(test.expression);
  }

  lines.push(`<td>${escapeXml(JSON.stringify(expr))}</td>`);

  const resourceType = test['@_inputfile'].split('-')[0];
  const resource = resources[resourceType];

  let outputStr;
  let anyOutput = false;
  if (test.output && test.output['#text'] === true) {
    outputStr = JSON.stringify([true]);
  } else if (test.output && Array.isArray(test.output)) {
    outputStr = JSON.stringify(test.output.map((o: any) => o['#text']));
  } else if (test.output) {
    outputStr = JSON.stringify([test.output['#text']]);
  } else {
    anyOutput = true;
  }

  const specOutput = JSON.stringify(JSON.parse(outputStr ?? 'null'), undefined, 2);
  const fhirpathOutput = getFhirpathOutput(resource, expr);
  const medplumOutput = getMedplumOutput(resource, expr);

  let fhirpathClassName;
  if (fhirpathOutput === specOutput || (medplumOutput === fhirpathOutput && (anyOutput || !valid))) {
    fhirpathClassName = 'good';
    counts[0][0]++;
  } else if (fhirpathOutput === specOutput || medplumOutput === fhirpathOutput || anyOutput || !valid) {
    fhirpathClassName = 'mixed';
    counts[0][1]++;
  } else {
    fhirpathClassName = 'bad';
    counts[0][2]++;
  }

  let medplumClassName;
  if (medplumOutput === specOutput || (medplumOutput === fhirpathOutput && (anyOutput || !valid))) {
    medplumClassName = 'good';
    counts[1][0]++;
  } else if (medplumOutput === specOutput || medplumOutput === fhirpathOutput || anyOutput || !valid) {
    medplumClassName = 'mixed';
    counts[1][1]++;
  } else {
    medplumClassName = 'bad';
    counts[1][2]++;
  }

  if (!valid) {
    lines.push('<td>invalid</td>');
  } else if (anyOutput) {
    lines.push('<td>any</td>');
  } else {
    lines.push(`<td><pre>${escapeXml(specOutput)}</pre></td>`);
  }

  lines.push(`<td class="${fhirpathClassName}"><pre>${escapeXml(fhirpathOutput)}</pre></td>`);
  lines.push(`<td class="${medplumClassName}"><pre>${escapeXml(medplumOutput)}</pre></td>`);
  lines.push('</tr>');
}

function getFhirpathOutput(resource: Resource, expr: string): string {
  try {
    const result = fhirpath.evaluate(resource, expr);
    return JSON.stringify(result, undefined, 2);
  } catch (e) {
    return (e as Error).message;
  }
}

function getMedplumOutput(resource: Resource, expr: string): string {
  try {
    const result = evalFhirPath(expr, resource);
    return JSON.stringify(result, undefined, 2);
  } catch (e) {
    return (e as Error).message;
  }
}

function escapeXml(str: string): string {
  if (!str) {
    return str;
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return str.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

processTests(jsonObj.tests);
lines.push(`<tr><td></td><td></td><td>Good</td><td>${counts[0][0]}</td><td>${counts[1][0]}</td></tr>`);
lines.push(`<tr><td></td><td></td><td>Mixed</td><td>${counts[0][1]}</td><td>${counts[1][1]}</td></tr>`);
lines.push(`<tr><td></td><td></td><td>Bad</td><td>${counts[0][2]}</td><td>${counts[1][2]}</td></tr>`);
lines.push('</tbody', '</table', '</body', '</html>');
writeFileSync('compare.html', lines.join('\n'));
