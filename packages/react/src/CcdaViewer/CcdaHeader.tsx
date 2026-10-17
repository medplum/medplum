// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Paper, SimpleGrid, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import classes from './CcdaViewer.module.css';
import {
  attr,
  childEl,
  childEls,
  formatCdaAddress,
  formatCdaCode,
  formatCdaGender,
  formatCdaId,
  formatCdaName,
  formatCdaTelecom,
  formatCdaTime,
  textOf,
} from './CcdaViewer.utils';

export interface CcdaHeaderProps {
  /** The `ClinicalDocument` element. */
  readonly document: Element;
}

export function CcdaHeader(props: CcdaHeaderProps): JSX.Element {
  const { document } = props;
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
      {childEls(document, 'recordTarget').map((recordTarget, i) => (
        <PatientCard key={i} patientRole={childEl(recordTarget, 'patientRole')} />
      ))}
      <DocumentCard document={document} />
    </SimpleGrid>
  );
}

function PatientCard(props: { readonly patientRole: Element | undefined }): JSX.Element {
  const { patientRole } = props;
  const [showDetail, setShowDetail] = useState(false);
  const patient = childEl(patientRole, 'patient');
  const languages = childEls(patient, 'languageCommunication')
    .map((lc) => attr(childEl(lc, 'languageCode'), 'code'))
    .filter(Boolean);

  return (
    <Paper withBorder p="sm">
      <table className={classes.headerTable}>
        <tbody>
          <HeaderRow label="Patient">
            <Text fw={700}>{formatCdaName(childEl(patient, 'name'))}</Text>
          </HeaderRow>
          <HeaderRow label="Date of birth">{formatCdaTime(childEl(patient, 'birthTime'))}</HeaderRow>
          <HeaderRow label="Sex">{formatCdaGender(childEl(patient, 'administrativeGenderCode'))}</HeaderRow>
          {showDetail && (
            <>
              <HeaderRow label="Race">
                {formatCdaCode(childEl(patient, 'raceCode')) || 'Information not available'}
              </HeaderRow>
              <HeaderRow label="Ethnicity">
                {formatCdaCode(childEl(patient, 'ethnicGroupCode')) || 'Information not available'}
              </HeaderRow>
              <HeaderRow label="Language">{languages.join(', ')}</HeaderRow>
              <HeaderRow label="Address">{lines(childEls(patientRole, 'addr').map(formatCdaAddress))}</HeaderRow>
              <HeaderRow label="Contact">{lines(childEls(patientRole, 'telecom').map(formatCdaTelecom))}</HeaderRow>
              <HeaderRow label="Patient IDs">{lines(childEls(patientRole, 'id').map(formatCdaId))}</HeaderRow>
            </>
          )}
        </tbody>
      </table>
      <Anchor component="button" size="xs" onClick={() => setShowDetail((s) => !s)}>
        {showDetail ? 'Fewer patient details' : 'More patient details'}
      </Anchor>
    </Paper>
  );
}

function DocumentCard(props: { readonly document: Element }): JSX.Element {
  const { document } = props;
  const authors = childEls(document, 'author').map((author) => {
    const assigned = childEl(author, 'assignedAuthor');
    const name =
      formatCdaName(childEl(assigned, 'assignedPerson', 'name')) ||
      textOf(childEl(assigned, 'assignedAuthoringDevice', 'softwareName'));
    const org = textOf(childEl(assigned, 'representedOrganization', 'name'));
    return [name, org].filter(Boolean).join(', ');
  });
  const custodian = textOf(
    childEl(document, 'custodian', 'assignedCustodian', 'representedCustodianOrganization', 'name')
  );
  const serviceEvents = childEls(document, 'documentationOf').map((d) =>
    formatCdaTime(childEl(d, 'serviceEvent', 'effectiveTime'))
  );
  const encounter = childEl(document, 'componentOf', 'encompassingEncounter');
  const encounterLocation = textOf(childEl(encounter, 'location', 'healthCareFacility', 'location', 'name'));

  return (
    <Paper withBorder p="sm">
      <table className={classes.headerTable}>
        <tbody>
          <HeaderRow label="Document">{formatCdaCode(childEl(document, 'code'))}</HeaderRow>
          <HeaderRow label="Created">{formatCdaTime(childEl(document, 'effectiveTime'))}</HeaderRow>
          <HeaderRow label="Author">{lines(authors)}</HeaderRow>
          <HeaderRow label="Custodian">{custodian}</HeaderRow>
          <HeaderRow label="Service period">{lines(serviceEvents)}</HeaderRow>
          <HeaderRow label="Encounter">
            {[formatCdaTime(childEl(encounter, 'effectiveTime')), encounterLocation].filter(Boolean).join(', ')}
          </HeaderRow>
        </tbody>
      </table>
    </Paper>
  );
}

function HeaderRow(props: { readonly label: string; readonly children: ReactNode }): JSX.Element | null {
  if (!props.children || (Array.isArray(props.children) && props.children.length === 0)) {
    return null;
  }
  return (
    <tr>
      <th>{props.label}</th>
      <td>{props.children}</td>
    </tr>
  );
}

function lines(values: string[]): ReactNode[] {
  return values.filter(Boolean).map((value, i) => <div key={i}>{value}</div>);
}
