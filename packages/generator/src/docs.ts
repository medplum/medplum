import { getExpressionForResourceType, isLowerCase } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, ElementDefinition, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import fs, { writeFileSync } from 'fs';
import { DOMWindow, JSDOM } from 'jsdom';
import * as mkdirp from 'mkdirp';
import fetch from 'node-fetch';
import * as path from 'path';
import { resolve } from 'path/posix';
import * as unzipper from 'unzipper';

import {
  DocumentationLocation,
  PropertyDocInfo,
  PropertyTypeDocInfo,
  ResourceDocsProps,
} from '../../docs/src/types/documentationTypes';

const searchParams: SearchParameter[] = [];
for (const entry of readJson('fhir/r4/search-parameters.json').entry as BundleEntry<SearchParameter>[]) {
  if (entry.resource) {
    searchParams.push(entry.resource);
  }
}
for (const entry of readJson('fhir/r4/search-parameters-medplum.json').entry as BundleEntry<SearchParameter>[]) {
  if (entry.resource) {
    searchParams.push(entry.resource);
  }
}

let documentedTypes: Record<string, DocumentationLocation>;
// a map from lowercase resource names (e.g. appointmentresponse) to camelcase names (e.g. AppointmentResponse)
let lowerCaseResourceNames: Record<string, string>;

export async function main(): Promise<void> {
  const outputFolder = path.resolve(__dirname, '..', 'output');
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  const indexedSearchParams = indexSearchParameters(searchParams);
  // Definitions for FHIR Spec resources
  const fhirCoreDefinitions = filterDefinitions(readJson(`fhir/r4/profiles-resources.json`)).filter(
    (definition) => definition.id !== 'SubscriptionStatus'
  );
  // Medplum-defined resources
  const medplumResourceDefinitions = filterDefinitions(readJson(`fhir/r4/profiles-medplum.json`));
  // StructureDefinitions for FHIR "Datatypes" (e.g. Address, ContactPoint, Identifier...)
  const fhirDatatypes = filterDefinitions(readJson(`fhir/r4/profiles-types.json`));
  // Map from resource/datatype name -> documented location
  documentedTypes = {
    ...Object.fromEntries(
      fhirCoreDefinitions.map((def): [string, DocumentationLocation] => [def.name || '', 'resource'])
    ),
    ...Object.fromEntries(fhirDatatypes.map((def): [string, DocumentationLocation] => [def.name || '', 'datatype'])),
    ...Object.fromEntries(
      medplumResourceDefinitions.map((def): [string, DocumentationLocation] => [def.name || '', 'medplum'])
    ),
  };

  lowerCaseResourceNames = Object.fromEntries(Object.keys(documentedTypes).map((e) => [e.toLowerCase(), e]));

  const fhirResourceDocs = buildDocsDefinitions(fhirCoreDefinitions, 'resource', indexedSearchParams);
  const medplumResourceDocs = buildDocsDefinitions(medplumResourceDefinitions, 'medplum', indexedSearchParams);
  const fhirDatatypeDocs = buildDocsDefinitions(fhirDatatypes, 'datatype');

  const resourceIntroductions = await fetchHtmlSpecContent(fhirCoreDefinitions);

  writeDocs(fhirResourceDocs, 'resource', resourceIntroductions);
  writeDocs(fhirDatatypeDocs, 'datatype');
  writeDocs(medplumResourceDocs, 'medplum');
}

/**
 * Indexes search parameters by "base" resource type.
 * @param searchParams - The bundle of SearchParameter resources.
 * @returns A map from resourceType -> an array of associated SearchParameters
 */
function indexSearchParameters(searchParams: SearchParameter[]): Record<string, SearchParameter[]> {
  const results = {} as Record<string, SearchParameter[]>;
  for (const searchParam of searchParams) {
    for (const resType of searchParam.base || []) {
      if (!results[resType]) {
        results[resType] = [];
      }
      results[resType].push(searchParam);
    }
  }
  return results;
}

