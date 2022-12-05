import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

/**
 * This utilitity generates data for ValueSet and ConceptMap resources from the UMLS Metathesaurus.
 *
 * The source files provided by UMLS are quite large (GB+) and are not included in this repository.
 *
 * The objective of this utility is to generate a subset of the UMLS that is useful for the Medplum FHIR server.
 *
 * Output format is a tab-delimited file with the following columns:
 *
 * - code
 * - display
 *
 * Outputs:
 *
 * - output/icd10.txt (23MB) - ICD-10-CM and ICD-10-PCS codes
 * - output/loinc.txt (12MB) - LOINC codes
 * - output/rxnorm.txt (9MB) - RxNorm codes
 * - output/snomed.txt (14MB) - SNOMED CT codes
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

  await processMrconso();
}

async function processMrconso(): Promise<void> {
  const inStream = createReadStream('MRCONSO.RRF');
  const rl = createInterface(inStream);

  const snomedStream = createWriteStream('./output/snomed.txt');
  const loincStream = createWriteStream('./output/loinc.txt');
  const rxnormStream = createWriteStream('./output/rxnorm.txt');
  const icd10Stream = createWriteStream('./output/icd10.txt');

  for await (const line of rl) {
    // Columns:
    // 0   CUI       Unique identifier for concept
    // 1   LAT       Language of Term(s)
    // 2   TS        Term status
    // 3   LUI       Unique identifier for term
    // 4   STT       String type
    // 5   SUI       Unique identifier for string
    // 6   ISPREF    Indicates whether AUI is preferred
    // 7   AUI       Atom Unique Identifiers (AUI)
    // 8   SAUI      Source asserted atom identifier
    // 9   SCUI      Source asserted concept identifier
    // 10  SDUI      Source asserted descriptor identifier
    // 11  SAB       Source abbreviation
    // 12  TTY       Term type in source
    // 13  CODE      Unique Identifier or code for string in source
    // 14  STR       String
    // 15  SRL       Source Restriction Level
    // 16  SUPPRESS  Suppressible flag
    const columns = line.split('|');

    // Language of Term(s)
    if (columns[1] !== 'ENG') {
      // Ignore non-english
      continue;
    }

    // TS Term status
    // P = Preferred LUI of the CUI
    // S = Non-Preferred LUI of the CUI
    if (columns[2] !== 'P') {
      // Ignore non-preferred terms
      continue;
    }

    // STT String type
    // PF = Preferred form of term
    // VCW = Case and word-order variant of the preferred form
    // VC = Case variant of the preferred form
    // VO = Variant of the preferred form
    // VW = Word-order variant of the preferred form
    if (columns[4] !== 'PF') {
      // Ignore non-preferred terms
      continue;
    }

    // ISPREF Indicates whether AUI is preferred
    if (columns[6] !== 'Y') {
      // Ignore non-preferred terms
      continue;
    }

    // TTY Term type in source
    if (columns[12] === 'ET') {
      // Ignore "Entry Term"
      continue;
    }

    // SUPPRESS Suppressible flag
    if (columns[16] === 'Y') {
      // Ignore suppressed terms
      continue;
    }

    const source = columns[11];
    let outStream = undefined;
    switch (source) {
      case 'SNOMEDCT_US':
        outStream = snomedStream;
        break;
      case 'LNC':
        outStream = loincStream;
        break;
      case 'RXNORM':
        outStream = rxnormStream;
        break;
      case 'ICD10CM':
      case 'ICD10PCS':
        outStream = icd10Stream;
        break;
    }

    if (!outStream) {
      continue;
    }

    const code = columns[9] || columns[10] || columns[7];
    const display = columns[14];
    outStream.write(`${code}\t${display}\n`);
  }

  snomedStream.end();
  loincStream.end();
  rxnormStream.end();
  icd10Stream.end();
}

if (require.main === module) {
  main()
    .then(() => console.log('Done'))
    .catch(console.error);
}
