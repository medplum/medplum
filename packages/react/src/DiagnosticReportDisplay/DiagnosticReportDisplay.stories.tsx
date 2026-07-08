// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
      // Observation with categories, performer, interpretation, and notes
      const creatinine = await medplum.createResource(CreatinineObservation);

      // Observation groups with nested member observations (hasMember)
      await medplum.createResource(HealthGorillaObservation1);
      await medplum.createResource(HealthGorillaObservation2);
      const group1 = await medplum.createResource(HealthGorillaObservationGroup1);
      const group2 = await medplum.createResource(HealthGorillaObservationGroup2);

      // Second specimen with a received time and its own notes
      const receivedSpecimen = await medplum.createResource<Specimen>({
        ...deepClone(HomerSimpsonSpecimen),
        id: 'kitchen-sink-specimen',
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async (): Promise<boolean> => {
      await medplum.createResource(LabPanelSpecimen);
      for (const observation of LabPanelObservations) {
        await medplum.createResource(observation);
      }
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
      <DiagnosticReportDisplay value={LabPanelDiagnosticReport} />
    </Document>
  );
};

export const ObservationGroups = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    medplum
      .createResource(HealthGorillaObservation1)
      .then(() => medplum.createResource(HealthGorillaObservation2))
      .then(() => medplum.createResource(HealthGorillaObservationGroup1))
      .then(() => medplum.createResource(HealthGorillaObservationGroup2))
      .then(() => medplum.createResource(HealthGorillaDiagnosticReport))
      .then(() => setLoaded(true))
      .catch(console.log);
  }, [medplum]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Document>
      <DiagnosticReportDisplay value={HealthGorillaDiagnosticReport} />
    </Document>
  );
};