function buildDocsDefinitions(
  definitions: StructureDefinition[],
  location: DocumentationLocation,
  indexedSearchParams?: Record<string, SearchParameter[]>
): ResourceDocsProps[] {
  const results = [];
  for (const definition of definitions) {
    results.push(buildDocsDefinition(definition, location, indexedSearchParams?.[definition.name as string]));
  }

  return results;
}

function buildDocsDefinition(
  resourceDefinition: StructureDefinition,
  location: DocumentationLocation,
  searchParameters?: SearchParameter[]
): ResourceDocsProps {
  const result = {
    name: resourceDefinition.name as string,
    location,
    description: resourceDefinition.description || '',
    properties: [] as PropertyDocInfo[],
  } as ResourceDocsProps;
  const elements = resourceDefinition.snapshot?.element || [];
  for (const element of elements) {
    const parts = element.path?.split('.') || [];
    const name = parts[parts.length - 1];
    const { path, min, max, short, definition, comment } = element;
    result.properties.push({
      name,
      depth: parts.length - 1,
      ...getPropertyTypes(element),
      path: path || '',
      min: min || 0,
      max: max || '',
      short: short || '',
      definition: definition || '',
      comment: comment || '',
      ...getInheritance(element),
    });
  }

  if (searchParameters) {
    result.searchParameters = (searchParameters || []).map((param) => ({
      name: param.name as string,
      type: param.type as
        | 'string'
        | 'number'
        | 'uri'
        | 'date'
        | 'token'
        | 'reference'
        | 'composite'
        | 'quantity'
        | 'special',
      description: getSearchParamDescription(param, result.name),
      expression: getExpressionForResourceType(result.name, param.expression || '') || (param.expression as string),
    }));
  }
  return result;
}

function buildDocsMarkdown(position: number, definition: ResourceDocsProps, resourceIntroduction?: any): string {
  const replacements: any = {
    position,
    resourceName: definition.name,
    resourceNameLowerCase: definition.name.toLowerCase(),
    description: rewriteLinksText(definition.description).replaceAll(/\s\s+/g, ' '),
    location: definition.location,
    ...resourceIntroduction,
  };

  if (['resource', 'medplum'].includes(replacements.location)) {
    replacements.searchParameterTable = `\
## Search Parameters

<SearchParamsTable searchParams={definition.searchParameters} />
`;
    replacements.inheritedPropertiesTable = `\
## Inherited Elements

<ResourcePropertiesTable properties={definition.properties.filter((p) => p.inherited && p.base.includes('Resource'))} />`;
  } else {
    replacements.searchParameterTable = '';
    replacements.inheritedPropertiesTable = '';
  }

  replacements.scopeAndUsage = createTabItem(
    replacements.scopeAndUsage && rewriteLinksText(replacements.scopeAndUsage),
    'usage',
    'Usage'
  );
  replacements.boundariesAndRelationships = createTabItem(
    replacements.boundariesAndRelationships && rewriteLinksText(replacements.boundariesAndRelationships),
    'relationships',
    'Relationships'
  );
  replacements.backgroundAndContext = createTabItem(
    replacements.backgroundAndContext && rewriteLinksText(replacements.backgroundAndContext),
    'backgroundAndContext',
    'Background and Context'
  );
  replacements.referencedBy = createTabItem(
    replacements.referencedBy?.length &&
      `<ul>${replacements.referencedBy.map((e: string) => `<li>${e}</li>`).join('\n')}</ul>`,
    'referencedBy',
    'Referenced By'
  );

  const template = `\
---
title: $resourceName$
sidebar_position: $position$
---

import Link from '@docusaurus/Link';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import definition from '@site/static/data/$location$Definitions/$resourceNameLowerCase$.json';
import { ResourcePropertiesTable, SearchParamsTable } from '@site/src/components/ResourceTables';

# $resourceName$

$description$

<Tabs queryString="section">
  <TabItem value="schema" label="Schema" default>

## Elements

<ResourcePropertiesTable
  properties={definition.properties.filter((p) => !(p.inherited && p.base.includes('Resource')))}
/>

$searchParameterTable$
$inheritedPropertiesTable$

  </TabItem>
$scopeAndUsage$
$boundariesAndRelationships$
$backgroundAndContext$
$referencedBy$
</Tabs>
`;

  let result = template;
  for (const key of Object.keys(replacements)) {
    result = result.replaceAll('$' + key + '$', replacements[key]);
  }
  result = result.replaceAll(/^\n\n+$/gm, '');
  return result;
}

