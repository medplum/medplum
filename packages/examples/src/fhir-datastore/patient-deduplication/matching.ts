// start-block imports
import { List, RiskAssessment } from '@medplum/fhirtypes';
// end-block imports

const dedupeAssessment: RiskAssessment =
  // start-block dupedPatientAssessment
  {
    resourceType: 'RiskAssessment',
    id: 'homer-simpson-match-risk-assessment',
    status: 'final',
    subject: {
      reference: 'Patient/homer-simpson',
    },
    basis: [
      {
        reference: 'Patient/homer-j-simpson',
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
          system: 'http://example.org/deduplication-method',
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
    status: 'current',
    mode: 'snapshot',
    subject: {
      reference: 'Patient/homer-simpson',
    },
    entry: [
      {
        item: {
          reference: 'Patient/marge-simpson',
        },
      },
      {
        item: {
          reference: 'Patient/lisa-simpson',
        },
      },
    ],
  };
// end-block doNotMatch

console.log(dedupeAssessment, doNotMatchList);
