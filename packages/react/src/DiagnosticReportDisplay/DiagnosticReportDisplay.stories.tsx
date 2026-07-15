// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { createReference, deepClone } from '@medplum/core';
import type { DiagnosticReport, Observation, Reference, Specimen } from '@medplum/fhirtypes';
import { HomerDiagnosticReport, HomerSimpsonSpecimen, TestOrganization } from '@medplum/mock';
import { useMedplum } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import {
  HealthGorillaDiagnosticReport,
  HealthGorillaObservation1,
  HealthGorillaObservation2,
  HealthGorillaObservationGroup1,
  HealthGorillaObservationGroup2,
} from '../stories/healthgorilla';
import { LabPanelDiagnosticReport, LabPanelObservations, LabPanelSpecimen } from '../stories/labPanel';
import { CreatinineObservation, ExampleReport } from '../stories/referenceLab';
import { DiagnosticReportDisplay } from './DiagnosticReportDisplay';
export default {
  title: 'Medplum/DiagnosticReportDisplay',
  component: DiagnosticReportDisplay,
} as Meta;

async function createHealthGorillaGroups(medplum: MedplumClient): Promise<[Observation, Observation]> {
  const obs1 = await medplum.createResource<Observation>({
    ...deepClone(HealthGorillaObservation1),
    id: undefined,
  });
  const obs2 = await medplum.createResource<Observation>({
    ...deepClone(HealthGorillaObservation2),
    id: undefined,
  });
  const group1 = await medplum.createResource<Observation>({
    ...deepClone(HealthGorillaObservationGroup1),
    id: undefined,
    hasMember: [createReference(obs1)],
  });
  const group2 = await medplum.createResource<Observation>({
    ...deepClone(HealthGorillaObservationGroup2),
    id: undefined,
    hasMember: [createReference(obs2)],
  });
  return [group1, group2];
}

async function createHealthGorillaReport(medplum: MedplumClient): Promise<DiagnosticReport> {
  const [group1, group2] = await createHealthGorillaGroups(medplum);
  return medplum.createResource<DiagnosticReport>({
    ...deepClone(HealthGorillaDiagnosticReport),
    id: undefined,
    result: [createReference(group1), createReference(group2)],
  });
}

export const Simple = (): JSX.Element => (
  <Document>
    <DiagnosticReportDisplay value={HomerDiagnosticReport} />
  </Document>
);

export const WithCategories = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async (): Promise<boolean> => {
      const obs = await medplum.createResource(CreatinineObservation);
      ExampleReport.result = [createReference(obs)];

      await medplum.updateResource(ExampleReport);
      return true;
    })()
      .then(setLoaded)
      .catch(console.log);
  }, [medplum]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Document>
      <DiagnosticReportDisplay value={ExampleReport} />
    </Document>
  );
};

export const MultipleSpecimens = (): JSX.Element => {
  const report = deepClone(HomerDiagnosticReport);
  report.specimen = [HomerDiagnosticReport.specimen?.[0], HomerDiagnosticReport.specimen?.[0]] as Reference<Specimen>[];

  return (
    <Document>
      <DiagnosticReportDisplay value={report} />
    </Document>
  );
};

export const HideSpecimenInfo = (): JSX.Element => {
  return (
    <Document>
      <DiagnosticReportDisplay hideSpecimenInfo value={HomerDiagnosticReport} />
    </Document>
  );
};

export const HideNotes = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async (): Promise<boolean> => {
      const obs = await medplum.createResource({ ...CreatinineObservation, category: undefined });
      (HomerDiagnosticReport.result as Reference<Observation>[]).push(createReference(obs));

      await medplum.updateResource(HomerDiagnosticReport);
      return true;
    })()
      .then(setLoaded)
      .catch(console.log);
  }, [medplum]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Document>
      <DiagnosticReportDisplay hideObservationNotes value={HomerDiagnosticReport} />
    </Document>
  );
};