function createTabItem(text: string | undefined, value: string, label: string): string {
  if (!text) {
    return '';
  }

  return `\
  <TabItem value="${value}" label="${label}">
${text}
  </TabItem>`;
}

function writeDocs(
  definitions: ResourceDocsProps[],
  location: DocumentationLocation,
  resourceIntroductions?: Record<string, any>
): void {
  console.info('Writing JS and Markdown files...');
  definitions.forEach((definition, i) => {
    const resourceType = definition.name;
    printProgress(Math.round((i / definitions.length) * 100));
    writeFileSync(
      resolve(__dirname, `../../docs/static/data/${location}Definitions/${resourceType.toLowerCase()}.json`),
      JSON.stringify(definition, null, 2) + '\n',
      'utf8'
    );

    writeFileSync(
      resolve(__dirname, `../../docs${getMedplumDocsPath(resourceType)}.mdx`),
      buildDocsMarkdown(i, definition, resourceIntroductions?.[resourceType]),
      'utf8'
    );
  });
}

function filterDefinitions(bundle: Bundle): StructureDefinition[] {
  const definitions: StructureDefinition[] =
    bundle.entry
      ?.map((e) => e.resource as StructureDefinition)
      .filter((definition) => definition.resourceType === 'StructureDefinition') || [];

  return definitions.filter(
    (definition) =>
      definition.kind &&
      ['resource', 'complex-type'].includes(definition.kind) &&
      definition.name &&
      !['Resource', 'BackboneElement', 'DomainResource', 'MetadataResource', 'Element'].includes(definition.name) &&
      !isLowerCase(definition.name[0])
  );
}

function getSearchParamDescription(searchParam: SearchParameter, resourceType: string): string {
  const desc = searchParam.description;
  if (!desc) {
    return '';
  }

  if (desc.startsWith('Multiple Resources:')) {
    const lines = desc.split('\n');
    const resourceTypeLine = lines.find((line) => line.startsWith(`* [${resourceType}]`));
    if (resourceTypeLine) {
      return resourceTypeLine.substring(resourceTypeLine.indexOf(':') + 1);
    }
  }

  return desc;
}

function getPropertyTypes(property: ElementDefinition | undefined): Pick<PropertyDocInfo, 'types' | 'referenceTypes'> {
  const type = property?.type;
  if (!type) {
    return { types: [{ datatype: '', documentLocation: undefined }] };
  }

  const types: PropertyTypeDocInfo[] = type
    .map((t) => t.code || '')
    .map((code) =>
      code === 'http://hl7.org/fhirpath/System.String'
        ? { datatype: 'string', documentLocation: undefined }
        : { datatype: code, documentLocation: documentedTypes[code] }
    );

  const referenceIndex = types.findIndex((t) => t.datatype === 'Reference');
  if (referenceIndex >= 0) {
    const referenceTypes =
      type[referenceIndex].targetProfile
        ?.filter((target) => target.includes('/fhir/StructureDefinition/'))
        .map((target) => {
          const datatype = target.split('/').pop() || '';
          return { datatype, documentLocation: documentedTypes[datatype] };
        }) || [];
    return { types, referenceTypes };
  }
  return { types };
}

