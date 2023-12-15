import { CodeSystem } from '@medplum/fhirtypes';

export const snomed: CodeSystem = {
  resourceType: 'CodeSystem',
  meta: {
    source: 'https://www.hl7.org/fhir/R4/codesystem-snomedct.json',
  },
  url: 'http://snomed.info/sct',
  identifier: [
    {
      system: 'urn:ietf:rfc:3986',
      value: 'urn:oid:2.16.840.1.113883.6.96',
    },
  ],
  name: 'SNOMEDCT_US',
  title: 'SNOMED CT (US Edition)',
  status: 'active',
  experimental: false,
  publisher: 'IHTSDO',
  contact: [
    {
      telecom: [
        {
          system: 'url',
          value: 'http://ihtsdo.org',
        },
      ],
    },
  ],
  description:
    'SNOMED CT is the most comprehensive and precise clinical health terminology product in the world, owned and distributed around the world by The International Health Terminology Standards Development Organisation (IHTSDO).',
  copyright:
    '© 2002-2023 International Health Terminology Standards Development Organisation (IHTSDO). All rights reserved. SNOMED CT®, was originally created by The College of American Pathologists. "SNOMED" and "SNOMED CT" are registered trademarks of the IHTSDO http://www.ihtsdo.org/snomed-ct/get-snomed-ct',
  caseSensitive: false,
  hierarchyMeaning: 'is-a',
  compositional: true,
  versionNeeded: false,
  content: 'not-present',
  filter: [
    {
      code: 'concept',
      description:
        'Filter that includes concepts based on their logical definition. e.g. [concept] [is-a] [x] - include all concepts with an is-a relationship to concept x, or [concept] [in] [x]- include all concepts in the reference set identified by concept x',
      operator: ['is-a', 'in'],
      value: 'A SNOMED CT code',
    },
  ],
  property: [
    {
      code: 'inactive',
      uri: 'http://snomed.info/field/Concept.active',
      description: 'Whether the code is active or not (defaults to false). Not the same as deprecated',
      type: 'boolean',
    },
    {
      code: 'definitionStatusId',
      uri: 'http://snomed.info/field/Concept.definitionStatusId',
      description: 'Either of the codes that are descendants of 900000000000444006',
      type: 'code',
    },
    {
      code: 'parent',
      uri: 'http://hl7.org/fhir/concept-properties#parent',
      description: 'A SNOMED CT concept id that has the target of a direct is-a relationship from the concept',
      type: 'code',
    },
    {
      code: 'child',
      uri: 'http://hl7.org/fhir/concept-properties#child',
      description: 'A SNOMED CT concept id that has a direct is-a relationship to the concept',
      type: 'code',
    },
    {
      code: 'moduleId',
      uri: 'http://snomed.info/field/Concept.moduleId',
      description: 'The SNOMED CT concept id of the module that the concept belongs to.',
      type: 'code',
    },
    {
      code: '42752001',
      description: 'Due to',
      uri: 'http://snomed.info/id/42752001',
      type: 'code',
    },
    {
      code: '47429007',
      description: 'Associated with',
      uri: 'http://snomed.info/id/47429007',
      type: 'code',
    },
    {
      code: '116676008',
      description: 'Associated morphology',
      uri: 'http://snomed.info/id/116676008',
      type: 'code',
    },
    {
      code: '116686009',
      description: 'Has specimen',
      uri: 'http://snomed.info/id/116686009',
      type: 'code',
    },
    {
      code: '118168003',
      description: 'Specimen source morphology',
      uri: 'http://snomed.info/id/118168003',
      type: 'code',
    },
    {
      code: '118169006',
      description: 'Specimen source topography',
      uri: 'http://snomed.info/id/118169006',
      type: 'code',
    },
    {
      code: '118170007',
      description: 'Specimen source identity',
      uri: 'http://snomed.info/id/118170007',
      type: 'code',
    },
    {
      code: '118171006',
      description: 'Specimen procedure',
      uri: 'http://snomed.info/id/118171006',
      type: 'code',
    },
    {
      code: '123005000',
      description: 'Part of',
      uri: 'http://snomed.info/id/123005000',
      type: 'code',
    },
    {
      code: '127489000',
      description: 'Has active ingredient',
      uri: 'http://snomed.info/id/127489000',
      type: 'code',
    },
    {
      code: '131195008',
      description: 'Subject of information',
      uri: 'http://snomed.info/id/131195008',
      type: 'code',
    },
    {
      code: '246075003',
      description: 'Causative agent',
      uri: 'http://snomed.info/id/246075003',
      type: 'code',
    },
    {
      code: '246090004',
      description: 'Associated finding',
      uri: 'http://snomed.info/id/246090004',
      type: 'code',
    },
    {
      code: '246093002',
      description: 'Component',
      uri: 'http://snomed.info/id/246093002',
      type: 'code',
    },
    {
      code: '246112005',
      description: 'Severity',
      uri: 'http://snomed.info/id/246112005',
      type: 'code',
    },
    {
      code: '246454002',
      description: 'Occurrence',
      uri: 'http://snomed.info/id/246454002',
      type: 'code',
    },
    {
      code: '246456000',
      description: 'Episodicity',
      uri: 'http://snomed.info/id/246456000',
      type: 'code',
    },
    {
      code: '246501002',
      description: 'Technique',
      uri: 'http://snomed.info/id/246501002',
      type: 'code',
    },
    {
      code: '246513007',
      description: 'Revision status',
      uri: 'http://snomed.info/id/246513007',
      type: 'code',
    },
    {
      code: '246514001',
      description: 'Units',
      uri: 'http://snomed.info/id/246514001',
      type: 'code',
    },
    {
      code: '255234002',
      description: 'After',
      uri: 'http://snomed.info/id/255234002',
      type: 'code',
    },
    {
      code: '260507000',
      description: 'Access',
      uri: 'http://snomed.info/id/260507000',
      type: 'code',
    },
    {
      code: '260686004',
      description: 'Method',
      uri: 'http://snomed.info/id/260686004',
      type: 'code',
    },
    {
      code: '260870009',
      description: 'Priority',
      uri: 'http://snomed.info/id/260870009',
      type: 'code',
    },
    {
      code: '260870009',
      description: 'Clinical course',
      uri: 'http://snomed.info/id/263502005',
      type: 'code',
    },
    {
      code: '272741003',
      description: 'Laterality',
      uri: 'http://snomed.info/id/272741003',
      type: 'code',
    },
    {
      code: '363589002',
      description: 'Associated procedure',
      uri: 'http://snomed.info/id/363589002',
      type: 'code',
    },
    {
      code: '363698007',
      description: 'Finding site',
      uri: 'http://snomed.info/id/363698007',
      type: 'code',
    },
    {
      code: '363699004',
      description: 'Laterality',
      uri: 'http://snomed.info/id/363699004',
      type: 'code',
    },
    {
      code: '363700003',
      description: 'Direct morphology',
      uri: 'http://snomed.info/id/363700003',
      type: 'code',
    },
    {
      code: '363701004',
      description: 'Direct substance',
      uri: 'http://snomed.info/id/363701004',
      type: 'code',
    },
    {
      code: '363702006',
      description: 'Has focus',
      uri: 'http://snomed.info/id/363702006',
      type: 'code',
    },
    {
      code: '363703001',
      description: 'Has intent',
      uri: 'http://snomed.info/id/363703001',
      type: 'code',
    },
    {
      code: '363704007',
      description: 'Procedure site',
      uri: 'http://snomed.info/id/363704007',
      type: 'code',
    },
    {
      code: '363705008',
      description: 'Has definitional manifestation',
      uri: 'http://snomed.info/id/363705008',
      type: 'code',
    },
    {
      code: '363709002',
      description: 'Indirect morphology',
      uri: 'http://snomed.info/id/363709002',
      type: 'code',
    },
    {
      code: '363710007',
      description: 'Indirect device',
      uri: 'http://snomed.info/id/363710007',
      type: 'code',
    },
    {
      code: '363713009',
      description: 'Has interpretation',
      uri: 'http://snomed.info/id/363713009',
      type: 'code',
    },
    {
      code: '363714003',
      description: 'Interprets',
      uri: 'http://snomed.info/id/363714003',
      type: 'code',
    },
    {
      code: '370129005',
      description: 'Measurement method',
      uri: 'http://snomed.info/id/370129005',
      type: 'code',
    },
    {
      code: '370130000',
      description: 'Property',
      uri: 'http://snomed.info/id/370130000',
      type: 'code',
    },
    {
      code: '370131001',
      description: 'Recipient category',
      uri: 'http://snomed.info/id/370131001',
      type: 'code',
    },
    {
      code: '370132008',
      description: 'Scale type',
      uri: 'http://snomed.info/id/370132008',
      type: 'code',
    },
    {
      code: '370133003',
      description: 'Specimen substance',
      uri: 'http://snomed.info/id/370133003',
      type: 'code',
    },
    {
      code: '370134009',
      description: 'Time aspect',
      uri: 'http://snomed.info/id/370134009',
      type: 'code',
    },
    {
      code: '370135005',
      description: 'Pathological process',
      uri: 'http://snomed.info/id/370135005',
      type: 'code',
    },
    {
      code: '405813007',
      description: 'Procedure site - Direct',
      uri: 'http://snomed.info/id/405813007',
      type: 'code',
    },
    {
      code: '405814001',
      description: 'Procedure site - Indirect',
      uri: 'http://snomed.info/id/405814001',
      type: 'code',
    },
    {
      code: '405815000',
      description: 'Procedure device',
      uri: 'http://snomed.info/id/405815000',
      type: 'code',
    },
    {
      code: '405816004',
      description: 'Procedure morphology',
      uri: 'http://snomed.info/id/405816004',
      type: 'code',
    },
    {
      code: '408729009',
      description: 'Finding context',
      uri: 'http://snomed.info/id/408729009',
      type: 'code',
    },
    {
      code: '408730004',
      description: 'Procedure context',
      uri: 'http://snomed.info/id/408730004',
      type: 'code',
    },
    {
      code: '408731000',
      description: 'Temporal context',
      uri: 'http://snomed.info/id/408731000',
      type: 'code',
    },
    {
      code: '408732007',
      description: 'Subject relationship context',
      uri: 'http://snomed.info/id/408732007',
      type: 'code',
    },
    {
      code: '410675002',
      description: 'Route of administration',
      uri: 'http://snomed.info/id/410675002',
      type: 'code',
    },
    {
      code: '411116001',
      description: 'Has dose form',
      uri: 'http://snomed.info/id/411116001',
      type: 'code',
    },
    {
      code: '418775008',
      description: 'Finding method',
      uri: 'http://snomed.info/id/418775008',
      type: 'code',
    },
    {
      code: '419066007',
      description: 'Finding informer',
      uri: 'http://snomed.info/id/419066007',
      type: 'code',
    },
    {
      code: '424226004',
      description: 'Using device',
      uri: 'http://snomed.info/id/424226004',
      type: 'code',
    },
    {
      code: '424244007',
      description: 'Using energy',
      uri: 'http://snomed.info/id/424244007',
      type: 'code',
    },
    {
      code: '424361007',
      description: 'Using substance',
      uri: 'http://snomed.info/id/424361007',
      type: 'code',
    },
    {
      code: '424876005',
      description: 'Surgical approach',
      uri: 'http://snomed.info/id/424876005',
      type: 'code',
    },
    {
      code: '425391005',
      description: 'Using access device',
      uri: 'http://snomed.info/id/425391005',
      type: 'code',
    },
    {
      code: '609096000',
      description: 'Role group',
      uri: 'http://snomed.info/id/609096000',
      type: 'code',
    },
    {
      code: '704318007',
      description: 'Property type',
      uri: 'http://snomed.info/id/704318007',
      type: 'code',
    },
    {
      code: '704319004',
      description: 'Inheres in',
      uri: 'http://snomed.info/id/704319004',
      type: 'code',
    },
    {
      code: '704320005',
      description: 'Towards',
      uri: 'http://snomed.info/id/704320005',
      type: 'code',
    },
    {
      code: '704321009',
      description: 'Characterizes',
      uri: 'http://snomed.info/id/704321009',
      type: 'code',
    },
    {
      code: '704322002',
      description: 'Process agent',
      uri: 'http://snomed.info/id/704322002',
      type: 'code',
    },
    {
      code: '704323007',
      description: 'Process duration',
      uri: 'http://snomed.info/id/704323007',
      type: 'code',
    },
    {
      code: '704324001',
      description: 'Process output',
      uri: 'http://snomed.info/id/704324001',
      type: 'code',
    },
    {
      code: '704325000',
      description: 'Relative to',
      uri: 'http://snomed.info/id/704325000',
      type: 'code',
    },
    {
      code: '704326004',
      description: 'Precondition',
      uri: 'http://snomed.info/id/704326004',
      type: 'code',
    },
    {
      code: '704327008',
      description: 'Direct site',
      uri: 'http://snomed.info/id/704327008',
      type: 'code',
    },
    {
      code: '704346009',
      description: 'Specified by',
      uri: 'http://snomed.info/id/704346009',
      type: 'code',
    },
    {
      code: '704347000',
      description: 'Observes',
      uri: 'http://snomed.info/id/704347000',
      type: 'code',
    },
    {
      code: '704647008',
      description: 'Is about',
      uri: 'http://snomed.info/id/704647008',
      type: 'code',
    },
  ],
};

