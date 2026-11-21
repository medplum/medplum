// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { useDebouncedCallback, useViewportSize } from '@mantine/hooks';
import { notifications, showNotification } from '@mantine/notifications';
import type { PatchOperation, WithId } from '@medplum/core';
import { CPT, createReference, formatDate, formatMoney } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  Condition,
  Coverage,
  Encounter,
  EncounterLocation,
  EncounterParticipant,
  Extension,
  Media,
  Organization,
  Patient,
  PaymentReconciliation,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconCircleOff } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { PatientContentWidth } from '../../pages/patient/PatientContentWidth';
import { ChartNoteStatus } from '../../types/encounter';
import { refreshCandidClaimResponse } from '../../utils/candid';
import { getChargeItemsForEncounter } from '../../utils/chargeitems';
import { getClaimChargeItemIds } from '../../utils/claims';
import { createSelfPayCoverage, isSelfPayCoverage } from '../../utils/coverage';
import { getBotErrorMessage } from '../../utils/errors';
import { showErrorNotification } from '../../utils/notifications';
import {
  CANDID_SUBMIT_CLAIM_OPERATION,
  isCustomOperationAvailable,
  STEDI_SUBMIT_CLAIM_OPERATION,
} from '../../utils/operations';
import { PLACE_OF_SERVICE_URL } from '../../utils/placeOfService';
import type { ConditionsByCode } from '../billing/claimConditions';
import { getConditionCode } from '../billing/claimConditions';
import { ClaimDetailPane } from '../billing/ClaimDetailPane';
import { ClaimDiagnosesEditor, ClaimLinesEditor } from '../billing/ClaimEditor';
import { isClaimEditable } from '../billing/claimStatus';
import {
  addChargeItemsToClaim,
  getBilledChargeItemIds,
  isBillingClaim,
  removeChargeItemsFromClaims,
  syncVisitClaims,
} from '../billing/claimSync';
import { DiscardClaimModal } from '../billing/DiscardClaimModal';
import {
  createVisitClaim,
  findBillingOrganization,
  findPatientCoverages,
  getPrimaryCoverage,
} from '../billing/visitClaim';
import type { VisitClaim, VisitDetailsChange } from '../billing/visitDetails';
import { findClaimRemittances, findVisitClaims, syncVisitDetails } from '../billing/visitDetails';
import { WorklistDrawer } from '../billing/WorklistDrawer';
import { getPointedConditions, NewVisitClaimModal } from './NewVisitClaimModal';
import { SubmitClaimModal } from './SubmitClaimModal';
import { VisitClaimsSection } from './VisitClaimsSection';
import { VisitDetailsPanel } from './VisitDetailsPanel';
import { buildVisitSheet, saveVisitLines } from './visitSheet';

export interface BillingTabProps {
  patient: WithId<Patient>;
  encounter: WithId<Encounter>;
  setEncounter: (encounter: WithId<Encounter>) => void;
  /** Fired only after an encounter change is persisted (unlike setEncounter, which may be optimistic). */
  onEncounterSaved?: (encounter: WithId<Encounter>) => void;
  practitioner: WithId<Practitioner> | undefined;
  setPractitioner: (practitioner: WithId<Practitioner>) => void;
  chartNoteStatus: ChartNoteStatus;
  /** Changes when the visit's claims change outside this tab, e.g. made on signing, so it reloads them. */
  claimsKey?: number;
}