function getInheritance(property: ElementDefinition): { inherited: boolean; base?: string } {
  const inheritanceBase = property.base?.path?.split('.')[0];
  const inherited = !!inheritanceBase && property.path?.split('.')[0] !== inheritanceBase;
  if (!inherited) {
    return { inherited };
  }
  return { inherited, base: inheritanceBase };
}

/**
 * Rewrite internal links from official FHIR site to medplum internal links
 * @param text - text which contains internal links
 * @returns returns text with internal links rewritten
 */
function rewriteLinksText(text: string | undefined): string {
  if (!text) {
    return '';
  }
  // Replace relative links in StructureDefinition.description with absolute links
  text = text
    .replace('(operations.html)', '(/docs/api/fhir/operations)')
    .replace('(terminologies.html)', '(https://www.hl7.org/fhir/terminologies.html)');

  // Replace datatype internal links
  const datatypeLinkPattern = /datatypes.html#([a-zA-Z-]+)/g;
  const dtMatches = text.matchAll(datatypeLinkPattern);

  for (const match of dtMatches) {
    if (match[1] in documentedTypes) {
      text = text.replace(match[0], `/api/fhir/datatypes/${match[1].toLowerCase()}`);
    } else {
      text = text.replace(match[0], `https://www.hl7.org/fhir/datatypes.html#${match[1]}`);
    }
  }

  // Replace all the links of [[[Type]]] with internal links
  const typeLinks = Array.from(text.matchAll(/\[\[\[([A-Z][a-z]*)*\]\]\]/gi));
  for (const match of typeLinks) {
    text = text.replace(match[0], `[${match[1]}](./${match[1].toLowerCase()})`);
  }

  // Replace names of all Resources/datatypes with internal links
  const documentedTypeNames = Object.keys(documentedTypes);
  const resourceTypeExp = `(${documentedTypeNames.join('|')})`;
  const resourceNameTextExp = new RegExp(`\\s(${resourceTypeExp}[s]?)\\b`, 'g');
  text = text.replaceAll(
    resourceNameTextExp,
    (_, resourceText, resourceName) => ` <Link to="${getMedplumDocsPath(resourceName)}">${resourceText}</Link>`
  );

  const resourceNameLinkExp = new RegExp(`(\\[(.*?)\\])\\(${resourceTypeExp}.html\\)`, 'gi');
  text = text.replaceAll(
    resourceNameLinkExp,
    (...matches: string[]) =>
      `<Link to="${getMedplumDocsPath(lowerCaseResourceNames[matches[3].toLowerCase()])}">${matches[2]}</Link>`
  );

  return text;
}

/**
 * Download a Zip file from the given URL, and unzip to the given path
 * @param downloadURL - Source URL
 * @param zipFilePath - Destination path for *.zip
 * @param outputFolder - Destination path for extracted contents
 */
async function downloadAndUnzip(downloadURL: string, zipFilePath: string, outputFolder: string): Promise<void> {
  console.info('Downloading FHIR Spec...');
  return new Promise((resolve, reject) => {
    fetch(downloadURL)
      .then((response) => {
        if (!response.ok) {
          reject(new Error(`Error downloading file: ${response.status} ${response.statusText}`));
          return;
        }

        const fileStream = fs.createWriteStream(zipFilePath);
        response.body.pipe(fileStream);

        // Inside your 'downloadAndUnzip' function, replace the extraction part with this:
        fileStream.on('finish', async () => {
          fs.createReadStream(zipFilePath)
            .pipe(unzipper.Parse())
            .on('entry', function (entry) {
              const fileName = entry.path;
              const type = entry.type; // 'Directory' or 'File'
              const fullPath = path.join(outputFolder, fileName).replaceAll('\\', '/');

              if (type === 'Directory') {
                mkdirp.sync(fullPath);
                entry.autodrain();
              } else {
                mkdirp.sync(path.dirname(fullPath));
                entry.pipe(fs.createWriteStream(fullPath));
              }
              console.info('\rDownloading FHIR Spec...');
            })
            .on('close', resolve)
            .on('error', reject);
        });
      })
      .catch(() => {
        reject(new Error('Error downloading or unzipping file'));
      });
  });
}
/**
 * For each core FHIR resource type, find the corresponding HTML page and extract the relevant introductory sections.
 * @param htmlDirectory - Directory containing HTML files for each resource ([resourceType].html)
 * @param definitions - Array of all core FHIR StructureDefinitions
 * @returns A map from resourcename to html description data
 */
