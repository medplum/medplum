import { CodeSystem, Coding } from '@medplum/fhirtypes';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { cpt, cvx, icd10cm, icd10pcs, loinc, rxnorm, snomed } from './codesystems';
import { env } from 'node:process';

/**
 * This utility generates data for ValueSet and ConceptMap resources from the UMLS Metathesaurus.
 *
 * The source files provided by UMLS are quite large (GB+) and are not included in this repository.
 *
 * The objective of this utility is to generate a subset of the UMLS that is useful for the Medplum FHIR server.
 *
 * Requirements:
 *
 * - Download the UMLS Metathesaurus from https://www.nlm.nih.gov/research/umls/licensedcontent/umlsknowledgesources.html
 * - For terminology alone, only MRCONSO.RRF is required
 * - For terminology and concept maps, both MRCONSO.RRF and MRMAP.RRF are required
 *
 * Most recently tested with the 2022AB release.
 *
 * References:
 *
 * UMLS Metathesaurus Vocabulary Documentation
 * https://www.nlm.nih.gov/research/umls/sourcereleasedocs/index.html
 *
 * 2022AB Release Documentation
 * https://www.nlm.nih.gov/research/umls/knowledge_sources/metathesaurus/release/index.html
 *
 * Columns and Data Elements - 2022AB
 * https://www.nlm.nih.gov/research/umls/knowledge_sources/metathesaurus/release/columns_data_elements.html
 *
 * Abbreviations Used in Data Elements - 2022AB Release
 * https://www.nlm.nih.gov/research/umls/knowledge_sources/metathesaurus/release/abbreviations.html
 */

async function main(): Promise<void> {
  if (!existsSync('./output')) {
    mkdirSync('./output');
  }

  const mappedCodes = await processConcepts();
  console.log('\n');
  await processProperties();
  console.log('\n');
  const relationshipProperties = await prepareRelationshipProperties();
  await processRelationships(relationshipProperties, mappedCodes);
}

/** @see https://www.ncbi.nlm.nih.gov/books/NBK9685/table/ch03.T.concept_names_and_sources_file_mr */
class UmlsConcept {
  /** Unique identifier for concept, assigned by UMLS. */
  readonly CUI: string;
  /** Language of Term(s), e.g. "ENG" */
  readonly LAT: string;
  /** Term status, e.g. "P" (preferred) or "S" (non-preferred).  This indicates whether UMLS prefers this specific word choice overall, not whether the term is preferred in its code system. */
  readonly TS: string;
  /**  Unique identifier for term, assigned by UMLS. */
  readonly LUI: string;
  /**
   * String type.  This indicates the UMLS-preferred word order, not whether the code system itself prefers it.
   *
   * PF = Preferred form of term
   * VCW = Case and word-order variant of the preferred form
   * VC = Case variant of the preferred form
   * VO = Variant of the preferred form
   * VW = Word-order variant of the preferred form
   */
  readonly STT: string;
  /** Unique identifier for string. */
  readonly SUI: string;
  /** Indicates whether this coding is preferred in its own code system, either "Y" (preferred) or "N" (non-preferred). */
  readonly ISPREF: string;
  /** Atom Unique Identifiers. */
  readonly AUI: string;
  /** Source asserted atom identifier. */
  readonly SAUI: string;
  /** Source asserted concept identifier. */
  readonly SCUI: string;
  /** Source asserted descriptor identifier. */
  readonly SDUI: string;
  /**
   * Source abbreviation.  This uniquely identifies the underlying source vocabulary.
   *
   * @see https://www.nlm.nih.gov/research/umls/sourcereleasedocs/index.html
   */
  readonly SAB: string;
  /**
   * Term type in source, e.g. "PT" (Preferred Term).  This identifies the type of display string this term represents.
   *
   * @see https://www.nlm.nih.gov/research/umls/knowledge_sources/metathesaurus/release/abbreviations.html#mrdoc_TTY
   */
  readonly TTY: string;
  /** Unique Identifier or code for string in source. */
  readonly CODE: string;
  /** String description for the code. */
  readonly STR: string;
  /** Source Restriction Level. */
  readonly SRL: string;
  /**
   * Suppressible flag.
   *
   * O = All obsolete content, whether they are obsolesced by the source or by NLM
   * E = Non-obsolete content marked suppressible by an editor
   * Y = Non-obsolete content deemed suppressible during inversion
   * N = None of the above (not suppressible)
   */
  readonly SUPPRESS;

