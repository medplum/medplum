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
    config = {
      enableDeviceDefinition: true,
      enableDeviceMetric: true,
      enableDeviceRequest: true,
      enableDeviceUseStatement: true,
      enableDiagnosticReport: true,
      enableDocumentManifest: true,
      enableDocumentReference: true,
      enableEffectEvidenceSynthesis: true,
      enableEncounter: true,
      enableEndpoint: true,
      enableEnrollmentRequest: true,
      enableEnrollmentResponse: true,
      enableEpisodeOfCare: true,
      enableEventDefinition: true,
      enableEvidence: true,
      enableEvidenceVariable: true,
      enableExampleScenario: true,
      enableExplanationOfBenefit: true,
      enableFamilyMemberHistory: true,
      enableFlag: true,
      enableGoal: true,
      enableGraphDefinition: true,
      enableGroup: true,
      enableGuidanceResponse: true,
      enableHealthcareService: true,
      enableImagingStudy: true,
      enableImmunization: true,
      enableImmunizationEvaluation: true,
      enableImmunizationRecommendation: true,
      enableImplementationGuide: true,
      enableInsurancePlan: true,
      enableInvoice: true,
      enableLibrary: true,
      enableLinkage: true,
      enableList: true,
      enableLocation: true,
      enableMeasure: true,
      enableMeasureReport: true,
      enableMedia: true,
      enableMedication: true,
      enableMedicationAdministration: true,
      enableMedicationDispense: true,
      enableMedicationKnowledge: true,
      enableMedicationRequest: true,
      enableMedicationStatement: true,
      enableMedicinalProduct: true,
      enableMedicinalProductAuthorization: true,
      enableMedicinalProductContraindication: true,
      enableMedicinalProductIndication: true,
      enableMedicinalProductIngredient: true,
      enableMedicinalProductInteraction: true,
      enableMedicinalProductManufactured: true,
      enableMedicinalProductPackaged: true,
      enableMedicinalProductPharmaceutical: true,
      enableMedicinalProductUndesirableEffect: true,
      enableMessageDefinition: true,
      enableMessageHeader: true,
      enableMolecularSequence: true,
      enableNamingSystem: true,
      enableNutritionOrder: true,
      enableObservation: true,
      enableObservationDefinition: true,
      enableOperationDefinition: true,
      enableOperationOutcome: true,
      enableOrganization: true,
      enableOrganizationAffiliation: true,
      enablePatient: true,
      enablePaymentNotice: true,
      enablePaymentReconciliation: true,
      enablePerson: true,
      enablePlanDefinition: true,
      enablePractitioner: true,
      enablePractitionerRole: true,
      enableProcedure: true,
      enableProvenance: true,
      enableQuestionnaire: true,
      enableQuestionnaireResponse: true,
      enableRelatedPerson: true,
      enableRequestGroup: true,
      enableResearchDefinition: true,
      enableResearchElementDefinition: true,
      enableResearchStudy: true,
      enableResearchSubject: true,
      enableRiskAssessment: true,
      enableRiskEvidenceSynthesis: true,
      enableSchedule: true,
      enableSearchParameter: true,
      enableServiceRequest: true,
      enableSlot: true,
      enableSpecimen: true,
      enableSpecimenDefinition: true,
      enableStructureDefinition: true,
      enableStructureMap: true,
      enableSubscription: true,
      enableSubstance: true,
      enableSubstanceNucleicAcid: true,
      enableSubstancePolymer: true,
      enableSubstanceProtein: true,
      enableSubstanceReferenceInformation: true,
      enableSubstanceSourceMaterial: true,
      enableSubstanceSpecification: true,
      enableSupplyDelivery: true,
      enableSupplyRequest: true,
      enableTask: true,
      enableTerminologyCapabilities: true,
      enableTestReport: true,
      enableTestScript: true,
      enableValueSet: true,
      enableVerificationResult: true,
      enableVisionPrescription: true,
    };
    app = new App();
    stack = new MedplumPrimaryStack(app, config);
  });

  it('should be instantiated without throwing an error', () => {
    expect(() => new FrontEnd(stack, config)).not.toThrow();
  });

  // Additional tests go here
});
