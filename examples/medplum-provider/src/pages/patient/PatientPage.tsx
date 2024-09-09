import { Loader, Paper, ScrollArea, Tabs } from '@mantine/core';
import { getReferenceString, isOk } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, OperationOutcomeAlert, PatientSummary } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, Location } from 'react-router-dom';
import { usePatient } from '../../hooks/usePatient';
import classes from './PatientPage.module.css';
import {
  PatientPageTabInfo,
  PatientPageTabs,
  formatPatientPageTabUrl,
  getPatientPageTabOrThrow,
} from './PatientPage.utils';

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
    <div key={getReferenceString(patient)} className={classes.container}>
      <div className={classes.sidebar}>
        <PatientSummary
          w={350}
          mb="auto"
          patient={patient}
          appointmentsUrl={formatPatientPageTabUrl(patientId, getPatientPageTabOrThrow('appointments'))}
          encountersUrl={formatPatientPageTabUrl(patientId, getPatientPageTabOrThrow('encounter'))}
        />
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
  );
}
