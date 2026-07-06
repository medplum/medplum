// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Loader, Modal, Paper, ScrollArea } from '@mantine/core';
import { getReferenceString, isOk } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import {
  createPharmaciesSection,
  Document,
  getDefaultSections,
  LinkTabs,
  OperationOutcomeAlert,
  PatientSummary,
  useMedplum,
} from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { usePharmacyDialog } from '../../components/pharmacy/usePharmacyDialog';
import { useDoseSpotAccess } from '../../hooks/useDoseSpotAccess';
import { usePatient } from '../../hooks/usePatient';
import { OrderLabsPage } from '../labs/OrderLabsPage';
import classes from './PatientPage.module.css';
import { getPatientPageTabs, patientPathPrefix } from './PatientPage.utils';

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const membership = medplum.getProjectMembership();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const patient = usePatient({ setOutcome });
  const [isLabsModalOpen, setIsLabsModalOpen] = useState(false);
  const PharmacyDialogComponent = usePharmacyDialog();
  const { hasAccess: hasDoseSpotAccess } = useDoseSpotAccess();
  const tabs = getPatientPageTabs(membership, { hasDoseSpotAccess });
  const resolvedTabs = useMemo(
    () =>
      tabs.map((t) => ({
        label: t.label,
        value: (t.url ? t.url.replace('%patient.id', patient?.id ?? '') : t.id) || t.id,
      })),
    [patient?.id, tabs]
  );

  const handleCloseLabsModal = useCallback(() => {
    setIsLabsModalOpen(false);
  }, []);

  const sections = useMemo(
    () =>
      getDefaultSections(() => setIsLabsModalOpen(true)).map((s) =>
        s.key === 'pharmacies' ? createPharmaciesSection(PharmacyDialogComponent) : s
      ),
    [setIsLabsModalOpen, PharmacyDialogComponent]
  );

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
              sections={sections}
            />
          </ScrollArea>
        </div>

        <div className={classes.content}>
          <Paper w="100%" radius={0} style={{ borderBottom: '1px solid var(--app-shell-border-color)' }}>
            <ScrollArea>
              <LinkTabs
                baseUrl={patientPathPrefix(patientId)}
                tabs={resolvedTabs}
                variant="unstyled"
                className="pill-tabs"
                p="sm"
              />
            </ScrollArea>
          </Paper>
          <div className={classes.contentBody}>
            <Outlet />
          </div>
        </div>
      </div>
      <Modal opened={isLabsModalOpen} onClose={handleCloseLabsModal} size="xl" centered title="Order Labs">
        <OrderLabsPage onSubmitLabOrder={handleCloseLabsModal} />
      </Modal>
    </>
  );
}
