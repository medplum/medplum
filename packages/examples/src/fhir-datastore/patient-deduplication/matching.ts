// start-block imports
import { List, RiskAssessment } from '@medplum/fhirtypes';
// end-block imports

const dedupeAssessment: RiskAssessment =
  // start-block dupedPatientAssessment
  {
    resourceType: 'RiskAssessment',
    id: 'homer-simpson-match-risk-assessment',
    subject: {
      resource: {
        resourceType: 'Patient',
        id: 'homer-simpson',
      },
    },
    basis: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'marge-simpson',
        },
      },
    ],
    code: {
      coding: [
        {
          system: 'http://example.org/risk-assessment-type',
          code: 'duplicate-patient',
        },
      ],
    },
    method: {
      coding: [
        {
          system: 'http://example.org/dedupe-method',
          code: 'last-name',
        },
      ],
    },
    prediction: [
      {
        probabilityDecimal: 50,
        qualitativeRisk: {
          text: 'Somewhat likely',
        },
      },
    ],
  };
// end-block dupedPatientAssessment

const doNotMatchList: List =
  // start-block doNotMatch
  {
    resourceType: 'List',
    id: 'homer-simpson-do-not-match-list',
    subject: {
      resource: {
        resourceType: 'Patient',
        id: 'homer-simpson',
      },
    },
    entry: [
      {
        id: 'do-not-match-entry-1',
        item: {
          resource: {
            resourceType: 'Patient',
            id: 'marge-simpson',
          },
        },
      },
      {
        id: 'do-not-match-entry-2',
        item: {
          resource: {
            resourceType: 'Patient',
            id: 'lisa-simpson',
          },
        },
      },
    ],
  };
// end-block doNotMatch

console.log(dedupeAssessment, doNotMatchList);