export const BillingTab = (props: BillingTabProps): JSX.Element => {
  const {
    encounter,
    setEncounter,
    onEncounterSaved,
    patient,
    practitioner,
    setPractitioner,
    chartNoteStatus,
    claimsKey,
  } = props;
  const medplum = useMedplum();
  // The visit's claims, oldest first: the claim made from the visit, then any related claims made from it.
  const [visitClaims, setVisitClaims] = useState<VisitClaim[]>();
  const [remittances, setRemittances] = useState<WithId<PaymentReconciliation>[]>();
  const [claimsVersion, setClaimsVersion] = useState(0);
  const [openClaimId, setOpenClaimId] = useState<string>();
  const [discardTarget, setDiscardTarget] = useState<WithId<Claim>>();
  const { width: viewportWidth } = useViewportSize();
  const contentWidth = useContext(PatientContentWidth);
  // Charge items picked when the New Claim dialog opens; undefined while it's closed.
  const [newClaimPicks, setNewClaimPicks] = useState<string[]>();
  const [chargeItems, setChargeItems] = useState<WithId<ChargeItem>[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [coverages, setCoverages] = useState<WithId<Coverage>[]>([]);
  const [coverage, setCoverage] = useState<WithId<Coverage> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  // The claim the submit dialog is for; undefined for the visit's first claim, which is made first.
  const [submitTarget, setSubmitTarget] = useState<WithId<Claim>>();
  const [billingOrganization, setBillingOrganization] = useState<Reference<Organization> | undefined>();
  // Which claim submission operations are deployed in this project; undefined until resolved.
  const [submitOperations, setSubmitOperations] = useState<{ candid: boolean; stedi: boolean } | undefined>();

  useEffect(() => {
    Promise.all([
      isCustomOperationAvailable(medplum, CANDID_SUBMIT_CLAIM_OPERATION),
      isCustomOperationAvailable(medplum, STEDI_SUBMIT_CLAIM_OPERATION),
    ])
      .then(([candid, stedi]) => setSubmitOperations({ candid, stedi }))
      .catch(showErrorNotification);
  }, [medplum]);

  const patientId = patient.id;
  const encounterId = encounter.id;
  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      const patientRef = { reference: `Patient/${patientId}` };
      const encounterRef = { reference: `Encounter/${encounterId}` };
      let found = await findVisitClaims(medplum, patientRef, encounterRef);
      // Candid claims are refreshed on load: the get-encounter bot pulls the latest state onto their ClaimResponses.
      const refreshed = await Promise.all(
        found.map((v) =>
          refreshCandidClaimResponse(medplum, v.claim).catch((err) => {
            showErrorNotification(err);
            return false;
          })
        )
      );
      if (refreshed.some(Boolean)) {
        found = await findVisitClaims(medplum, patientRef, encounterRef);
      }
      const remits = await findClaimRemittances(
        medplum,
        found.map((v) => v.claim.id)
      );
      if (active) {
        setVisitClaims(found);
        setRemittances(remits);
      }
    };
    load().catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, patientId, encounterId, claimsVersion, claimsKey]);

  // The visit's diagnoses and charge items, edited with the claim editor's sections as if they were a claim's.
  const [sheet, setSheet] = useState<Claim>();
  const sheetRef = useRef<Claim>(undefined);
  const encounterRef = useRef(encounter);
  const patientRef = useRef(patient);
  useEffect(() => {
    encounterRef.current = encounter;
    patientRef.current = patient;
  }, [encounter, patient]);
  // The charge items as last saved, by id; the codes of the visit's diagnoses as last saved, in order.
  const savedChargeItemsRef = useRef(new Map<string, WithId<ChargeItem>>());
  const visitCodesRef = useRef<string[]>([]);
  // The charge item id each new line got, by the line's temporary id.
  const lineIdsRef = useRef(new Map<string, string>());
  const savingRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      const visit = encounterRef.current;
      const refs = (visit.diagnosis ?? []).map((d) => d.condition).filter((ref) => !!ref?.reference);
      const [items, loaded] = await Promise.all([
        getChargeItemsForEncounter(medplum, visit),
        Promise.all(refs.map((ref) => medplum.readReference(ref as Reference<Condition>).catch(() => undefined))),
      ]);
      if (!active) {
        return;
      }
      const visitConditions = loaded.filter((c): c is WithId<Condition> => !!c);
      const built = buildVisitSheet(patientRef.current, visit, visitConditions, items);
      savedChargeItemsRef.current = new Map(items.map((c) => [c.id, c]));
      visitCodesRef.current = getSheetCodes(built);
      sheetRef.current = built;
      setChargeItems(items);
      setConditions(visitConditions);
      setSheet(built);
    };
    load().catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, encounterId]);

  // Saves the edited lines as the visit's charge items, one save at a time.
  const saveLines = useDebouncedCallback(
    (): void => {
      savingRef.current = savingRef.current
        .then(async () => {
          const current = sheetRef.current;
          if (!current) {
            return;
          }
          const lineIds = lineIdsRef.current;
          const withSavedIds = {
            ...current,
            item: current.item?.map((item) => ({ ...item, id: (item.id && lineIds.get(item.id)) ?? item.id })),
          };
          const result = await saveVisitLines(
            medplum,
            withSavedIds,
            savedChargeItemsRef.current,
            patientRef.current,
            encounterRef.current
          );
          result.createdIds.forEach((id, lineId) => lineIds.set(lineId, id));
          const previous = savedChargeItemsRef.current;
          savedChargeItemsRef.current = new Map(result.chargeItems.map((c) => [c.id, c]));
          setChargeItems(result.chargeItems);
          // The visit's open claims follow its charge items.
          const claimsChanged = await syncVisitClaims(medplum, patientRef.current, encounterRef.current, {
            previous,
            current: result.chargeItems,
            created: new Set(result.createdIds.values()),
          });
          if (claimsChanged) {
            setClaimsVersion((v) => v + 1);
          }
        })
        .catch(showErrorNotification);
    },
    { delay: SAVE_TIMEOUT_MS, flushOnUnmount: true }
  );

  const changeSheet = useCallback(
    (next: Claim): void => {
      // A new line gets a temporary id, so its charge item can be matched to it once saved.
      const withIds = {
        ...next,
        item: next.item?.map((item) => (item.id ? item : { ...item, id: `new-${crypto.randomUUID()}` })),
      };
      sheetRef.current = withIds;
      setSheet(withIds);
      saveLines();
    },
    [saveLines]
  );

  // The diagnoses section saves its changes to the visit itself. Once one lands, follow it here, and put diagnoses new
  // to the visit on its claims too; removing one from the visit leaves the claims alone.
  const handleVisitConditions = useCallback(
    (byCode: ConditionsByCode): void => {
      const codes = sheetRef.current ? getSheetCodes(sheetRef.current) : [];
      // A code the update didn't bring keeps the Condition already known for it.
      setConditions((prev) =>
        codes
          .map((code) => byCode.get(code) ?? prev.find((c) => getConditionCode(c) === code))
          .filter((c): c is Condition => !!c)
      );
      // A new diagnosis reaches a claim once one of its lines points to it, as the charge items save.
      if (codes.join('|') === visitCodesRef.current.join('|')) {
        return;
      }
      visitCodesRef.current = codes;
      medplum
        .readResource('Encounter', encounterRef.current.id, { cache: 'no-cache' })
        .then((saved) => {
          setEncounter(saved);
          onEncounterSaved?.(saved);
        })
        .catch(showErrorNotification);
    },
    [medplum, setEncounter, onEncounterSaved]
  );

  useEffect(() => {
    const fetchCoverage = async (): Promise<void> => {
      if (!patient) {
        return;
      }
      const results = await findPatientCoverages(medplum, patient);
      setCoverages(results);
      setCoverage(getPrimaryCoverage(results));
    };

    fetchCoverage().catch((err) => showErrorNotification(err));
  }, [medplum, patient]);

  const claimProvider = visitClaims?.[0]?.claim.provider?.reference;
  // Default the billing organization: an existing draft claim records the previous choice;
  // otherwise use the billing organization on the practitioner's active PractitionerRole, looked up
  // the same way the visit's insurance eligibility check does. The picker stays editable either way.
  useEffect(() => {
    const resolveBillingOrganization = async (): Promise<Reference<Organization> | undefined> => {
      if (claimProvider?.startsWith('Organization/')) {
        return { reference: claimProvider };
      }
      return practitioner ? findBillingOrganization(medplum, createReference(practitioner)) : undefined;
    };

    resolveBillingOrganization()
      .then((organization) => {
        if (organization) {
          setBillingOrganization(organization);
        }
      })
      .catch((err) => showErrorNotification(err));
  }, [claimProvider, practitioner, medplum]);

  // The visit's charge items on a claim, open or submitted, and the open claims that can still take more.
  const billedIds = getBilledChargeItemIds(visitClaims ?? []);
  const openClaims = (visitClaims ?? []).filter(
    (v) => isBillingClaim(v.claim) && isClaimEditable(v.claim, v.responses)
  );
  const unbilled = chargeItems.filter((c) => !billedIds.has(c.id) && c.code?.coding?.some((cd) => cd.system === CPT));

  // Makes the visit's first claim, from its charge items, when exporting or submitting before it has one.
  const createFirstClaim = useCallback(
    async (insuranceRefs?: Reference<Coverage>[]): Promise<WithId<Claim>> => {
      saveLines.flush();
      await savingRef.current;
      const saved = await createVisitClaim(medplum, {
        patient,
        encounter,
        chargeItems,
        conditions,
        insurance: insuranceRefs ?? (coverage ? [createReference(coverage)] : []),
        practitioner,
        billingOrganization: billingOrganization ?? null,
      });
      setClaimsVersion((v) => v + 1);
      return saved;
    },
    [patient, encounter, practitioner, chargeItems, conditions, coverage, billingOrganization, medplum, saveLines]
  );

  // Charge items on a submitted claim can't go on a new one; those on an open claim move to it.
  const unavailableLines = new Map<string, string>();
  const movingLines = new Map<string, string>();
  for (const { claim: c, responses } of visitClaims ?? []) {
    if (!isBillingClaim(c)) {
      continue;
    }
    const from = `Claim${c.created ? ` · ${formatDate(c.created)}` : ''}`;
    for (const id of getClaimChargeItemIds(c)) {
      if (isClaimEditable(c, responses)) {
        movingLines.set(id, `Moves from ${from}`);
      } else {
        unavailableLines.set(id, 'On a submitted claim');
      }
    }
  }

  const createClaimFromPicked = useCallback(
    async (picked: WithId<ChargeItem>[], billTo: WithId<Coverage> | undefined): Promise<void> => {
      saveLines.flush();
      await savingRef.current;
      const created = await createVisitClaim(medplum, {
        patient,
        encounter,
        chargeItems: picked,
        conditions: getPointedConditions(picked, conditions),
        insurance: billTo ? [createReference(billTo)] : [],
        practitioner,
        billingOrganization: billingOrganization ?? null,
      });
      // Picked charge items on another open claim move here, so they aren't billed twice.
      await removeChargeItemsFromClaims(medplum, visitClaims ?? [], new Set(picked.map((c) => c.id)), created.id);
      setClaimsVersion((v) => v + 1);
      setOpenClaimId(created.id);
      showNotification({
        color: 'green',
        title: 'Claim created',
        message: `${picked.length} ${picked.length === 1 ? 'line' : 'lines'} · ${formatMoney(created.total ?? { value: 0 })}`,
      });
    },
    [patient, encounter, practitioner, conditions, billingOrganization, medplum, saveLines, visitClaims]
  );

  const addUnbilledToClaim = useCallback(
    async (target: WithId<Claim>): Promise<void> => {
      saveLines.flush();
      await savingRef.current;
      await addChargeItemsToClaim(medplum, target, encounter, unbilled);
      setClaimsVersion((v) => v + 1);
      showNotification({
        color: 'green',
        title: 'Added to claim',
        message: `${unbilled.length} ${unbilled.length === 1 ? 'charge item' : 'charge items'}`,
      });
    },
    [medplum, encounter, unbilled, saveLines]
  );

  // The visit's claims share its details: a change here reaches every claim for the visit that can still change.
  const shareVisitDetails = useCallback(
    async (change: VisitDetailsChange): Promise<void> => {
      if (Object.keys(change).length) {
        await syncVisitDetails(medplum, createReference(patient), createReference(encounter), change, {
          skipEncounter: true,
        });
      }
    },
    [medplum, patient, encounter]
  );

  // Visit-details edits accumulate here (keyed by path, latest edit per field wins) so rapid
  // multi-field changes merge into one patch instead of the debounce dropping all but the last.
  const pendingEncounterOpsRef = useRef(new Map<string, PatchOperation>());

  const flushEncounterOps = useDebouncedCallback(async (): Promise<void> => {
    // A remove on a missing path is rejected, and so is an empty location list, so clearing a service
    // facility the encounter never had (or one selected and cleared within a single debounce) is a no-op.
    const ops = [...pendingEncounterOpsRef.current.values()].filter(
      (op) => !(op.op === 'remove' && op.path === '/location' && !encounter.location)
    );
    pendingEncounterOpsRef.current.clear();
    if (ops.length === 0) {
      return;
    }
    // Nested period ops can only apply once the period object exists on the resource.
    if (!encounter.period && ops.some((op) => op.path.startsWith('/period/'))) {
      ops.unshift({ op: 'add', path: '/period', value: {} });
    }

    try {
      const savedEncounter = await medplum.patchResource('Encounter', encounter.id, ops);
      setEncounter(savedEncounter);
      onEncounterSaved?.(savedEncounter);
      await shareVisitDetails(getVisitDetailsChange(ops));

      if (savedEncounter?.participant?.[0]?.individual) {
        const practitionerResult = await medplum.readReference(savedEncounter.participant[0].individual);
        setPractitioner(practitionerResult as WithId<Practitioner>);
      }
    } catch (err) {
      showErrorNotification(err);
    }
  }, SAVE_TIMEOUT_MS);

  const handleEncounterChange = useCallback(
    (ops: PatchOperation[]): void => {
      for (const op of ops) {
        pendingEncounterOpsRef.current.set(op.path, op);
      }
      flushEncounterOps();
    },
    [flushEncounterOps]
  );

  const exportClaimAsCMS1500 = useCallback(
    async (target?: WithId<Claim>): Promise<void> => {
      try {
        const saved = target ?? (await createFirstClaim());
        const response = await medplum.post<Media>(medplum.fhirUrl('Claim', '$export'), {
          resourceType: 'Parameters',
          parameter: [{ name: 'resource', resource: saved }],
        });

        if (response.resourceType === 'Media' && response.content?.url) {
          window.open(response.content.url, '_blank');
        } else {
          showErrorNotification('Failed to download PDF');
        }
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [createFirstClaim, medplum]
  );

  const runClaimSubmit = useCallback(
    async (
      coverageRefs: Reference<Coverage>[],
      operation: '$candid-submit-claim' | '$stedi-submit-claim',
      successTitle: string,
      successMessage: string
    ): Promise<void> => {
      setSubmitting(true);
      try {
        const saved = submitTarget
          ? await medplum.updateResource({
              ...submitTarget,
              insurance: coverageRefs.map((ref, index) => ({
                sequence: index + 1,
                focal: index === 0,
                coverage: ref,
              })),
            })
          : await createFirstClaim(coverageRefs);
        await medplum.post(medplum.fhirUrl('Claim', saved.id, operation), {
          resourceType: 'Parameters',
          parameter: [],
        });
        showNotification({ title: successTitle, message: successMessage, color: 'green' });
        setClaimsVersion((v) => v + 1);
      } catch (err) {
        notifications.show({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: getBotErrorMessage(err),
        });
      } finally {
        setSubmitting(false);
      }
    },
    [createFirstClaim, submitTarget, medplum]
  );

  const submitToCandid = useCallback(
    async (insurance: Reference<Coverage>[]): Promise<void> => {
      await runClaimSubmit(
        insurance,
        '$candid-submit-claim',
        'Claim Submitted',
        'Claim successfully submitted to Candid Health'
      );
    },
    [runClaimSubmit]
  );

  const submitToStedi = useCallback(
    async (insurance: Reference<Coverage>[]): Promise<void> => {
      await runClaimSubmit(
        insurance,
        '$stedi-submit-claim',
        'Submitted to Stedi',
        'Claim successfully submitted to Stedi'
      );
    },
    [runClaimSubmit]
  );

  const ensureSelfPayCoverage = useCallback(async (): Promise<WithId<Coverage>> => {
    const existing = coverages.find(isSelfPayCoverage);
    if (existing) {
      return existing;
    }
    const created = (await createSelfPayCoverage(medplum, patient)) as WithId<Coverage>;
    setCoverages((prev) => [...prev, created]);
    return created;
  }, [coverages, medplum, patient]);

  const handleSubmitClaimClick = useCallback(
    async (target?: WithId<Claim>): Promise<void> => {
      const hasDiagnoses = target ? !!target.diagnosis?.length : conditions.length > 0;
      if (!hasDiagnoses) {
        showNotification({
          title: 'Missing Diagnosis',
          message: 'Please add at least one diagnosis before submitting a claim',
          color: 'red',
        });
        return;
      }
      if (!coverages.find(isSelfPayCoverage)) {
        const created = (await createSelfPayCoverage(medplum, patient)) as WithId<Coverage>;
        setCoverages((prev) => [...prev, created]);
      }
      setSubmitTarget(target);
      setConfirmModalOpen(true);
    },
    [conditions, coverages, medplum, patient]
  );

  return (
    <Stack gap="md">
      {chartNoteStatus === ChartNoteStatus.SignedAndLocked && (
        <VisitClaimsSection
          claims={visitClaims}
          unbilledCodes={
            visitClaims?.length ? unbilled.map((c) => c.code?.coding?.find((cd) => cd.system === CPT)?.code ?? '?') : []
          }
          openClaims={openClaims.map((v) => v.claim)}
          onAddUnbilled={(target) => {
            addUnbilledToClaim(target).catch(showErrorNotification);
          }}
          onOpenClaim={setOpenClaimId}
          onNewClaim={(withUnbilled) => setNewClaimPicks(withUnbilled ? unbilled.map((c) => c.id) : [])}
          remittances={remittances}
          canSubmit={Boolean(submitOperations?.candid || submitOperations?.stedi)}
          submitting={submitting}
          onExport={(target) => {
            exportClaimAsCMS1500(target).catch(showErrorNotification);
          }}
          onSubmit={(target) => {
            handleSubmitClaimClick(target).catch(showErrorNotification);
          }}
          onDiscard={setDiscardTarget}
        />
      )}
      <WorklistDrawer
        opened={!!openClaimId}
        label="Claim"
        areaWidth={viewportWidth}
        width={contentWidth}
        onClose={() => setOpenClaimId(undefined)}
      >
        {openClaimId && (
          <ClaimDetailPane
            key={openClaimId}
            claimId={openClaimId}
            onVisit
            onClose={() => setOpenClaimId(undefined)}
            onChanged={() => setClaimsVersion((v) => v + 1)}
            onOpenClaim={setOpenClaimId}
          />
        )}
      </WorklistDrawer>
      <DiscardClaimModal
        claim={discardTarget}
        onClose={() => setDiscardTarget(undefined)}
        onDiscarded={() => setClaimsVersion((v) => v + 1)}
      />
      <NewVisitClaimModal
        opened={!!newClaimPicks}
        onClose={() => setNewClaimPicks(undefined)}
        preselected={newClaimPicks}
        moving={movingLines}
        chargeItems={chargeItems}
        conditions={conditions}
        coverages={coverages}
        defaultCoverage={coverage}
        unavailable={unavailableLines}
        onCreate={createClaimFromPicked}
      />
      <SubmitClaimModal
        opened={confirmModalOpen}
        coverages={coverages}
        selectedCoverage={coverage}
        patient={patient}
        conditions={conditions}
        practitioner={practitioner}
        onClose={() => setConfirmModalOpen(false)}
        onSubmitClaim={submitOperations?.candid ? submitToCandid : undefined}
        onSubmitToStedi={submitOperations?.stedi ? submitToStedi : undefined}
        ensureSelfPayCoverage={ensureSelfPayCoverage}
      />

      <VisitDetailsPanel
        practitioner={practitioner}
        encounter={encounter}
        billingOrganization={billingOrganization}
        locked={chartNoteStatus === ChartNoteStatus.SignedAndLocked}
        hasSubmittedClaim={!!visitClaims?.some((v) => !isClaimEditable(v.claim, v.responses))}
        onEncounterChange={handleEncounterChange}
        onBillingOrganizationChange={(organization) => {
          const reference = organization ? createReference(organization) : undefined;
          setBillingOrganization(reference);
          shareVisitDetails({ billingOrganization: reference ?? null }).catch(showErrorNotification);
        }}
      />

      {sheet && (
        <>
          <ClaimDiagnosesEditor
            claim={sheet}
            onChange={changeSheet}
            onConditionsChange={handleVisitConditions}
            readOnly={chartNoteStatus === ChartNoteStatus.SignedAndLocked}
          />
          <ClaimLinesEditor
            lineName="Charge Item"
            claim={sheet}
            onChange={changeSheet}
            lineNotice={(item) =>
              visitClaims?.length && unbilled.some((c) => c.id === item.id) ? (
                <Group gap={6} wrap="nowrap">
                  <IconAlertTriangle size={16} color="var(--mantine-color-orange-7)" style={{ flex: 'none' }} />
                  <Text size="sm" c="var(--mantine-color-orange-7)">
                    Not on a claim
                  </Text>
                </Group>
              ) : null
            }
          />
        </>
      )}
    </Stack>
  );
};

function getVisitDetailsChange(ops: PatchOperation[]): VisitDetailsChange {
  const change: { -readonly [K in keyof VisitDetailsChange]: VisitDetailsChange[K] } = {};
  for (const op of ops) {
    if (op.path === '/participant' && op.op === 'add') {
      change.practitioner = (op.value as EncounterParticipant[])[0]?.individual as Reference<Practitioner> | undefined;
    } else if (op.path === '/location') {
      change.facility = op.op === 'add' ? (op.value as EncounterLocation[])[0]?.location : null;
    } else if (op.path === '/extension' && op.op === 'add') {
      change.placeOfService =
        (op.value as Extension[]).find((e) => e.url === PLACE_OF_SERVICE_URL)?.valueCoding ?? null;
    }
  }
  return change;
}

/**
 * The codes of the visit's diagnoses, in order.
 * @param sheet - The visit, as a claim.
 * @returns The ICD-10 codes.
 */
function getSheetCodes(sheet: Claim): string[] {
  return (sheet.diagnosis ?? [])
    .map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code)
    .filter((code): code is string => !!code);
}
