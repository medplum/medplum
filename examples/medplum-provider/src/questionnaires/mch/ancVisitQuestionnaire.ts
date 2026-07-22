// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire } from '@medplum/fhirtypes';

export const ANC_VISIT_QUESTIONNAIRE: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'mch-anc-visit',
  status: 'active',
  title: 'Antenatal care visit',
  item: [
    {
      linkId: 'pregnancy-dating',
      text: 'Pregnancy dating',
      type: 'group',
      item: [
        { linkId: 'last-menstrual-period', text: 'Last menstrual period', type: 'date' },
        { linkId: 'estimated-delivery-date', text: 'Estimated delivery date', type: 'date' },
        { linkId: 'gestational-age-weeks', text: 'Gestational age (weeks)', type: 'decimal' },
        { linkId: 'fundal-height-cm', text: 'Fundal height (cm)', type: 'decimal' },
        { linkId: 'fetal-heart-rate-bpm', text: 'Fetal heart rate (bpm)', type: 'integer' },
      ],
    },
    {
      linkId: 'obstetric-history',
      text: 'Obstetric history',
      type: 'group',
      item: [
        { linkId: 'gravida', text: 'Gravida', type: 'integer' },
        { linkId: 'para', text: 'Para', type: 'integer' },
      ],
    },
    {
      linkId: 'maternal-vitals',
      text: 'Maternal vitals',
      type: 'group',
      item: [
        { linkId: 'weight-kg', text: 'Weight (kg)', type: 'decimal' },
        { linkId: 'systolic-bp', text: 'Systolic blood pressure (mmHg)', type: 'integer' },
        { linkId: 'diastolic-bp', text: 'Diastolic blood pressure (mmHg)', type: 'integer' },
      ],
    },
    {
      linkId: 'urine-dip',
      text: 'Urine dipstick',
      type: 'group',
      item: [
        { linkId: 'urine-protein', text: 'Urine protein', type: 'string' },
        { linkId: 'urine-glucose', text: 'Urine glucose', type: 'string' },
      ],
    },
    {
      linkId: 'danger-signs',
      text: 'Danger signs',
      type: 'group',
      item: [
        { linkId: 'danger-bleeding', text: 'Vaginal bleeding', type: 'boolean' },
        { linkId: 'danger-severe-headache', text: 'Severe headache or visual symptoms', type: 'boolean' },
        { linkId: 'danger-abdominal-pain', text: 'Severe abdominal pain', type: 'boolean' },
        { linkId: 'danger-reduced-fetal-movement', text: 'Reduced fetal movement', type: 'boolean' },
      ],
    },
  ],
};
