import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Filter, getQuestionnaireAnswers, Operator, SearchRequest } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';
import { useState } from 'react';

interface PatientFilterProps {
  search: SearchRequest;
  onPatientFilter: (search: SearchRequest) => void;
}

export function PatientFilter(props: PatientFilterProps): JSX.Element {
  const [opened, handlers] = useDisclosure(false);

  // Determine if a patient filter is already applied so the button displays and functions dynamically
  const [filtered, setFiltered] = useState<boolean>(() => {
    const filters = props.search.filters as Filter[];
    for (const filter of filters) {
      if (filter.code === 'recipient' && filter.value.split('/')[0] === 'Patient') {
        return true;
      }
    }
    return false;
  });

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const patientReference = getQuestionnaireAnswers(formData)['select-patient'].valueReference;
    if (!patientReference?.reference) {
      throw new Error('Select a valid patient.');
    }

    // Update the search to filter for the selected patient
    const filters = props.search.filters || [];
    filters.push({ code: 'recipient', operator: Operator.EQUALS, value: patientReference.reference });
    const updatedSearch: SearchRequest = {
      ...props.search,
      filters,
    };

    // Update the search, close the modal, and set the filter so the button is correct.
    props.onPatientFilter(updatedSearch);
    handlers.close();
    setFiltered(true);
  };

  // If there is a patient filter applied, clear it
  const handleClearFilters = (): void => {
    const filters = props.search.filters as Filter[];
    const updatedFilters = [];

    for (const filter of filters) {
      // Add all filters to the updated array UNLESS they are a filter on a patient
      if (filter.code === 'recipient' && filter.value.split('/')[0] === 'Patient') {
        continue;
      }
      updatedFilters.push(filter);
    }

    const updatedSearch = {
      ...props.search,
      filters: updatedFilters,
    };

    props.onPatientFilter(updatedSearch);
    setFiltered(false);
  };

  return (
    <div style={{ float: 'right' }}>
      {filtered ? (
        <Button onClick={handleClearFilters}>Clear Patient Filters</Button>
      ) : (
        <Button onClick={handlers.open}>Filter by Patient</Button>
      )}
      <Modal opened={opened} onClose={handlers.close}>
        <QuestionnaireForm questionnaire={patientFilterQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const patientFilterQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'patient-filter',
  item: [
    {
      linkId: 'select-patient',
      type: 'reference',
      text: 'Select Patient',
    },
  ],
};
