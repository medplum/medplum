import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Task,
  ClinicalImpression,
  QuestionnaireResponse,
  Practitioner,
  Encounter,
  ChargeItem,
  Claim,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { getReferenceString } from '@medplum/core';
import { showErrorNotification } from '../utils/notifications';

export interface EncounterChartHook {
  // State values
  encounter: Encounter | undefined;
  claim: Claim | undefined;
  practitioner: Practitioner | undefined;
  tasks: Task[];
  clinicalImpression: ClinicalImpression | undefined;
  questionnaireResponse: QuestionnaireResponse | undefined;
  chargeItems: ChargeItem[];
  // State setters
  setEncounter: React.Dispatch<React.SetStateAction<Encounter | undefined>>;
  setClaim: React.Dispatch<React.SetStateAction<Claim | undefined>>;
  setPractitioner: React.Dispatch<React.SetStateAction<Practitioner | undefined>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setClinicalImpression: React.Dispatch<React.SetStateAction<ClinicalImpression | undefined>>;
  setQuestionnaireResponse: React.Dispatch<React.SetStateAction<QuestionnaireResponse | undefined>>;
  setChargeItems: React.Dispatch<React.SetStateAction<ChargeItem[]>>;
}

export function useEncounterChart(encounterId?: string): EncounterChartHook {
  const medplum = useMedplum();

  // States
  const [encounter, setEncounter] = useState<Encounter | undefined>();
  const [claim, setClaim] = useState<Claim | undefined>();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clinicalImpression, setClinicalImpression] = useState<ClinicalImpression | undefined>();
  const [questionnaireResponse, setQuestionnaireResponse] = useState<QuestionnaireResponse | undefined>();
  const [chargeItems, setChargeItems] = useState<ChargeItem[]>([]);
  const isUpdatingRef = useRef(false);

  // Load encounter data
  useEffect(() => {
    if (encounterId && !encounter) {
      medplum
        .readResource('Encounter', encounterId)
        .then(setEncounter)
        .catch((err) => {
          showErrorNotification(err);
        });
    }
  }, [encounterId, encounter, medplum]);

  // Fetch tasks related to the encounter
  const fetchTasks = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const taskResult = await medplum.searchResources('Task', `encounter=${getReferenceString(encounter)}`, {
      cache: 'no-cache',
    });

    taskResult.sort((a: Task, b: Task) => {
      const dateA = new Date(a.authoredOn || '').getTime();
      const dateB = new Date(b.authoredOn || '').getTime();
      return dateA - dateB;
    });

    setTasks(taskResult);
  }, [medplum, encounter]);

  // Fetch clinical impressions related to the encounter
  const fetchClinicalImpressions = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const clinicalImpressionResult = await medplum.searchResources(
      'ClinicalImpression',
      `encounter=${getReferenceString(encounter)}`
    );

    const result = clinicalImpressionResult?.[0];
    setClinicalImpression(result);

    if (result?.supportingInfo?.[0]?.reference) {
      const response = await medplum.readReference({ reference: result.supportingInfo[0].reference });
      setQuestionnaireResponse(response as QuestionnaireResponse);
    }
  }, [medplum, encounter]);

  // Fetch charge items related to the encounter
  const fetchChargeItems = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const chargeItems = await medplum.searchResources('ChargeItem', `context=${getReferenceString(encounter)}`);
    setChargeItems(chargeItems);
  }, [medplum, encounter]);

  // Fetch claim related to the encounter
  const fetchClaim = useCallback(async (): Promise<void> => {
    if (!encounter) {
      return;
    }
    const response = await medplum.searchResources('Claim', `encounter=${getReferenceString(encounter)}`);
    setClaim(response[0]);
  }, [encounter, medplum]);

  // Fetch data on component mount or when encounter changes
  useEffect(() => {
    if (encounter) {
      fetchTasks().catch((err) => showErrorNotification(err));
      fetchClinicalImpressions().catch((err) => showErrorNotification(err));
      fetchChargeItems().catch((err) => showErrorNotification(err));
      fetchClaim().catch((err) => showErrorNotification(err));
    }
  }, [encounter, fetchTasks, fetchClinicalImpressions, fetchChargeItems, fetchClaim]);

  // Fetch practitioner related to the encounter
  useEffect(() => {
    const fetchPractitioner = async (): Promise<void> => {
      if (encounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(encounter.participant[0].individual);
        setPractitioner(practitionerResult as Practitioner);
      }
    };

    if (encounter) {
      fetchPractitioner().catch((err) => showErrorNotification(err));
    }
  }, [encounter, medplum]);

  // Apply charge item definitions
  useEffect(() => {
    if (isUpdatingRef.current) {
      isUpdatingRef.current = false;
      return;
    }

    const fetchChargeItemDefinitions = async (): Promise<void> => {
      if (!chargeItems || chargeItems.length === 0) {
        return;
      }

      const updatedItems = [...chargeItems];
      let hasUpdates = false;

      for (const [index, chargeItem] of chargeItems.entries()) {
        if (chargeItem.definitionCanonical && chargeItem.definitionCanonical.length > 0) {
          try {
            const searchResult = await medplum.searchResources(
              'ChargeItemDefinition',
              `url=${chargeItem.definitionCanonical[0]}`
            );
            if (searchResult.length > 0) {
              const chargeItemDefinition = searchResult[0];
              try {
                const applyResult = await medplum.post(
                  medplum.fhirUrl('ChargeItemDefinition', chargeItemDefinition.id as string, '$apply'),
                  {
                    resourceType: 'Parameters',
                    parameter: [
                      {
                        name: 'chargeItem',
                        valueReference: {
                          reference: getReferenceString(chargeItem),
                        },
                      },
                    ],
                  }
                );

                if (applyResult) {
                  const updatedChargeItem = applyResult as ChargeItem;
                  updatedItems[index] = updatedChargeItem;
                  hasUpdates = true;
                }
              } catch (err) {
                console.error('Error applying ChargeItemDefinition:', err);
              }
            }
          } catch (err) {
            showErrorNotification(err);
          }
        }
      }

      if (hasUpdates) {
        isUpdatingRef.current = true;
        setChargeItems(updatedItems);
      }
    };

    fetchChargeItemDefinitions().catch((err) => {
      showErrorNotification(err);
    });
  }, [chargeItems, medplum]);

  return {
    // State values
    encounter,
    claim,
    practitioner,
    tasks,
    clinicalImpression,
    questionnaireResponse,
    chargeItems,

    // State setters
    setEncounter,
    setClaim,
    setPractitioner,
    setTasks,
    setClinicalImpression,
    setQuestionnaireResponse,
    setChargeItems,
  };
}

export function calculateTotalPrice(items: ChargeItem[]): number {
  return items.reduce((sum, item) => sum + (item.priceOverride?.value || 0), 0);
}
