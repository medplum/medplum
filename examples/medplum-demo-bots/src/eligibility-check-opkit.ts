import { BotEvent, createReference, MedplumClient } from '@medplum/core';
import {
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Organization,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import fetch from 'node-fetch';

/**
 * This bot sends patient coverage data from Medplum to the Opkit eligibility API (https://www.opkit.co/) to
 * verify a patient's benefits
 */

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Because this bot is triggered by a subscription, the resource that comes in is a Coverage object

  const OPKIT_KEY = event.secrets['OPKIT_API_KEY']?.valueString as string;

  const coverage = event.input as Coverage;
  const patient = await medplum.readReference(coverage.subscriber as Reference<Patient>);
  const organization: Organization = await medplum.readReference(coverage.payor?.[0] as Reference<Organization>);
  const provider: Practitioner = await medplum.readReference(
    patient.generalPractitioner?.[0] as Reference<Practitioner>
  );

  if (!coverage) {
    console.log('No coverage found');
    return true;
  }

  if (!patient) {
    console.log('No patient found');
    return true;
  }

  if (!organization) {
    console.log('No payor found');
    return true;
  }

  if (!provider) {
    console.log('No provider found');
    return true;
  }

  let coverageEligibilityReq: CoverageEligibilityRequest = await medplum.createResource<CoverageEligibilityRequest>({
    resourceType: 'CoverageEligibilityRequest',
    status: 'active',
    purpose: ['validation', 'benefits'],
    created: new Date().toISOString(),
    provider: createReference(provider),
    patient: createReference(patient),
    insurer: createReference(organization),
    insurance: [{ coverage: createReference(coverage) }],
  });

  const providerNpi = provider.identifier?.find(
    (identifier) => identifier.system === 'http://hl7.org/fhir/sid/us-npi'
  )?.value;
  const serviceTypes = ['health_benefit_plan_coverage'];
  const payerId = organization.identifier?.find(
    (identifier) => identifier.system === 'https://docs.opkit.co/reference/getpayers'
  )?.value;
  const patientEmail = patient.telecom?.find((identifier) => identifier.system === 'email')?.value;

  const opkitRequest = {
    provider_npi: providerNpi,
    payer_id: payerId,
    subscriber: {
      first_name: patient.name?.[0]?.given?.[0],
      last_name: patient.name?.[0]?.family,
      member_id: coverage.subscriberId,
      date_of_birth: patient.birthDate,
      email: patientEmail,
    },
    services: serviceTypes,
  };

  const result: any = await fetch('https://api.opkit.co/v1/eligibility_inquiries', {
    method: 'POST',
    body: JSON.stringify(opkitRequest),
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${OPKIT_KEY}:`).toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })
    .then((response) => response.json())
    .catch(() => console.log('Error checking eligibility request'));

  if (!result?.plan?.benefits) {
    return false;
  }

  const serviceTypeCodeToCategoryDisplayMap: Record<string, string> = {
    health_benefit_plan_coverage: 'Health Benefit Plan Coverage',
  };

  const serviceTypeCodeToCategoryCodeMap: Record<string, string> = {
    health_benefit_plan_coverage: '30',
  };

  const networkToNetworkTypeCodeMap: Record<string, string> = {
    out_of_network: 'out',
    in_network: 'in',
  };

  const coverageToBenefitUnitMap: Record<string, string> = {
    family: 'family',
    individual: 'individual',
  };

  const typeToBenefitTypeMap: Record<string, string> = {
    deductible: 'deductible',
    copay: 'copay',
  };

  const periodToBenefitTermMap: Record<string, string> = {
    service_year: 'annual',
    calendar_year: 'annual',
  };

  const allowableBenefitTypes: string[] = ['deductible', 'copay'];

  const generateBenefits = (benefits: any, service: any, network: any, coverage: any): any => {
    const fhirBenefits: any = [];

    const filteredBenefits = benefits.filter(
      (benefit: any) => benefit.service === service && benefit.network === network && benefit.coverage === coverage
    );

    filteredBenefits.forEach((benefit: any) => {
      if (benefit.period === 'remaining' || !typeToBenefitTypeMap[benefit.type]) {
        // Skip in these states
      } else if (['service_year', 'calendar_year'].includes(benefit.period)) {
        const usedMoney = benefits.find((value: any) => {
          return (
            value.service === service &&
            value.network === network &&
            value.coverage === coverage &&
            value.period === 'remaining'
          );
        });
        fhirBenefits.push({
          type: {
            coding: [
              {
                code: typeToBenefitTypeMap[benefit.type],
              },
            ],
          },
          allowedMoney: {
            value: benefit.values[0].value / 100, // Opkit currency values are in cents
            currency: 'USD',
          },
          ...(usedMoney
            ? {
                usedMoney: {
                  value: usedMoney.values[0].value / 100,
                  currency: 'USD',
                },
              }
            : {}),
        });
      } else {
        fhirBenefits.push({
          type: {
            coding: [
              {
                code: typeToBenefitTypeMap[benefit.type],
              },
            ],
          },
          ...(benefit.values[0].type === 'percent'
            ? {
                allowedUnsignedInt: benefit.values[0].value,
              }
            : {}),
          ...(benefit.values[0].type === 'currency'
            ? {
                allowedMoney: {
                  value: benefit.values[0].value,
                  currency: 'USD',
                },
              }
            : {}),
        });
      }
    });

    return fhirBenefits.length > 0 ? fhirBenefits : undefined;
  };

  const checkPlanStatus = (benefits: any): boolean => {
    const activeStatusBenefit = benefits.find(
      (benefit: any) => benefit.type === 'active_coverage' && benefit.service === 'health_benefit_plan_coverage'
    );

    return !!activeStatusBenefit;
  };

  const isPlanActive = checkPlanStatus(result.plan.benefits);

  const generateItem = (opkitResponse: any): any => {
    const item: any = [];
    const benefits = opkitResponse.plan.benefits;
    const filteredBenefits = benefits.filter((value: any) => {
      return allowableBenefitTypes.includes(value?.type);
    });
    filteredBenefits.forEach((benefit: any) => {
      const category = serviceTypeCodeToCategoryDisplayMap[benefit?.service]
        ? {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/ex-benefitcategory',
                code: serviceTypeCodeToCategoryCodeMap[benefit.service],
                display: serviceTypeCodeToCategoryDisplayMap[benefit.service],
              },
            ],
          }
        : undefined;

      const network = networkToNetworkTypeCodeMap[benefit?.network]
        ? {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/benefit-network',
                code: networkToNetworkTypeCodeMap[benefit.network],
              },
            ],
          }
        : undefined;

      const unit = coverageToBenefitUnitMap[benefit?.coverage]
        ? {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/benefit-unit',
                code: coverageToBenefitUnitMap[benefit.coverage],
              },
            ],
          }
        : undefined;

      const term = periodToBenefitTermMap[benefit?.period]
        ? {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/benefit-term',
                code: periodToBenefitTermMap[benefit.period],
              },
            ],
          }
        : undefined;

      const fhirBenefit = generateBenefits(benefits, benefit?.service, benefit?.network, benefit?.coverage);

      if (fhirBenefit) {
        item.push({
          category,
          network,
          unit,
          term,
          benefit: fhirBenefit,
        });
      }
    });

    return item;
  };

  coverageEligibilityReq = await medplum.updateResource<CoverageEligibilityRequest>({
    ...coverageEligibilityReq,
    identifier: [
      {
        system: 'https://api.opkit.co/v1/eligibility_inquiries/',
        value: result.id,
      },
    ],
    insurer: createReference(organization),
    patient: createReference(patient),
    insurance: [
      {
        focal: isPlanActive,
        coverage: createReference(coverage),
      },
    ],
  });

  const coverageEligibilityResponse = await medplum.createResource<CoverageEligibilityResponse>({
    resourceType: 'CoverageEligibilityResponse',
    status: isPlanActive ? 'active' : 'cancelled',
    created: new Date().toISOString(),
    outcome: 'complete',
    purpose: ['validation', 'benefits'],
    request: createReference(coverageEligibilityReq),
    disposition: isPlanActive ? 'Policy is currently in-force.' : 'Policy is currently not in-force.',
    patient: createReference(patient),
    insurer: createReference(organization),
    insurance: [
      {
        coverage: createReference(coverage),
        inforce: isPlanActive,
        item: generateItem(result),
      },
    ],
  });

  if (!isPlanActive) {
    await medplum.sendEmail({
      to: 'alice@example.com',
      cc: 'bob@example.com',
      subject: 'Eligibility Check Failed ' + coverageEligibilityResponse.id,
      text:
        'Hello Alice, Insurance Eligibility has failed for a patient.  See details: https://app.medplum.com/CoverageEligibilityResponse' +
        coverageEligibilityResponse.id,
    });
  }

  return true;
}