function extractResourceDescriptions(
  htmlDirectory: string,
  definitions: StructureDefinition[]
): Record<string, Record<string, string | string[] | undefined>> {
  const results: Record<string, Record<string, string | string[] | undefined>> = {};

  console.info('Extracting HTML descriptions...');
  for (let i = 0; i < definitions.length; i++) {
    printProgress(Math.round((i / definitions.length) * 100));
    const definition = definitions[i];
    const resourceType = definition.name;
    const fileName = path.resolve(htmlDirectory, `${resourceType?.toLowerCase()}.html`);
    if (resourceType && fs.existsSync(fileName)) {
      const fileContent = fs.readFileSync(fileName, 'utf-8');
      const dom = new JSDOM(fileContent);
      const document = dom.window.document;

      const resourceContents: Record<string, string | string[] | undefined> = { referencedBy: [] };

      // find the divs
      const divs = document.getElementsByTagName('div');
      for (const div of divs) {
        const h2 = div.querySelector('h2');
        if (h2) {
          const h2Text = h2.textContent?.toLowerCase().replace(/\s/g, '') || '';

          const paragraphHTML = sanitizeNodeContent(div, dom.window);

          if (h2Text.includes('scopeandusage')) {
            resourceContents.scopeAndUsage = paragraphHTML;
          } else if (h2Text.includes('backgroundandcontext')) {
            resourceContents.backgroundAndContext = paragraphHTML;
          } else if (h2Text.includes('boundariesandrelationships')) {
            resourceContents.boundariesAndRelationships = paragraphHTML;
          }
        }
      }

      // find referencedBy
      const pElements = document.querySelectorAll('p');
      for (const p of pElements) {
        if (p.textContent?.trim().startsWith('This resource is referenced by')) {
          const aElements = p.querySelectorAll('a');
          resourceContents['referencedBy'] = Array.from(aElements).map((a) => {
            rewriteHtmlSpecHref(a);
            return a.outerHTML;
          });
        }
      }
      results[resourceType] = resourceContents;
    }
  }

  console.info('Done');

  return results;
}

/**
 * Converts local links to FHIR resources from the FHIR site to relative links in the medplum documentation site
 * @param anchorElement - An Anchor tag, potentially referring to a resource page (e.g. "appointmentresponse.html")
 */
