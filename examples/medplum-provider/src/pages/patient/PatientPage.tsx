import { Loader, Paper, ScrollArea, Tabs } from '@mantine/core';
import { getReferenceString, isOk } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, OperationOutcomeAlert, PatientSummary } from '@medplum/react';
import { Fragment, useCallback, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePatient } from '../../hooks/usePatient';
import classes from './PatientPage.module.css';
import { PatientPageTabs, formatPatientPageTabUrl } from './PatientPage.utils';

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const patient = usePatient({ setOutcome });
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tabId = window.location.pathname.split('/')[3] ?? '';
    const tab = tabId
      ? PatientPageTabs.find((t) => t.id === tabId || t.url.toLowerCase().startsWith(tabId.toLowerCase()))
      : undefined;
    return (tab ?? PatientPageTabs[0]).id;
  });

  /**
   * Handles a tab change event.
   * @param newTabName - The new tab name.
   */
  const onTabChange = useCallback(
    (newTabName: string | null): void => {
      if (!patient?.id) {
        console.error('Not within a patient context');
        return;
      }

      const tab = newTabName ? PatientPageTabs.find((t) => t.id === newTabName) : PatientPageTabs[0];
      if (tab) {
        setCurrentTab(tab.id);
        navigate(formatPatientPageTabUrl(patient.id, tab));
      }
    },
    [navigate, patient?.id]
  );

  if (outcome && !isOk(outcome)) {
    return (
      <Document>
        <OperationOutcomeAlert outcome={outcome} />
      </Document>
    );
  }

  if (!patient) {
    return (
      <Document>
        <Loader />
      </Document>
    );
  }

  return (
    <Fragment key={getReferenceString(patient)}>
      <div className={classes.container}>
        <div className={classes.sidebar}>
          <PatientSummary w={350} mb="auto" patient={patient} />
        </div>
        <div className={classes.content}>
          <Paper>
            <ScrollArea>
              <Tabs value={currentTab.toLowerCase()} onChange={onTabChange}>
                <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
                  {PatientPageTabs.map((t) => (
                    <Tabs.Tab key={t.id} value={t.id}>
                      {t.label}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            </ScrollArea>
          </Paper>
          <Outlet />
        </div>
      </div>
    </Fragment>
  );
}