export const loinc: CodeSystem = {
  resourceType: 'CodeSystem',
  meta: {
    lastUpdated: '2023-09-18T13:12:56.420+00:00',
    source: 'https://fhir.loinc.org/CodeSystem/loinc-2.76',
  },
  url: 'http://loinc.org',
  identifier: [
    {
      system: 'urn:ietf:rfc:3986',
      value: 'urn:oid:2.16.840.1.113883.6.1',
    },
  ],
  version: '2.76',
  name: 'LOINC',
  title: 'LOINC Code System',
  status: 'active',
  experimental: false,
  publisher: 'Regenstrief Institute, Inc.',
  contact: [
    {
      telecom: [{ system: 'url', value: 'http://loinc.org' }],
    },
  ],
  description: 'LOINC is a freely available international standard for tests, measurements, and observations',
  copyright:
    'This material contains content from LOINC (http://loinc.org). LOINC is copyright ©1995-2023, Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.',
  caseSensitive: false,
  valueSet: 'http://loinc.org/vs',
  hierarchyMeaning: 'is-a',
  compositional: false,
  versionNeeded: false,
  content: 'not-present',
  filter: [
    {
      code: 'parent',
      description:
        "Allows for the selection of a set of codes based on their appearance in the LOINC Component Hierarchy by System. Parent selects immediate parent only. For example, the code '79190-5' has the parent 'LP379670-5'",
      operator: ['='],
      value: 'A Part code',
    },
    {
      code: 'child',
      description:
        "Allows for the selection of a set of codes based on their appearance in the LOINC Component Hierarchy by System. Child selects immediate children only. For example, the code 'LP379670-5' has the child '79190-5'. Only LOINC Parts have children; LOINC codes do not have any children because they are leaf nodes.",
      operator: ['='],
      value: 'A comma separated list of Part or LOINC codes',
    },
  ],
  property: [
    {
      code: 'parent',
      uri: 'http://hl7.org/fhir/concept-properties#parent',
      description: 'A parent code in the Component Hierarchy by System',
      type: 'code',
    },
    {
      code: 'child',
      uri: 'http://hl7.org/fhir/concept-properties#child',
      description: 'A child code in the Component Hierarchy by System',
      type: 'code',
    },
    {
      code: 'COMPONENT',
      uri: 'http://loinc.org/property/COMPONENT',
      description: 'First major axis-component or analyte: Analyte Name, Analyte sub-class, Challenge',
      type: 'Coding',
    },
    {
      code: 'PROPERTY',
      uri: 'http://loinc.org/property/PROPERTY',
      description: 'Second major axis-property observed: Kind of Property (also called kind of quantity)',
      type: 'Coding',
    },
    {
      code: 'TIME_ASPCT',
      uri: 'http://loinc.org/property/TIME_ASPCT',
      description:
        'Third major axis-timing of the measurement: Time Aspect (Point or moment in time vs. time interval)',
      type: 'Coding',
    },
    {
      code: 'SYSTEM',
      uri: 'http://loinc.org/property/SYSTEM',
      description: 'Fourth major axis-type of specimen or system: System (Sample) Type',
      type: 'Coding',
    },
    {
      code: 'SCALE_TYP',
      uri: 'http://loinc.org/property/SCALE_TYP',
      description: 'Fifth major axis-scale of measurement: Type of Scale',
      type: 'Coding',
    },
    {
      code: 'METHOD_TYP',
      uri: 'http://loinc.org/property/METHOD_TYP',
      description: 'Sixth major axis-method of measurement: Type of Method',
      type: 'Coding',
    },
    {
      code: 'CLASS',
      uri: 'http://loinc.org/property/CLASS',
      description: 'An arbitrary classification of terms for grouping related observations together',
      type: 'Coding',
    },
    {
      code: 'VersionLastChanged',
      uri: 'http://loinc.org/property/VersionLastChanged',
      description:
        'The LOINC version number in which the record has last changed. For new records, this field contains the same value as the VersionFirstReleased property.',
      type: 'string',
    },
    {
      code: 'CHNG_TYPE',
      uri: 'http://loinc.org/property/CHNG_TYPE',
      description:
        'DEL = delete (deprecate); ADD = add; PANEL = addition or removal of child elements or change in the conditionality of child elements in the panel or in sub-panels contained by the panel; NAM = change to Analyte/Component (field #2); MAJ = change to name field other than #2 (#3 - #7); MIN = change to field other than name; UND = undelete',
      type: 'string',
    },
    {
      code: 'DefinitionDescription',
      uri: 'http://loinc.org/property/DefinitionDescription',
      description:
        'Narrative text that describes the LOINC term taken as a whole (i.e., taking all of the parts of the term together) or relays information specific to the term, such as the context in which the term was requested or its clinical utility.',
      type: 'string',
    },
    {
      code: 'STATUS',
      uri: 'http://loinc.org/property/STATUS',
      description:
        'Status of the term. Within LOINC, codes with STATUS=DEPRECATED are considered inactive. Current values: ACTIVE, TRIAL, DISCOURAGED, and DEPRECATED',
      type: 'string',
    },
    {
      code: 'CONSUMER_NAME',
      uri: 'http://loinc.org/property/CONSUMER_NAME',
      description:
        'An experimental (beta) consumer friendly name for this item. The intent is to provide a test name that health care consumers will recognize.',
      type: 'string',
    },
    {
      code: 'CLASSTYPE',
      uri: 'http://loinc.org/property/CLASSTYPE',
      description: '1=Laboratory class; 2=Clinical class; 3=Claims attachments; 4=Surveys',
      type: 'string',
    },
    {
      code: 'FORMULA',
      uri: 'http://loinc.org/property/FORMULA',
      description:
        'Contains the formula in human readable form, for calculating the value of any measure that is based on an algebraic or other formula except those for which the component expresses the formula. So Sodium/creatinine does not need a formula, but Free T3 index does.',
      type: 'string',
    },
    {
      code: 'EXMPL_ANSWERS',
      uri: 'http://lostringinc.org/property/EXMPL_ANSWERS',
      description:
        'For some tests and measurements, we have supplied examples of valid answers, such as “1:64”, “negative @ 1:16”, or “55”.',
      type: 'string',
    },
    {
      code: 'SURVEY_QUEST_TEXT',
      uri: 'http://loinc.org/property/SURVEY_QUEST_TEXT',
      description: 'Verbatim question from the survey instrument',
      type: 'string',
    },
    {
      code: 'SURVEY_QUEST_SRC',
      uri: 'http://loinc.org/property/SURVEY_QUEST_SRC',
      description: 'Exact name of the survey instrument and the item/question number',
      type: 'string',
    },
    {
      code: 'UNITSREQUIRED',
      uri: 'http://loinc.org/property/UNITSREQUIRED',
      description:
        'Y/N field that indicates that units are required when this LOINC is included as an OBX segment in a HIPAA attachment',
      type: 'string',
    },
    {
      code: 'RELATEDNAMES2',
      uri: 'http://loinc.org/property/RELATEDNAMES2',
      description:
        'This field was introduced in version 2.05. It contains synonyms for each of the parts of the fully specified LOINC name (component, property, time, system, scale, method).',
      type: 'string',
    },
    {
      code: 'SHORTNAME',
      uri: 'http://loinc.org/property/SHORTNAME',
      description:
        'Introduced in version 2.07, this field contains the short form of the LOINC name and is created via a table-driven algorithmic process. The short name often includes abbreviations and acronyms.',
      type: 'string',
    },
    {
      code: 'ORDER_OBS',
      uri: 'http://loinc.org/property/ORDER_OBS',
      description:
        'Provides users with an idea of the intended use of the term by categorizing it as an order only, observation only, or both',
      type: 'string',
    },
    {
      code: 'HL7_FIELD_SUBFIELD_ID',
      uri: 'http://loinc.org/property/HL7_FIELD_SUBFIELD_ID',
      description:
        'A value in this field means that the content should be delivered in the named field/subfield of the HL7 message. When NULL, the data for this data element should be sent in an OBX segment with this LOINC code stored in OBX-3 and with the value in the OBX-5.',
      type: 'string',
    },
    {
      code: 'EXTERNAL_COPYRIGHT_NOTICE',
      uri: 'http://loinc.org/property/EXTERNAL_COPYRIGHT_NOTICE',
      description: 'External copyright holders copyright notice for this LOINC code',
      type: 'string',
    },
    {
      code: 'EXAMPLE_UNITS',
      uri: 'http://loinc.org/property/EXAMPLE_UNITS',
      description:
        'This field is populated with a combination of submitters units and units that people have sent us. Its purpose is to show users representative, but not necessarily recommended, units in which data could be sent for this term.',
      type: 'string',
    },
    {
      code: 'LONG_COMMON_NAME',
      uri: 'http://loinc.org/property/LONG_COMMON_NAME',
      description:
        'This field contains the LOINC name in a more readable format than the fully specified name. The long common names have been created via a tabledriven algorithmic process. Most abbreviations and acronyms that are used in the LOINC database have been fully spelled out in English.',
      type: 'string',
    },
    {
      code: 'EXAMPLE_UCUM_UNITS',
      uri: 'http://loinc.org/property/EXAMPLE_UCUM_UNITS',
      description:
        'The Unified Code for Units of Measure (UCUM) is a code system intended to include all units of measures being contemporarily used in international science, engineering, and business. (www.unitsofmeasure.org) This field contains example units of measures for this term expressed as UCUM units.',
      type: 'string',
    },
    {
      code: 'STATUS_REASON',
      uri: 'http://loinc.org/property/STATUS_REASON',
      description:
        'Classification of the reason for concept status. This field will be Null for ACTIVE concepts, and optionally populated for terms in other status where the reason is clear. DEPRECATED or DISCOURAGED terms may take values of: AMBIGUOUS, DUPLICATE, or ERRONEOUS.',
      type: 'string',
    },
    {
      code: 'STATUS_TEXT',
      uri: 'http://loinc.org/property/STATUS_TEXT',
      description:
        'Explanation of concept status in narrative text. This field will be Null for ACTIVE concepts, and optionally populated for terms in other status.',
      type: 'string',
    },
    {
      code: 'CHANGE_REASON_PUBLIC',
      uri: 'http://loinc.org/property/CHANGE_REASON_PUBLIC',
      description: 'Detailed explanation about special changes to the term over time.',
      type: 'string',
    },
    {
      code: 'COMMON_TEST_RANK',
      uri: 'http://loinc.org/property/COMMON_TEST_RANK',
      description: 'Ranking of approximately 2000 common tests performed by laboratories in USA.',
      type: 'string',
    },
    {
      code: 'COMMON_ORDER_RANK',
      uri: 'http://loinc.org/property/COMMON_ORDER_RANK',
      description: 'Ranking of approximately 300 common orders performed by laboratories in USA.',
      type: 'string',
    },
    {
      code: 'HL7_ATTACHMENT_STRUCTURE',
      uri: 'http://loinc.org/property/HL7_ATTACHMENT_STRUCTURE',
      description:
        'This property is populated in collaboration with the HL7 Payer-Provider Exchange (PIE) Work Group (previously called Attachments Work Group) as described in the HL7 Attachment Specification: Supplement to Consolidated CDA Templated Guide.',
      type: 'string',
    },
    {
      code: 'EXTERNAL_COPYRIGHT_LINK',
      uri: 'http://loinc.org/property/EXTERNAL_COPYRIGHT_LINK',
      description:
        'For terms that have a third party copyright, this field is populated with the COPYRIGHT_ID from the Source Organization table (see below). It links an external copyright statement to a term.',
      type: 'string',
    },
    {
      code: 'PanelType',
      uri: 'http://loinc.org/property/PanelType',
      description:
        "For LOINC terms that are panels, this attribute classifies them as a 'Convenience group', 'Organizer', or 'Panel'",
      type: 'string',
    },
    {
      code: 'AskAtOrderEntry',
      uri: 'http://loinc.org/property/AskAtOrderEntry',
      description:
        'A multi-valued, semicolon delimited list of LOINC codes that represent optional Ask at Order Entry (AOE) observations for a clinical observation or laboratory test. A LOINC term in this field may represent a single AOE observation or a panel containing several AOE observations.',
      type: 'Coding',
    },
    {
      code: 'AssociatedObservations',
      uri: 'http://loinc.org/property/AssociatedObservations',
      description:
        'A multi-valued, semicolon delimited list of LOINC codes that represent optional associated observation(s) for a clinical observation or laboratory test. A LOINC term in this field may represent a single associated observation or panel containing several associated observations.',
      type: 'Coding',
    },
    {
      code: 'VersionFirstReleased',
      uri: 'http://loinc.org/property/VersionFirstReleased',
      description: 'This is the LOINC version number in which this LOINC term was first published.',
      type: 'string',
    },
    {
      code: 'ValidHL7AttachmentRequest',
      uri: 'http://loinc.org/property/ValidHL7AttachmentRequest',
      description:
        'A value of Y in this field indicates that this LOINC code can be sent by a payer as part of an HL7 Attachment request for additional information.',
      type: 'string',
    },
    {
      code: 'DisplayName',
      uri: 'http://loinc.org/property/DisplayName',
      description:
        "A name that is more 'clinician-friendly' compared to the current LOINC Short Name, Long Common Name, and Fully Specified Name. It is created algorithmically from the manually crafted display text for each Part and is generally more concise than the Long Common Name.",
      type: 'string',
    },
    {
      code: 'answer-list',
      uri: 'http://loinc.org/property/answer-list',
      description: 'An answer list associated with this LOINC code (if there are matching answer lists defined).',
      type: 'Coding',
    },
    {
      code: 'MAP_TO',
      uri: 'http://loinc.org/property/MAP_TO',
      description: 'A replacement term that is to be used in place of the deprecated or discouraged term.',
      type: 'Coding',
    },
    {
      code: 'analyte',
      uri: 'http://loinc.org/property/analyte',
      description: 'First sub-part of the Component, i.e., the part of the Component before the first carat',
      type: 'Coding',
    },
    {
      code: 'analyte-core',
      uri: 'http://loinc.org/property/analyte-core',
      description: 'The primary part of the analyte without the suffix',
      type: 'Coding',
    },
    {
      code: 'analyte-suffix',
      uri: 'http://loinc.org/property/analyte-suffix',
      description: 'The suffix part of the analyte, if present, e.g., Ab or DNA',
      type: 'Coding',
    },
    {
      code: 'analyte-numerator',
      uri: 'http://loinc.org/property/analyte-numerator',
      description:
        'The numerator part of the analyte, i.e., everything before the slash in analytes that contain a divisor',
      type: 'Coding',
    },
    {
      code: 'analyte-divisor',
      uri: 'http://loinc.org/property/analyte-divisor',
      description: 'The divisor part of the analyte, if present, i.e., after the slash and before the first carat',
      type: 'Coding',
    },
    {
      code: 'analyte-divisor-suffix',
      uri: 'http://loinc.org/property/analyte-divisor-suffix',
      description: 'The suffix part of the divisor, if present',
      type: 'Coding',
    },
    {
      code: 'challenge',
      uri: 'http://loinc.org/property/challenge',
      description: 'Second sub-part of the Component, i.e., after the first carat',
      type: 'Coding',
    },
    {
      code: 'adjustment',
      uri: 'http://loinc.org/property/adjustment',
      description: 'Third sub-part of the Component, i.e., after the second carat',
      type: 'Coding',
    },
    {
      code: 'count',
      uri: 'http://loinc.org/property/count',
      description: 'Fourth sub-part of the Component, i.e., after the third carat',
      type: 'Coding',
    },
    {
      code: 'time-core',
      uri: 'http://loinc.org/property/time-core',
      description: 'The primary part of the Time',
      type: 'Coding',
    },
    {
      code: 'time-modifier',
      uri: 'http://loinc.org/property/time-modifier',
      description: 'The modifier of the Time value, such as mean or max',
      type: 'Coding',
    },
    {
      code: 'system-core',
      uri: 'http://loinc.org/property/system-core',
      description: 'The primary part of the System, i.e., without the super system',
      type: 'Coding',
    },
    {
      code: 'super-system',
      uri: 'http://loinc.org/property/super-system',
      description:
        "The super system part of the System, if present. The super system represents the source of the specimen when the source is someone or something other than the patient whose chart the result will be stored in. For example, fetus is the super system for measurements done on obstetric ultrasounds, because the fetus is being measured and that measurement is being recorded in the patient's (mother's) chart.",
      type: 'Coding',
    },
    {
      code: 'analyte-gene',
      uri: 'http://loinc.org/property/analyte-gene',
      description: 'The specific gene represented in the analyte',
      type: 'Coding',
    },
    {
      code: 'category',
      uri: 'http://loinc.org/property/category',
      description:
        'A single LOINC term can be assigned one or more categories based on both programmatic and manual tagging. Category properties also utilize LOINC Class Parts.',
      type: 'Coding',
    },
    {
      code: 'search',
      uri: 'http://loinc.org/property/search',
      description:
        'Synonyms, fragments, and other Parts that are linked to a term to enable more encompassing search results.',
      type: 'Coding',
    },
    {
      code: 'rad-modality-modality-type',
      uri: 'http://loinc.org/property/rad-modality-modality-type',
      description: 'Modality is used to represent the device used to acquire imaging information.',
      type: 'Coding',
    },
    {
      code: 'rad-modality-modality-subtype',
      uri: 'http://loinc.org/property/rad-modality-modality-subtype',
      description:
        'Modality subtype may be optionally included to signify a particularly common or evocative configuration of the modality.',
      type: 'Coding',
    },
    {
      code: 'rad-anatomic-location-region-imaged',
      uri: 'http://loinc.org/property/rad-anatomic-location-region-imaged',
      description:
        'The Anatomic Location Region Imaged attribute is used in two ways: as a coarse-grained descriptor of the area imaged and a grouper for finding related imaging exams; or, it is used just as a grouper.',
      type: 'Coding',
    },
    {
      code: 'rad-anatomic-location-imaging-focus',
      uri: 'http://loinc.org/property/rad-anatomic-location-imaging-focus',
      description:
        'The Anatomic Location Imaging Focus is a more fine-grained descriptor of the specific target structure of an imaging exam. In many areas, the focus should be a specific organ.',
      type: 'Coding',
    },
    {
      code: 'rad-anatomic-location-laterality-presence',
      uri: 'http://loinc.org/property/rad-anatomic-location-laterality-presence',
      description:
        "Radiology Exams that require laterality to be specified in order to be performed are signified with an Anatomic Location Laterality Presence attribute set to 'True'",
      type: 'Coding',
    },
    {
      code: 'rad-anatomic-location-laterality',
      uri: 'http://loinc.org/property/rad-anatomic-location-laterality',
      description: 'Radiology exam Laterality is specified as one of: Left, Right, Bilateral, Unilateral, Unspecified',
      type: 'Coding',
    },
    {
      code: 'rad-view-aggregation',
      uri: 'http://loinc.org/property/rad-view-aggregation',
      description:
        "Aggregation describes the extent of the imaging performed, whether in quantitative terms (e.g., '3 or more views') or subjective terms (e.g., 'complete').",
      type: 'Coding',
    },
    {
      code: 'rad-view-view-type',
      uri: 'http://loinc.org/property/rad-view-view-type',
      description: "View type names specific views, such as 'lateral' or 'AP'.",
      type: 'Coding',
    },
    {
      code: 'rad-maneuver-maneuver-type',
      uri: 'http://loinc.org/property/rad-maneuver-maneuver-type',
      description:
        'Maneuver type indicates an action taken with the goal of elucidating or testing a dynamic aspect of the anatomy.',
      type: 'Coding',
    },
    {
      code: 'rad-timing',
      uri: 'http://loinc.org/property/rad-timing',
      description:
        'The Timing/Existence property used in conjunction with pharmaceutical and maneuver properties. It specifies whether or not the imaging occurs in the presence of the administered pharmaceutical or a maneuver designed to test some dynamic aspect of anatomy or physiology .',
      type: 'Coding',
    },
    {
      code: 'rad-pharmaceutical-substance-given',
      uri: 'http://loinc.org/property/rad-pharmaceutical-substance-given',
      description:
        'The Pharmaceutical Substance Given specifies administered contrast agents, radiopharmaceuticals, medications, or other clinically important agents and challenges during the imaging procedure.',
      type: 'Coding',
    },
    {
      code: 'rad-pharmaceutical-route',
      uri: 'http://loinc.org/property/rad-pharmaceutical-route',
      description: 'Route specifies the route of administration of the pharmaceutical.',
      type: 'Coding',
    },
    {
      code: 'rad-reason-for-exam',
      uri: 'http://loinc.org/property/rad-reason-for-exam',
      description: 'Reason for exam is used to describe a clinical indication or a purpose for the study.',
      type: 'Coding',
    },
    {
      code: 'rad-guidance-for-presence',
      uri: 'http://loinc.org/property/rad-guidance-for-presence',
      description: 'Guidance for.Presence indicates when a procedure is guided by imaging.',
      type: 'Coding',
    },
    {
      code: 'rad-guidance-for-approach',
      uri: 'http://loinc.org/property/rad-guidance-for-approach',
      description:
        'Guidance for.Approach refers to the primary route of access used, such as percutaneous, transcatheter, or transhepatic.',
      type: 'Coding',
    },
    {
      code: 'rad-guidance-for-action',
      uri: 'http://loinc.org/property/rad-guidance-for-action',
      description: 'Guidance for.Action indicates the intervention performed, such as biopsy, aspiration, or ablation.',
      type: 'Coding',
    },
    {
      code: 'rad-guidance-for-object',
      uri: 'http://loinc.org/property/rad-guidance-for-object',
      description: 'Guidance for.Object specifies the target of the action, such as mass, abscess or cyst.',
      type: 'Coding',
    },
    {
      code: 'rad-subject',
      uri: 'http://loinc.org/property/rad-subject',
      description:
        'Subject is intended for use when there is a need to distinguish between the patient associated with an imaging study, and the target of the study.',
      type: 'Coding',
    },
    {
      code: 'document-kind',
      uri: 'http://loinc.org/property/document-kind',
      description: 'Characterizes the general structure of the document at a macro level.',
      type: 'Coding',
    },
    {
      code: 'document-role',
      uri: 'http://loinc.org/property/document-role',
      description:
        'Characterizes the training or professional level of the author of the document, but does not break down to specialty or subspecialty.',
      type: 'Coding',
    },
    {
      code: 'document-setting',
      uri: 'http://loinc.org/property/document-setting',
      description:
        'Setting is a modest extension of CMS’s coarse definition of care settings, such as outpatient, hospital, etc. Setting is not equivalent to location, which typically has more locally defined meanings.',
      type: 'Coding',
    },
    {
      code: 'document-subject-matter-domain',
      uri: 'http://loinc.org/property/document-subject-matter-domain',
      description:
        'Characterizes the clinical domain that is the subject of the document. For example, Internal Medicine, Neurology, Physical Therapy, etc.',
      type: 'Coding',
    },
    {
      code: 'document-type-of-service',
      uri: 'http://loinc.org/property/document-type-of-service',
      description:
        'Characterizes the kind of service or activity provided to/for the patient (or other subject of the service) that is described in the document.',
      type: 'Coding',
    },
    {
      code: 'answers-for',
      uri: 'http://loinc.org/property/answers-for',
      description: 'A LOINC Code for which this answer list is used.',
      type: 'Coding',
    },
  ],
};

