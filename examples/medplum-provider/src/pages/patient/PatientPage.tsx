import { Loader, Paper, ScrollArea, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientSummary, useResource } from '@medplum/react';
import { Fragment, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import classes from './PatientPage.module.css';

const tabs = ['Timeline', 'Encounter', 'Tasks', 'Meds', 'Labs'];

export function PatientPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const patient = useResource<Patient>({ reference: `Patient/${id}` });
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });

  if (!patient) {
    return <Loader />;
  }

  /**
   * Handles a tab change event.
   * @param newTabName - The new tab name.
   */
  function onTabChange(newTabName: string | null): void {
    if (!newTabName) {
      newTabName = tabs[0].toLowerCase();
    }
    setCurrentTab(newTabName);
    navigate(`/Patient/${id}/${newTabName}`);
  }

  return (
    <Fragment key={getReferenceString(patient)}>
      <div className={classes.container}>
        <div className={classes.sidebar}>
          <ScrollArea w={350} h="100%" bg="white">
            <PatientSummary w="100%" h="100vh" patient={patient} />
          </ScrollArea>
        </div>
        <div className={classes.content}>
          <Paper>
            <ScrollArea>
              <Tabs value={currentTab.toLowerCase()} onChange={onTabChange}>
                <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
                  {tabs.map((t) => (
                    <Tabs.Tab key={t} value={t.toLowerCase()}>
                      {t}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            </ScrollArea>
          </Paper>
          <ScrollArea>
            <Outlet />
          </ScrollArea>
        </div>
      </div>
    </Fragment>
  );
}
