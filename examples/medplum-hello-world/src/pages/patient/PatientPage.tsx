// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Loader, ScrollArea } from '@mantine/core';
import { getReferenceString, isOk } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { Document, OperationOutcomeAlert, PatientSummary } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { Location } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import classes from './PatientPage.module.css';
import { PatientPageTabs } from './PatientPage.utils';
import type { PatientPageTabInfo } from './PatientPage.utils';

function getTabFromLocation(location: Location): PatientPageTabInfo | undefined {
  const tabId = location.pathname.split('/')[3] ?? '';
  const tab = tabId
    ? PatientPageTabs.find((t) => t.id === tabId || t.url.toLowerCase().startsWith(tabId.toLowerCase()))
    : undefined;
  return tab;
}

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const patient = usePatient({ setOutcome });
  const [currentTab, setCurrentTab] = useState<string>(() => {
    return (getTabFromLocation(location) ?? PatientPageTabs[0]).id;
  });

  // Rectify the active tab UI with the current URL. This is necessary because the active tab can be changed
  // in ways other than clicking on a tab in the navigation bar.
  useEffect(() => {
    const newTab = getTabFromLocation(location);
    if (newTab && newTab.id !== currentTab) {
      setCurrentTab(newTab.id);
    }
  }, [currentTab, location]);

  if (outcome && !isOk(outcome)) {
    return (
      <Document>
        <OperationOutcomeAlert outcome={outcome} />
      </Document>
    );
  }

  const patientId = patient?.id;
  if (!patientId) {
    return (
      <Document>
        <Loader />
      </Document>
    );
  }

  return (
    <>
      <div key={getReferenceString(patient)} className={classes.container}>
        <div className={classes.sidebar}>
          <ScrollArea className={classes.scrollArea}>
            <PatientSummary
              patient={patient}
              onClickResource={(resource) =>
                navigate(`/Patient/${patientId}/${resource.resourceType}/${resource.id}`)?.catch(console.error)
              }
            />
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