export const cpt: CodeSystem = {
  resourceType: 'CodeSystem',
  meta: {
    profile: ['http://hl7.org/fhir/StructureDefinition/shareablecodesystem'],
  },
  url: 'http://www.ama-assn.org/go/cpt',
  identifier: [
    {
      system: 'urn:ietf:rfc:3986',
      value: 'urn:oid:2.16.840.1.113883.6.12',
    },
  ],
  version: '2023',
  name: 'CPT',
  title: 'Current Procedural Terminology',
  status: 'active',
  experimental: false,
  date: '2022-10-01T00:00:00-04:00',
  publisher: 'American Medical Association',
  copyright: 'CPT copyright 2014 American Medical Association. All rights reserved.',
  content: 'not-present',
  property: [
    {
      code: 'CITATION',
      description: 'Citation',
      type: 'string',
    },
    {
      code: 'ADDITIONAL_GUIDELINE',
      description: 'Additional explanatory text that is applicable to a concept (code/heading/subheading).',
      type: 'string',
    },
    {
      code: 'SPECIALTY',
      description: 'Specialty',
      type: 'string',
    },
    {
      code: 'CPT_LEVEL',
      description:
        'For headings, a value ranging from H1 (a top-level heading such as Surgery) to H6 (a 6th-level subheading) and HS (a heading for a small family of related codes). For CPT codes, either PC for Parent Code or CC for Child Code.',
      type: 'code',
    },
    {
      code: 'REPORTABLE',
      description: 'Indicates whether a code is reportable',
      type: 'boolean',
    },
    {
      code: 'CPTLINK_CONCEPT_ID',
      description: 'CPT Link concept identifier',
      type: 'code',
    },
    {
      code: 'DATE_CREATED',
      description: 'Date created',
      type: 'string',
    },
    {
      code: 'GUIDELINE',
      description: 'Guideline',
      type: 'string',
    },
  ],
};

