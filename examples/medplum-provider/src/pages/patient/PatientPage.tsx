import { Loader, Modal, ScrollArea } from '@mantine/core';
import { getReferenceString, isOk } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, OperationOutcomeAlert, PatientSummary } from '@medplum/react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { Location, Outlet, useLocation, useNavigate } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import classes from './PatientPage.module.css';
import { PatientPageTabInfo, PatientPageTabs, formatPatientPageTabUrl } from './PatientPage.utils';
import { PatientTabsNavigation } from './PatientTabsNavigation';
import { OrderLabsPage } from '../OrderLabsPage';

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
  const [isLabsModalOpen, setIsLabsModalOpen] = useState(false);
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
        navigate(formatPatientPageTabUrl(patient.id, tab))?.catch(console.error);
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

  const handleCloseLabsModal = useCallback(() => {
    setIsLabsModalOpen(false);
  }, []);

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
              onRequestLabs={() => {
                setIsLabsModalOpen(true);
              }}
            />
          </ScrollArea>
        </div>

        <div className={classes.content}>
          <PatientTabsNavigation currentTab={currentTab} onTabChange={onTabChange} />
          <Outlet />
        </div>
      </div>
      <Modal opened={isLabsModalOpen} onClose={handleCloseLabsModal} size="xl" centered title="Order Labs">
        <OrderLabsPage onSubmitLabOrder={handleCloseLabsModal} />
      </Modal>
    </>
  );
}