function rewriteHtmlSpecHref(anchorElement: HTMLAnchorElement): void {
  const href = anchorElement.getAttribute('href'); // Get the href attribute of the anchor tag

  // Try to match the href to the expected format
  const match = href?.match(/^(http[s]?:\/\/)?(\S+?)(\.html)?(#\w+)?$/);
  if (match) {
    const http = match[1];
    const resourceType = match[2];
    // If the URL is absolute, don't do anything
    if (http || match[0]?.startsWith('/')) {
      return;
    }

    // If it is a relative URL, check if it is a link to a resource page.
    // If yes, rewrite to medplum docs URL
    // If no, convert to an absolute URL
    let newHref = match[0];
    const resourceName = lowerCaseResourceNames[resourceType];
    if (resourceName) {
      // Update the href attribute of the anchor tag
      newHref = getMedplumDocsPath(resourceName);
    } else {
      newHref = `https://www.hl7.org/fhir/${newHref}`;
    }
    anchorElement.setAttribute('href', newHref);
  }
}

function sanitizeNodeContent(node: HTMLElement, window: DOMWindow): string {
  // Clone the div to keep original div intact.
  const clonedDiv = node.cloneNode(true) as HTMLElement;

  // Recursive function to remove comment nodes and style attributes.
  function removeUnwantedNodes(node: Node): void {
    Array.from(node.childNodes).forEach((child: Node) => {
      if (child.nodeType === 8) {
        // Node.COMMENT_NODE
        node.removeChild(child);
      } else {
        if (node instanceof window.Element) {
          if (node.getAttribute('style')) {
            node.removeAttribute('style');
          }

          if (node.tagName.toLowerCase() === 'a') {
            rewriteHtmlSpecHref(node as HTMLAnchorElement);
          }
        }
        removeUnwantedNodes(child);
      }
    });
  }

  // Remove img tags.
  const imgElements = clonedDiv.getElementsByTagName('img');
  for (const img of Array.from(imgElements)) {
    img.parentNode?.removeChild(img);
  }

  // Remove svg tags.
  const svgElements = clonedDiv.getElementsByTagName('svg');
  for (const svg of Array.from(svgElements)) {
    svg.parentNode?.removeChild(svg);
  }

  // Remove h2 tags.
  const h2Elements = clonedDiv.getElementsByTagName('h2');
  for (const h2 of Array.from(h2Elements)) {
    h2.parentNode?.removeChild(h2);
  }

  // Remove span elements with class 'sectioncount'.
  const spanElements = clonedDiv.querySelectorAll('span.sectioncount');
  for (const span of Array.from(spanElements)) {
    span.parentNode?.removeChild(span);
  }

  // Remove p elements containing the text "Trial-Use Note".
  if (clonedDiv.nodeName.toLowerCase() === 'p' && clonedDiv.textContent?.includes('Trial-Use Note')) {
    clonedDiv.parentNode?.removeChild(node);
  }

  // Remove comment nodes and style attributes.
  removeUnwantedNodes(node);

  let result = clonedDiv.outerHTML.replaceAll('<br>', '<br/>');
  result = result.replaceAll(/[\n\t]+/g, ' ');
  result = result.replaceAll('<sup>*</sup>', '<sup>†</sup>');

  // Replace br tags with closed ones.
  return result;
}

/**
 * Download the "entire fhir spec" as a zip file, and parse the HTML file for each resource to extract the detailed
 * information about usage and scope for each resource
 * @param definitions - FHIR core profile definitions
 * @returns Map from resource name to extracted HTML data
 */
async function fetchHtmlSpecContent(
  definitions: StructureDefinition[]
): Promise<Record<string, Record<string, string | string[] | undefined>>> {
  const downloadURL = 'http://hl7.org/fhir/R4/fhir-spec.zip';
  const zipFile = path.resolve(__dirname, '..', 'output', 'fhir-spec.zip');
  const outputFolder = path.resolve(__dirname, '..', 'output', 'fhir-spec');
  const siteDir = path.resolve(outputFolder, 'site');
  if (!fs.existsSync(outputFolder)) {
    return downloadAndUnzip(downloadURL, zipFile, outputFolder).then(() => {
      return extractResourceDescriptions(siteDir, definitions);
    });
  } else {
    const results = extractResourceDescriptions(siteDir, definitions);
    return results;
  }
}

function getMedplumDocsPath(typeName: string): string {
  let location = documentedTypes[typeName] as string;
  if (location !== 'medplum' && location.endsWith('e')) {
    location = location + 's';
  }
  return `/docs/api/fhir/${location}/${typeName.toLowerCase()}`;
}

function printProgress(progress: number): void {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  process.stdout.write(progress + '%');
}

if (process.argv[1].endsWith('docs.ts')) {
  main().catch(console.error);
}