export const rxnorm: CodeSystem = {
  resourceType: 'CodeSystem',
  meta: {
    profile: ['http://hl7.org/fhir/StructureDefinition/shareablecodesystem'],
  },
  url: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  identifier: [
    {
      system: 'urn:ietf:rfc:3986',
      value: 'urn:oid:2.16.840.1.113883.6.88',
    },
  ],
  version: '09052023',
  name: 'RXNORM',
  title: 'RxNorm Vocabulary',
  status: 'active',
  experimental: false,
  date: '2023-09-01T00:00:00-04:00',
  publisher: 'U.S. National Library of Medicine',
  content: 'not-present',
  property: [
    {
      code: 'NDC',
      description: 'National Drug Code corresponding to a clinical drug (e.g. 000023082503)',
      type: 'code',
    },
    {
      code: 'RXN_AVAILABLE_STRENGTH',
      description: 'Available drug strengths listed in the order of ingredients from the drug',
      type: 'string',
    },
    {
      code: 'RXTERM_FORM',
      description: 'National Drug Code corresponding to a clinical drug (e.g. 000023082503)',
      type: 'string',
    },
    {
      code: 'RXN_HUMAN_DRUG',
      description: 'Drug available for use in Humans',
      type: 'code',
    },
    {
      code: 'RXN_QUANTITY',
      description: 'Normal Form quantity factor',
      type: 'string',
    },
    {
      code: 'RXN_QUALITATIVE_DISTINCTION',
      description: 'RXN Qualitative Distinction',
      type: 'string',
    },
  ],
};

