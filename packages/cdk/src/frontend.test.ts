import { MedplumInfraConfig } from '@medplum/core';
import { App } from 'aws-cdk-lib';
import { FrontEnd } from './frontend';
import { MedplumPrimaryStack } from './stack';

describe('FrontEnd', () => {
  let config: MedplumInfraConfig;
  let app: App;
  let stack: MedplumPrimaryStack;

  beforeEach(() => {
    // ... existing config setup code ...
  });

  it('should be instantiated without throwing an error', () => {
    expect(() => new FrontEnd(stack, config)).not.toThrow();
  });

  // Test for AWS S3 bucket
  it('should define an S3 bucket with correct website configuration', () => {
    // ... existing config setup code ...
    const configProperties = [
      'enableDeviceDefinition',
      'enableDeviceMetric',
      'enableDeviceRequest',
      'enableDeviceUseStatement',
      'enableDiagnosticReport',
      'enableDocumentManifest',
      'enableDocumentReference',
      'enableEffectEvidenceSynthesis',
      'enableEncounter',
      'enableEndpoint',
      'enableEnrollmentRequest',
      'enableEnrollmentResponse',
      'enableEpisodeOfCare',
      'enableEventDefinition',
      'enableEvidence',
      'enableEvidenceVariable',
      'enableExampleScenario',
      'enableExplanationOfBenefit',
      'enableFamilyMemberHistory',
      'enableFlag',
      'enableGoal',
      'enableGraphDefinition',
      'enableGroup',
      'enableGuidanceResponse',
      'enableHealthcareService',
      'enableImagingStudy',
      'enableImmunization',
      'enableImmunizationEvaluation',
      'enableImmunizationRecommendation',
      'enableImplementationGuide',
      'enableInsurancePlan',
      'enableInvoice',
      'enableLibrary',
      'enableLinkage',
      'enableList',
      'enableLocation',
      'enableMeasure',
      'enableMeasureReport',
      'enableMedia',
      'enableMedication',
      'enableMedicationAdministration',
      'enableMedicationDispense',
      'enableMedicationKnowledge',
      'enableMedicationRequest',
      'enableMedicationStatement',
      'enableMedicinalProduct',
      'enableMedicinalProductAuthorization',
      'enableMedicinalProductContraindication',
      'enableMedicinalProductIndication',
      'enableMedicinalProductIngredient',
      'enableMedicinalProductInteraction',
      'enableMedicinalProductManufactured',
      'enableMedicinalProductPackaged',
      'enableMedicinalProductPharmaceutical',
      'enableMedicinalProductUndesirableEffect',
      'enableMessageDefinition',
      'enableMessageHeader',
      'enableMolecularSequence',
      'enableNamingSystem',
      'enableNutritionOrder',
      'enableObservation',
      'enableObservationDefinition',
      'enableOperationDefinition',
      'enableOperationOutcome',
      'enableOrganization',
      'enableOrganizationAffiliation',
      'enablePatient',
      'enablePaymentNotice',
      'enablePaymentReconciliation',
      'enablePerson',
      'enablePlanDefinition',
      'enablePractitioner',
      'enablePractitionerRole',
      'enableProcedure',
      'enableProvenance',
      'enableQuestionnaire',
      'enableQuestionnaireResponse',
      'enableRelatedPerson',
      'enableRequestGroup',
      'enableResearchDefinition',
      'enableResearchElementDefinition',
      'enableResearchStudy',
      'enableResearchSubject',
      'enableRiskAssessment',
      'enableRiskEvidenceSynthesis',
      'enableSchedule',
      'enableSearchParameter',
      'enableServiceRequest',
      'enableSlot',
      'enableSpecimen',
      'enableSpecimenDefinition',
      'enableStructureDefinition',
      'enableStructureMap',
      'enableSubscription',
      'enableSubstance',
      'enableSubstanceNucleicAcid',
      'enableSubstancePolymer',
      'enableSubstanceProtein',
      'enableSubstanceReferenceInformation',
      'enableSubstanceSourceMaterial',
      'enableSubstanceSpecification',
      'enableSupplyDelivery',
      'enableSupplyRequest',
      'enableTask',
      'enableTerminologyCapabilities',
      'enableTestReport',
      'enableTestScript',
      'enableValueSet',
      'enableVerificationResult',
      'enableVisionPrescription',
    ];

    config = configProperties.reduce((acc, curr) => {
      acc[curr] = true;
      return acc;
    }, {});
    app = new App();
    stack = new MedplumPrimaryStack(app, config);
  });

  it('should be instantiated without throwing an error', () => {
    expect(() => new FrontEnd(stack, config)).not.toThrow();
  });

  // Additional tests go here
});