/**
 * Exercises every feature of DiagnosticReportDisplay in a single report:
 * subject, results interpreter, performer, issued date, and status in the header;
 * multiple specimens (collected and received times) with specimen notes;
 * a presented form rendered as a note; observations covering string values,
 * quantities with comparators, components, reference ranges (low/high/text),
 * interpretations, categories, per-observation performers, observation notes,
 * critical value highlighting, and nested observation groups (hasMember);
 * and a conclusion.
 * @returns The kitchen sink story.
 */
export const KitchenSink = (): JSX.Element => {
  const medplum = useMedplum();
  const [report, setReport] = useState<DiagnosticReport>();

  useEffect(() => {
    (async (): Promise<DiagnosticReport> => {
      const creatinine = await medplum.createResource<Observation>({
        ...deepClone(CreatinineObservation),
        id: undefined,
      });

      const [group1, group2] = await createHealthGorillaGroups(medplum);

      const receivedSpecimen = await medplum.createResource<Specimen>({
        ...deepClone(HomerSimpsonSpecimen),
        id: undefined,
        receivedTime: '2020-01-02T14:30:00Z',
        note: [{ text: 'Second specimen received in good condition.' }],
      });

      return {
        ...deepClone(HomerDiagnosticReport),
        issued: '2020-01-02T12:00:00Z',
        performer: [createReference(TestOrganization)],
        specimen: [...(HomerDiagnosticReport.specimen ?? []), createReference(receivedSpecimen)],
        result: [
          ...(HomerDiagnosticReport.result ?? []),
          createReference(creatinine),
          createReference(group1),
          createReference(group2),
        ],
        presentedForm: [
          {
            contentType: 'text/plain',
            data: window.btoa('Attached presented form: report reviewed and signed electronically.'),
          },
        ],
        conclusion: 'Critical glucose result. Recommend immediate follow-up with primary care physician.',
      };
    })()
      .then(setReport)
      .catch(console.log);
  }, [medplum]);

  if (!report) {
    return <></>;
  }

  return (
    <Document>
      <DiagnosticReportDisplay value={report} />
    </Document>
  );
};

/**
 * A corrected lab panel report: most observations have a "corrected" status
 * with "Previously reported as ..." notes (one with an author attribution),
 * comparator values, structured reference ranges, per-observation categories
 * and performers, and one remaining "final" result.
 * @returns The lab panel with corrections story.
 */
export const LabPanelWithCorrections = (): JSX.Element => {
  const medplum = useMedplum();
  const [report, setReport] = useState<DiagnosticReport>();

  useEffect(() => {
    (async (): Promise<DiagnosticReport> => {
      const specimen = await medplum.createResource<Specimen>({
        ...deepClone(LabPanelSpecimen),
        id: undefined,
      });

      const observations: Observation[] = [];
      for (const observation of LabPanelObservations) {
        observations.push(
          await medplum.createResource<Observation>({
            ...deepClone(observation),
            id: undefined,
          })
        );
      }

      return medplum.createResource<DiagnosticReport>({
        ...deepClone(LabPanelDiagnosticReport),
        id: undefined,
        specimen: [createReference(specimen)],
        result: observations.map(createReference),
      });
    })()
      .then(setReport)
      .catch(console.log);
  }, [medplum]);

  if (!report) {
    return <></>;
  }

  return (
    <Document>
      <DiagnosticReportDisplay value={report} />
    </Document>
  );
};

export const ObservationGroups = (): JSX.Element => {
  const medplum = useMedplum();
  const [report, setReport] = useState<DiagnosticReport>();

  useEffect(() => {
    createHealthGorillaReport(medplum).then(setReport).catch(console.log);
  }, [medplum]);

  if (!report) {
    return <></>;
  }

  return (
    <Document>
      <DiagnosticReportDisplay value={report} />
    </Document>
  );
};

export const HideSubject = (): JSX.Element => {
  const medplum = useMedplum();
  const [report, setReport] = useState<DiagnosticReport>();

  useEffect(() => {
    createHealthGorillaReport(medplum).then(setReport).catch(console.log);
  }, [medplum]);

  if (!report) {
    return <></>;
  }

  return (
    <Document>
      <DiagnosticReportDisplay hideSubject value={report} />
    </Document>
  );
};