export const cvx: CodeSystem = {
  resourceType: 'CodeSystem',
  meta: {
    profile: ['http://hl7.org/fhir/StructureDefinition/shareablecodesystem'],
  },
  url: 'http://hl7.org/fhir/sid/cvx',
  identifier: [
    {
      system: 'urn:ietf:rfc:3986',
      value: 'urn:oid:2.16.840.1.113883.12.292',
    },
  ],
  version: '20230816',
  name: 'CVX',
  title: 'Clinical Vaccine Names',
  status: 'active',
  experimental: false,
  date: '2023-08-01T00:00:00-04:00',
  publisher:
    'CDC, National Center for Immunization and Respiratory Diseases Immunization Information System Support Branch - Informatics',
  content: 'not-present',
  property: [
    {
      code: 'NDC',
      description: 'National Drug Code corresponding to a clinical drug (e.g. 000023082503)',
      type: 'code',
    },
    {
      code: 'VACCINE_STATUS',
      description:
        'Vaccine status. CVX codes for inactive vaccines allow transmission of historical immunization records.',
      type: 'string',
    },
    {
      code: 'NON_VACCINE',
      description: 'Non Vaccine',
      type: 'boolean',
    },
    {
      code: 'DATE_LAST_MODIFIED',
      description: 'Date last modified',
      type: 'dateTime',
    },
    {
      code: 'SOS',
      description: 'Scope Statement',
      type: 'string',
    },
  ],
};