  constructor(line: string) {
    [
      this.CUI,
      this.LAT,
      this.TS,
      this.LUI,
      this.STT,
      this.SUI,
      this.ISPREF,
      this.AUI,
      this.SAUI,
      this.SCUI,
      this.SDUI,
      this.SAB,
      this.TTY,
      this.CODE,
      this.STR,
      this.SRL,
      this.SUPPRESS,
    ] = line.split('|');
  }
}

const umlsSources: Record<string, { system: string; tty: string; resource: CodeSystem }> = {
  SNOMEDCT_US: { system: 'http://snomed.info/sct', tty: 'FN', resource: snomed },
  LNC: { system: 'http://loinc.org', tty: 'LC', resource: loinc },
  RXNORM: { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', tty: 'PSN', resource: rxnorm },
  CPT: { system: 'http://www.ama-assn.org/go/cpt', tty: 'PT', resource: cpt },
  CVX: { system: 'http://hl7.org/fhir/sid/cvx', tty: 'PT', resource: cvx },
  ICD10PCS: { system: 'http://hl7.org/fhir/sid/icd-10-pcs', tty: 'PT', resource: icd10pcs },
  ICD10CM: { system: 'http://hl7.org/fhir/sid/icd-10-cm', tty: 'PT', resource: icd10cm },
};

async function processConcepts(): Promise<Record<string, string>> {
  const inStream = createReadStream(resolve(__dirname, '2023AB/META/MRCONSO.RRF'));
  const rl = createInterface(inStream);

  let processed = 0;
  let skipped = 0;
  const counts = Object.create(null) as Record<string, number>;
  const codings = Object.create(null) as Record<string, Coding[]>;
  const mappedCodes: Record<string, string> = Object.create(null);

  for await (const line of rl) {
    const concept = new UmlsConcept(line);
    const source = umlsSources[concept.SAB];
    if (!source) {
      // Ignore unknown code system
      continue;
    } else if (concept.LAT !== 'ENG') {
      // Ignore non-English
      continue;
    } else if (concept.TTY !== source.tty) {
      // Use only preferred term type for the display string
      continue;
    } else if (concept.SUPPRESS !== 'N') {
      // Skip suppressible terms
      skipped++;
      continue;
    }

    const coding = { code: concept.CODE, display: concept.STR };
    processed++;
    counts[source.system] = (counts[source.system] ?? 0) + 1;
    let foundCodings = codings[source.system];
    if (foundCodings) {
      foundCodings.push(coding);
    } else {
      foundCodings = [coding];
    }

    if (foundCodings.length >= 500) {
      await sendCodings(foundCodings, source.system);
      codings[source.system] = [];
    } else {
      codings[source.system] = foundCodings;
    }
    mappedCodes[concept.CUI] = concept.CODE;
  }

  for (const [system, foundCodings] of Object.entries(codings)) {
    if (foundCodings.length > 0) {
      await sendCodings(foundCodings, system);
    }
  }
  console.log(`Found ${fmtNum(processed)} codes`);
  console.log(`(skipped ${fmtNum(skipped)})`);
  console.log(`==============================`);
  for (const [systemUrl, count] of Object.entries(counts).sort((l, r) => r[1] - l[1])) {
    console.log(`${systemUrl}: ${fmtNum(count)}`);
  }

  return mappedCodes;
}

async function sendCodings(codings: Coding[], system: string): Promise<void> {
  const parameters = {
    resourceType: 'Parameters',
    parameter: [{ name: 'system', valueUri: system }, ...codings.map((c) => ({ name: 'concept', valueCoding: c }))],
  };
  if (env.DEBUG) {
    console.log(`Processed ${parameters.parameter.length - 1} ${system} codings, ex:`, parameters.parameter[1]);
  }
}

class UmlsDoc {
  /** Data element or attribute. */
  readonly DOCKEY: string;
  /** Abbreviation that is one of its values. */
  readonly VALUE: string;
  /** Type of information in EXPL column. */
  readonly TYPE: string;
  /** Explanation of VALUE. */
  readonly EXPL: string;

  constructor(line: string) {
    [this.DOCKEY, this.VALUE, this.TYPE, this.EXPL] = line.split('|');
  }
}

async function prepareRelationshipProperties(): Promise<Record<string, string>> {
  const inStream = createReadStream(resolve(__dirname, '2023AB/META/MRDOC.RRF'));
  const rl = createInterface(inStream);

  const propertyMappings: Record<
    string,
    {
      rel?: string;
      rela?: string;
    }
  > = Object.create(null);
  for await (const line of rl) {
    const doc = new UmlsDoc(line);
    if (doc.DOCKEY === 'REL' && doc.TYPE === 'snomedct_rel_mapping') {
      propertyMappings[doc.VALUE] = { ...propertyMappings[doc.VALUE], rel: doc.EXPL };
    } else if (doc.DOCKEY === 'RELA' && doc.TYPE === 'snomedct_rela_mapping') {
      propertyMappings[doc.VALUE] = { ...propertyMappings[doc.VALUE], rela: doc.EXPL };
    }
  }
  return Object.fromEntries(
    Object.entries(propertyMappings).map(([property, { rel, rela }]) => [
      `SNOMEDCT_US/${rel ?? ''}/${rela ?? ''}`,
      property,
    ])
  );
}

/** @see https://www.ncbi.nlm.nih.gov/books/NBK9685/table/ch03.T.simple_concept_and_atom_attribute */
class UmlsAttribute {
  /** Unique identifier for concept (if METAUI is a relationship identifier, this will be CUI1 for that relationship). */
  readonly CUI: string;
  /** Unique identifier for term (optional - present for atom attributes, but not for relationship attributes). */
  readonly LUI: string;
  /** Unique identifier for string (optional - present for atom attributes, but not for relationship attributes). */
  readonly SUI: string;
  /** Metathesaurus atom identifier (will have a leading A) or Metathesaurus relationship identifier (will have a leading R) or blank if it is a concept attribute. */
  readonly METAUI: string;
  /** The name of the column in MRCONSO.RRF or MRREL.RRF that contains the identifier to which the attribute is attached, i.e. AUI, CODE, CUI, RUI, SCUI, SDUI. */
  readonly STYPE: string;
  /** Most useful source asserted identifier (if the source vocabulary contains more than one) or a Metathesaurus-generated source entry identifier (if the source vocabulary has none). Optional - present if METAUI is an AUI. */
  readonly CODE: string;
  /** Unique identifier for attribute. */
  readonly ATUI: string;
  /** Source asserted attribute identifier (optional - present if it exists). */
  readonly SATUI: string;
  /**
   * Attribute name.
   *
   * @see http://www.nlm.nih.gov/research/umls/knowledge_sources/metathesaurus/release/attribute_names.html
   */
  readonly ATN: string;
  /**
   * Source abbreviation.  This uniquely identifies the underlying source vocabulary.
   *
   * @see https://www.nlm.nih.gov/research/umls/sourcereleasedocs/index.html
   */
  readonly SAB: string;
  /**
   * Attribute value described under specific attribute name on the Attributes Names page.
   *
   * @see http://www.nlm.nih.gov/research/umls/knowledge_sources/metathesaurus/release/abbreviations.html
   */
  readonly ATV: string;
  /**
   * Suppressible flag.
   *
   * O = All obsolete content, whether they are obsolesced by the source or by NLM
   * E = Non-obsolete content marked suppressible by an editor
   * Y = Non-obsolete content deemed suppressible during inversion
   * N = None of the above (not suppressible)
   */
  readonly SUPPRESS;

  constructor(line: string) {
    [
      this.CUI,
      this.LUI,
      this.SUI,
      this.METAUI,
      this.STYPE,
      this.CODE,
      this.ATUI,
      this.SATUI,
      this.ATN,
      this.SAB,
      this.ATV,
      this.SUPPRESS,
    ] = line.split('|');
  }
}

const mappedProperties: Record<string, string> = {
  LOINC_COMPONENT: 'COMPONENT',
  LOINC_METHOD_TYP: 'METHOD_TYP',
  LOINC_PROPERTY: 'PROPERTY',
  LOINC_SCALE_TYP: 'SCALE_TYP',
  LOINC_SYSTEM: 'SYSTEM',
  LOINC_TIME_ASPECT: 'TIME_ASPCT',
  LOR: 'ORDER_OBS',
  LQS: 'SURVEY_QUEST_SRC',
  LQT: 'SURVEY_QUEST_TEXT',
  LRN2: 'RELATEDNAMES2',
  LCL: 'CLASS',
  LCN: 'CLASSTYPE',
  LCS: 'STATUS',
  LCT: 'CHNG_TYPE',
  LEA: 'EXMPL_ANSWERS',
  LFO: 'FORMULA',
  LMP: 'MAP_TO',
  LUR: 'UNITSREQUIRED',
  LC: 'LONG_COMMON_NAME',
};

type Property = {
  code: string;
  property: string;
  value: string;
};

async function processProperties(): Promise<void> {
  const inStream = createReadStream(resolve(__dirname, '2023AB/META/MRSAT.RRF'));
  const rl = createInterface(inStream);

  let processed = 0;
  let skipped = 0;
  const counts = Object.create(null) as Record<string, number>;
  const properties: Record<string, Property[]> = Object.create(null);

  for await (const line of rl) {
    const attr = new UmlsAttribute(line);
    const source = umlsSources[attr.SAB];
    if (!source?.resource?.property?.length) {
      // Ignore unknown code system or one with no properties
      continue;
    } else if (attr.SUPPRESS !== 'N') {
      // Skip suppressible terms
      skipped++;
      continue;
    }

    for (const property of source.resource.property) {
      if (attr.ATN === property.code || mappedProperties[attr.ATN] === property.code) {
        const key = `${source.system}|${property.code}`;
        counts[key] = (counts[key] ?? 0) + 1;
        const prop = { code: attr.CODE, property: property.code, value: attr.ATV };
        let foundProperties = properties[source.system];
        if (foundProperties) {
          foundProperties.push(prop);
        } else {
          foundProperties = [prop];
        }

        if (foundProperties.length >= 500) {
          await sendProperties(properties[source.system], source.system);
          properties[source.system] = [];
        } else {
          properties[source.system] = foundProperties;
        }
      }
    }
    processed++;
  }

  for (const [system, foundProperties] of Object.entries(properties)) {
    if (foundProperties.length > 0) {
      await sendProperties(foundProperties, system);
    }
  }
  console.log(`Found ${fmtNum(processed)} code properties`);
  console.log(`(skipped ${fmtNum(skipped)})`);
  console.log(`==============================`);
  for (const [property, count] of Object.entries(counts).sort(
    (l, r) => r[0].split('|', 1)[0].localeCompare(l[0].split('|', 1)[0]) || r[1] - l[1]
  )) {
    console.log(`${property}: ${fmtNum(count)}`);
  }
}

/** @see https://www.ncbi.nlm.nih.gov/books/NBK9685/table/ch03.T.related_concepts_file_mrrel_rrf */
class UmlsRelationship {
  /** Unique identifier of first concept. */
  readonly CUI1: string;
  /** Unique identifier of first atom. */
  readonly AUI1: string;
  /**
   * The name of the column in MRCONSO.RRF that contains the identifier used for the first element in the relationship,
   * i.e. AUI, CODE, CUI, SCUI, SDUI.
   */
  readonly STYPE1: string;
  /** Relationship of second concept or atom to first concept or atom. */
  readonly REL: string;
  /** Unique identifier of second concept. */
  readonly CUI2: string;
  /** Unique identifier of second atom. */
  readonly AUI2: string;
  /**
   * The name of the column in MRCONSO.RRF that contains the identifier used for the second element in the relationship,
   * i.e. AUI, CODE, CUI, SCUI, SDUI.
   */
  readonly STYPE2: string;
  /** Additional (more specific) relationship label (optional). */
  readonly RELA: string;
  /** Unique identifier of relationship. */
  readonly RUI: string;
  /** Source asserted relationship identifier, if present. */
  readonly SRUI: string;
  /**
   * Source abbreviation.  This uniquely identifies the underlying source vocabulary.
   *
   * @see https://www.nlm.nih.gov/research/umls/sourcereleasedocs/index.html
   */
  readonly SAB: string;
  /** Source of relationship labels. */
  readonly SL: string;
  /** Relationship group. Used to indicate that a set of relationships should be looked at in conjunction. */
  readonly RG: string;
  /**
   * Source asserted directionality flag.
   *
   * 'Y' indicates that this is the direction of the relationship in its source; 'N' indicates that it is not;
   * a blank indicates that it is not important or has not yet been determined.
   */
  readonly DIR: string;
  /**
   * Suppressible flag.
   *
   * O = All obsolete content, whether they are obsolesced by the source or by NLM
   * E = Non-obsolete content marked suppressible by an editor
   * Y = Non-obsolete content deemed suppressible during inversion
   * N = None of the above (not suppressible)
   */
  readonly SUPPRESS: string;

  constructor(line: string) {
    [
      this.CUI1,
      this.AUI1,
      this.STYPE1,
      this.REL,
      this.CUI2,
      this.AUI2,
      this.STYPE2,
      this.RELA,
      this.RUI,
      this.SRUI,
      this.SAB,
      this.SL,
      this.RG,
      this.DIR,
      this.SUPPRESS,
    ] = line.split('|');
  }
}

const PARENT_PROPERTY = 'http://hl7.org/fhir/concept-properties#parent';
const CHILD_PROPERTY = 'http://hl7.org/fhir/concept-properties#child';

async function processRelationships(
  relationshipProperties: Record<string, string>,
  mappedCodes: Record<string, string>
): Promise<void> {
  const inStream = createReadStream(resolve(__dirname, '2023AB/META/MRREL.RRF'));
  const rl = createInterface(inStream);

  let processed = 0;
  let skipped = 0;
  const counts = Object.create(null) as Record<string, number>;
  const properties: Record<string, Property[]> = Object.create(null);

  for await (const line of rl) {
    const rel = new UmlsRelationship(line);
    const source = umlsSources[rel.SAB];
    if (!source) {
      // Ignore unknown code system
      continue;
    } else if (rel.SUPPRESS !== 'N') {
      skipped++;
      continue;
    }

    let property: Property | undefined;
    const code = mappedCodes[rel.CUI1];
    const value = mappedCodes[rel.CUI2];

    let propertyName = relationshipProperties[rel.SAB + '/' + rel.REL + '/' + rel.RELA];
    if (propertyName) {
      const key = `${source.system}|${propertyName} (${rel.REL}/${rel.RELA})`;
      counts[key] = (counts[key] ?? 0) + 1;
      property = { code, property: propertyName, value };
    }
    if (rel.REL === 'PAR') {
      propertyName = source.resource.property?.find((p) => p.uri === PARENT_PROPERTY)?.code ?? '';
    } else if (rel.REL === 'CHD') {
      propertyName = source.resource.property?.find((p) => p.uri === CHILD_PROPERTY)?.code ?? '';
    }
    if (propertyName) {
      const key = `${source.system}|${propertyName} (${rel.REL}/${rel.RELA})`;
      counts[key] = (counts[key] ?? 0) + 1;
      property = { code, property: propertyName, value };
    } else {
      // Ignore unknown property
      continue;
    }

    let foundProperties = properties[source.system];
    if (foundProperties) {
      foundProperties.push(property);
    } else {
      foundProperties = [property];
    }

    if (foundProperties.length >= 500) {
      await sendProperties(properties[source.system], source.system);
      properties[source.system] = [];
    } else {
      properties[source.system] = foundProperties;
    }

    processed++;
  }

  for (const [system, foundProperties] of Object.entries(properties)) {
    if (foundProperties.length > 0) {
      await sendProperties(foundProperties, system);
    }
  }
  console.log(`Found ${fmtNum(processed)} relationship properties`);
  console.log(`(skipped ${fmtNum(skipped)})`);
  console.log(`==============================`);
  for (const [property, count] of Object.entries(counts).sort(
    (l, r) => r[0].split('|', 1)[0].localeCompare(l[0].split('|', 1)[0]) || r[1] - l[1]
  )) {
    console.log(`${property}: ${fmtNum(count)}`);
  }
}

async function sendProperties(properties: Property[], system: string): Promise<void> {
  const parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'system', valueUri: system },
      ...properties.map((p) => ({
        name: 'property',
        part: [
          { name: 'code', valueCode: p.code },
          { name: 'property', valueCode: p.property },
          { name: 'value', valueString: p.value },
        ],
      })),
    ],
  };
  if (env.DEBUG) {
    console.log(`Processed ${parameters.parameter.length - 1} ${system} properties, ex:`, parameters.parameter[1]);
  }
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US', { useGrouping: true }).format(n);
}

if (require.main === module) {
  main()
    .then(() => console.log('Done'))
    .catch(console.error);
}
