import { Loader, Paper, ScrollArea, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { PatientSummary } from '@medplum/react';
import { Fragment, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { usePatient } from '../../hooks/usePatient';
import classes from './PatientPage.module.css';

const tabs = ['Timeline', 'Edit', 'Encounter', 'Tasks', 'Meds', 'Labs'];

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const patient = usePatient();
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
    navigate(`/Patient/${patient?.id}/${newTabName}`);
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
                  {tabs.map((t) => (
                    <Tabs.Tab key={t} value={t.toLowerCase()}>
                      {t}
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