export const icd10pcs: CodeSystem = {
  resourceType: 'CodeSystem',
  meta: {
    profile: ['http://hl7.org/fhir/StructureDefinition/shareablecodesystem'],
  },
  url: 'http://hl7.org/fhir/sid/icd-10-pcs',
  identifier: [
    {
      system: 'urn:ietf:rfc:3986',
      value: 'urn:oid:2.16.840.1.113883.6.4',
    },
  ],
  version: '2024',
  name: 'ICD10PCS',
  title: 'International Classification of Diseases, 10th Edition, Procedure Coding System',
  status: 'active',
  experimental: false,
  date: '2023-07-01T00:00:00-04:00',
  publisher: 'Center for Medicare and Medicaid Services',
  content: 'not-present',
  property: [
    {
      code: 'ORDER_NO',
      description: 'Order number',
      type: 'code',
    },
  ],
};

export const icd10cm: CodeSystem = {
  resourceType: 'CodeSystem',
  meta: {
    profile: ['http://hl7.org/fhir/StructureDefinition/shareablecodesystem'],
  },
  url: 'http://hl7.org/fhir/sid/icd-10-cm',
  identifier: [
    {
      system: 'urn:ietf:rfc:3986',
      value: 'urn:oid:2.16.840.1.113883.6.90',
    },
  ],
  version: '2024',
  name: 'ICD10CM',
  title: 'International Classification of Diseases, 10th Edition, Clinical Modification',
  status: 'active',
  experimental: false,
  date: '2023-07-01T00:00:00-04:00',
  content: 'not-present',
  property: [
    {
      code: 'ORDER_NO',
      description: 'Order number',
      type: 'code',
    },
  ],
};
