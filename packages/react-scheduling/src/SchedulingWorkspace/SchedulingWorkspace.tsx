// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, CloseButton, Group, Tabs, Title, useMantineTheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  extractServiceTypeReferences,
  getReferenceString,
  isDefined,
  isResourceWithId,
  normalizeErrorString,
} from '@medplum/core';
import type { Appointment, Extension, HealthcareService, Location, Reference, Slot } from '@medplum/fhirtypes';
import { useMedplum, useResourceModified } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookableActorType } from '../actors';
import { BOOKABLE_ACTOR_TYPES } from '../actors';
import type { AppointmentBooking } from '../AppointmentFinder/AppointmentBookingForm';
import { AppointmentBookingForm } from '../AppointmentFinder/AppointmentBookingForm';
import type { ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';
import { getCandidateDisplay, searchScheduleCandidates } from '../AppointmentFinder/AppointmentFinder.schedules';
import type { AppointmentWrite } from '../AppointmentFinder/AppointmentFinder.writes';
import type { AppointmentReschedule } from '../AppointmentFinder/AppointmentRescheduleForm';
import { filterBookedSlots } from '../CalendarBase/CalendarBase.utils';
import { fallbackColorIndex, getSchedulingColor, resolveThemeColor } from '../colors';
import { useSchedulingResources } from '../hooks/useSchedulingResources';
import type { MultiCalendarSource } from '../MultiCalendar/MultiCalendar';
import { MultiCalendar } from '../MultiCalendar/MultiCalendar';
import type { DateTimeRange } from '../types';
import { AppointmentDetails } from './AppointmentDetails/AppointmentDetails';
import { BlockTimeForm } from './BlockTimeForm/BlockTimeForm';
import type { CalendarFilterValues } from './CalendarFilters';
import { CalendarFilters } from './CalendarFilters';
import type { ServiceTypeLegendItem } from './CalendarLegend';
import { CalendarLegend } from './CalendarLegend';
import type { CalendarsPanelItem } from './CalendarsPanel/CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel/CalendarsPanel';
import { CalendarTimezoneNotice } from './CalendarTimezoneNotice';
import classes from './SchedulingWorkspace.module.css';
import { getCalendarTimezones, groupAppointmentsByService } from './SchedulingWorkspace.utils';
import { SlotDetails } from './SlotDetails';

type CandidatesByActorType = Readonly<Record<BookableActorType, ScheduleCandidate[]>>;
type DeselectedIdsByActorType = Readonly<Record<BookableActorType, ReadonlySet<string>>>;
type PaneTab = 'appointment' | 'block';

const NO_CANDIDATES: CandidatesByActorType = { Practitioner: [], Location: [], Device: [] };

const NO_SERVICES: ReadonlyMap<string, HealthcareService | undefined> = new Map();

const NO_FILTERS: CalendarFilterValues = {};

const NONE_DESELECTED: DeselectedIdsByActorType = {
  Practitioner: new Set(),
  Location: new Set(),
  Device: new Set(),
};

const RESOURCE_OPTIONS = {
  // "free" Slots are left out: they are easy to misinterpret as being the _only_
  // bookable times. "entered-in-error" status slots are also not shown here.
  slotStatuses: ['busy', 'busy-unavailable', 'busy-tentative'],
  // Cancelled and entered-in-error appointments are not displayed here.
  appointmentStatuses: ['proposed', 'pending', 'booked', 'arrived', 'fulfilled', 'noshow', 'checked-in', 'waitlist'],
} as const;

export interface SchedulingWorkspaceProps {
  readonly className?: string;
  /** The ValueSet the procedure code field binds to. Defaults to full CPT valueset. */
  readonly procedureBinding?: string;
  /** The ValueSet the diagnosis code field binds to. Defaults to full ICD-10-CM valueset. */
  readonly diagnosisBinding?: string;
  /** See {@link AppointmentProposalFormProps.mrnSystem}. */
  readonly mrnSystem?: string;
  readonly onBooked?: (booking: AppointmentBooking) => void | Promise<void>;
  /** Called with the Slots written when time is blocked from the pane's Block tab. */
  readonly onBlocked?: (slots: WithId<Slot>[]) => void | Promise<void>;
  readonly onCancelled?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /** Called with what `$confirm` wrote, after a pending appointment is confirmed from its details. */
  readonly onConfirmed?: (confirmation: AppointmentWrite) => void | Promise<void>;
  readonly onRescheduled?: (reschedule: AppointmentReschedule) => void | Promise<void>;
  /** Called with the appointment as written, after its patient or its visit type's codes are edited. */
  readonly onUpdated?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /**
   * Overrides the value set the appointment detail view offers cancellation reasons
   * from, for a host coding them against its own terminology.
   */
  readonly appointmentCancellationReasonValueSet?: string;
  /**
   * Lets booking and rescheduling take a typed time and length, placing a visit the scheduling
   * rules would refuse: over occupied or blocked time, past the configured capacity,
   * or at a time or length the visit type does not offer.
   *
   * Passing it draws the fields; it enforces nothing. Which users get it is the host
   * application's responsibility.
   *
   * Such a booking is sent as a transaction, so the appointment and its Slots commit
   * together on projects with the `transaction-bundles` feature enabled. Without it they
   * are applied as a plain batch, where an appointment that failed to write would leave
   * Slots holding no visit. Manual rescheduling writes Slot by Slot instead: old Slots the
   * user cannot delete stay behind as blocked time after the move.
   * @see https://www.medplum.com/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions
   */
  readonly canBypassSchedulingRules?: boolean;
  /**
   * Extensions to put on every appointment booked from this workspace. See
   * {@link AppointmentProposalFormProps.appointmentExtensions}.
   */
  readonly appointmentExtensions?: readonly Extension[];
  /**
   * The site the Location filter starts on, e.g. the facility the host launched
   * scheduling from. The user can still change or clear it. Read once on mount; key
   * the workspace to start it over on another site.
   */
  readonly defaultLocation?: Reference<Location> | WithId<Location>;
}

/**
 * A data-coordination component pairing `CalendarsPanel` with {@link MultiCalendar}.
 *
 * - Draws each appointment once, however many of the calendars on show it is held on,
 *   in the color of its service type: the one its HealthcareService names, or else one
 *   picked by hashing the HealthcareService's reference. A service type's appointments are
 *   drawn once its HealthcareService has been read, so none is repainted as it arrives;
 *   until then, the Slots they hold show as blocked time. A legend below the calendar keys those colors.
 * - Books from the calendar: clicking open time opens {@link AppointmentBookingForm}
 *   in a pane on the right, with its time search opened on the day that was clicked.
 *   The form writes the booking and announces what it wrote, which is what puts the
 *   new appointment on the calendar beside it — a host supplies no data for any of it.
 *   What was written is reported through `onBooked`, for a host that wants to say so.
 * - Blocks time from the calendar: the same pane has a Block tab, writing a `busy` Slot
 *   over the time on each calendar the user names, reported through `onBlocked`.
 * - Shows what is booked: clicking an appointment opens `AppointmentDetails` in the
 *   same pane the booking form uses, describing the visit and offering to cancel or
 *   reschedule it, or to confirm one still pending.
 * - Shows blocked time: clicking a Slot opens `SlotDetails` in that same pane, saying
 *   whose time it holds, when, and why, and offering to edit its time and comment or
 *   delete it.
 * - Highlights the time clicked, and draws the visit the form would book as a draft
 *   appointment beside it, from whenever the form holds a time until it drops it. The
 *   calendar is never moved to reach either; one off the week on screen is drawn again
 *   on paging back to it.
 * - Can open on a site the host chooses: `defaultLocation` is where the Location filter,
 *   and so the booking form, starts.
 *
 * @param props - Component props
 * @returns A React Node with the coordinated Calendars panel + calendar UI in it
 */
export function SchedulingWorkspace(props: SchedulingWorkspaceProps): JSX.Element {
  const {
    procedureBinding,
    diagnosisBinding,
    mrnSystem,
    onBooked,
    onBlocked,
    appointmentCancellationReasonValueSet,
    canBypassSchedulingRules,
    appointmentExtensions,
    defaultLocation,
  } = props;
  const medplum = useMedplum();
  const theme = useMantineTheme();

  const [schedulesLoadingError, setSchedulesLoadingError] = useState<unknown>();

  const [candidatesByActorType, setCandidatesByActorType] = useState<CandidatesByActorType>(NO_CANDIDATES);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [deselectedIds, setDeselectedIds] = useState<DeselectedIdsByActorType>(NONE_DESELECTED);

  // Owned by `CalendarFilters`, which reports both whenever either changes. Held here
  // because the candidate search below is keyed on them.
  const initialFilters: CalendarFilterValues = defaultLocation ? { location: defaultLocation } : NO_FILTERS;
  const [filters, setFilters] = useState<CalendarFilterValues>(initialFilters);
  const { service: selectedService, location: selectedLocation } = filters;

  const [range, setRange] = useState<DateTimeRange>();

  // What was selected
  const [bookingSelection, setBookingSelection] = useState<DateTimeRange>();
  const [selectedAppointment, setSelectedAppointment] = useState<WithId<Appointment>>();
  const [selectedSlotId, setSelectedSlotId] = useState<string>();

  const [paneTab, setPaneTab] = useState<PaneTab>('appointment');

  // The visit the booking form would book, drawn on the calendar apart from the click that
  // opened it, so each has one writer.
  const [proposal, setProposal] = useState<Appointment>();
  // What the calendar highlights while blocking: the block form's time, which a click resets.
  const [blockHighlight, setBlockHighlight] = useState<DateTimeRange>();
  const [timeFinderOpen, setTimeFinderOpen] = useState(false);
  const [rescheduleFinderOpen, setRescheduleFinderOpen] = useState(false);

  // Finds all bookable Schedules, with one search per bookable actor type.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading flag
    setCandidatesLoading(true);
    Promise.all(
      BOOKABLE_ACTOR_TYPES.map(async (actorType) => {
        // We search for a large number of schedule candidates here because we
        // do client-side filtering based on locations in the list. Follow up:
        // https://github.com/medplum/medplum/issues/10618
        const candidates = await searchScheduleCandidates(medplum, selectedService, {
          actorType,
          query: '',
          location: selectedLocation,
          signal: controller.signal,
          count: 250,
        });
        return [actorType, candidates] as const;
      })
    )
      .then((results) => {
        if (!controller.signal.aborted) {
          setSchedulesLoadingError(undefined);
          setCandidatesByActorType(Object.fromEntries(results) as CandidatesByActorType);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setSchedulesLoadingError(err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCandidatesLoading(false);
        }
      });
    return () => controller.abort();
  }, [medplum, selectedService, selectedLocation]);

  const activeCandidates = useMemo(() => {
    return BOOKABLE_ACTOR_TYPES.flatMap((actorType) =>
      candidatesByActorType[actorType].filter((c) => !deselectedIds[actorType].has(c.schedule.id))
    );
  }, [candidatesByActorType, deselectedIds]);

  const schedules = useMemo(() => activeCandidates.map((c) => c.schedule), [activeCandidates]);
  const {
    slots,
    appointments,
    loading: resourcesLoading,
    error: resourcesError,
  } = useSchedulingResources(schedules, range, RESOURCE_OPTIONS);
  const services = useAppointmentServices(appointments);

  const { sources, serviceTypes, servicesPending } = useMemo(() => {
    const isSettled = (reference: string): boolean =>
      services.has(reference) || medplum.getCachedReference({ reference }) !== undefined;
    // The color the HealthcareService names, or else one picked by its reference, so it holds
    // whichever week is on show, for everyone, and as other service types come and go.
    const serviceColor = (reference: string): keyof typeof theme.colors => {
      const service = services.get(reference) ?? medplum.getCachedReference<HealthcareService>({ reference });
      return resolveThemeColor(theme, getSchedulingColor(service), fallbackColorIndex(reference));
    };
    const actorsOnShow = new Set(
      activeCandidates
        .flatMap((candidate) => candidate.schedule.actor.map((actor) => actor.reference))
        .filter(isDefined)
    );
    const visibleAppointments = (appointments ?? []).filter((appointment) =>
      appointment.participant.some(
        (participant) => participant.actor?.reference && actorsOnShow.has(participant.actor.reference)
      )
    );
    const allGroups = Array.from(groupAppointmentsByService(visibleAppointments));
    // Held back until the service is read, or has failed to be, rather than drawn in one color
    // and then repainted in the one it names.
    const groups = allGroups
      .filter(([reference]) => !reference || isSettled(reference))
      .map(([reference, group]) => ({ reference, group, color: reference ? serviceColor(reference) : 'gray' }));
    // Appointments are drawn by service type rather than on the calendars they are held on,
    // so the Slots they hold have to be cleared here: a source only clears the ones behind
    // its own appointments. A held-back appointment's Slots stay, so its time isn't shown as free.
    const openSlots = filterBookedSlots(
      slots ?? [],
      groups.flatMap(({ group }) => group)
    );
    const calendarSources = activeCandidates.map((candidate): MultiCalendarSource => {
      const scheduleReference = getReferenceString(candidate.schedule);
      return {
        schedule: candidate.schedule,
        slots: openSlots.filter((slot: Slot) => slot.schedule?.reference === scheduleReference),
        appointments: [],
      };
    });
    const serviceSources = groups.map(({ group, color }): MultiCalendarSource => ({
      color,
      slots: [],
      appointments: group,
    }));
    // Hidden with the Appointment tab, as the selection follows the tab on show. A draft, and
    // not clickable: there is nothing booked yet to open.
    const drawnProposal = paneTab === 'appointment' ? proposal : undefined;
    const proposalReference = extractServiceTypeReferences(drawnProposal?.serviceType)[0]?.reference;
    const proposalSources = drawnProposal
      ? [
          {
            color: proposalReference ? serviceColor(proposalReference) : 'gray',
            slots: [],
            appointments: [drawnProposal],
            interactive: false,
            draft: true,
            label: 'Draft New Appointment',
          } satisfies MultiCalendarSource,
        ]
      : [];
    const legend = groups
      .map(({ reference, group, color }): ServiceTypeLegendItem => ({
        id: reference ?? 'none',
        // Named as its events are titled, by the HealthcareService its color is picked from.
        appointment: group[0],
        color,
      }))
      // By reference, so the order holds from week to week; the names load only as the legend
      // shows them. The appointments naming no service type go last.
      .sort((a, b) => Number(a.id === 'none') - Number(b.id === 'none') || a.id.localeCompare(b.id));
    return {
      sources: [...calendarSources, ...serviceSources, ...proposalSources],
      serviceTypes: legend,
      servicesPending: groups.length < allGroups.length,
    };
  }, [activeCandidates, slots, appointments, services, medplum, theme, paneTab, proposal]);

  const { timezones, anyUnknown } = useMemo(() => getCalendarTimezones(activeCandidates), [activeCandidates]);

  const startBooking = useCallback((interval: DateTimeRange): void => {
    setSelectedAppointment(undefined);
    setSelectedSlotId(undefined);
    setBookingSelection(interval);
    setBlockHighlight(interval);
  }, []);

  const closeBooking = useCallback((): void => {
    setBookingSelection(undefined);
    setProposal(undefined);
    setBlockHighlight(undefined);
    setTimeFinderOpen(false);
  }, []);

  // Hides are kept across a service change rather than pruned: a calendar hidden under
  // one service type stays hidden if another offers it again.
  const toggleCandidate = useCallback((actorType: BookableActorType, id: string): void => {
    setDeselectedIds((prev) => ({ ...prev, [actorType]: toggleId(prev[actorType], id) }));
  }, []);

  const finishBooking = useCallback(
    (booking: AppointmentBooking): void | Promise<void> => {
      closeBooking();
      return onBooked?.(booking);
    },
    [closeBooking, onBooked]
  );

  const finishBlock = useCallback(
    (slots: WithId<Slot>[]): void | Promise<void> => {
      closeBooking();
      return onBlocked?.(slots);
    },
    [closeBooking, onBlocked]
  );

  const selectAppointment = useCallback(
    (appointment: Appointment): void => {
      if (isResourceWithId(appointment)) {
        if (appointment.id !== selectedAppointment?.id) {
          setRescheduleFinderOpen(false);
        }
        closeBooking();
        setSelectedSlotId(undefined);
        setSelectedAppointment(appointment);
      }
    },
    [closeBooking, selectedAppointment?.id]
  );

  const closeAppointment = useCallback((): void => {
    setSelectedAppointment(undefined);
    setRescheduleFinderOpen(false);
  }, []);

  const selectSlot = useCallback(
    (slot: Slot): void => {
      if (slot.id) {
        closeBooking();
        closeAppointment();
        setSelectedSlotId(slot.id);
      }
    },
    [closeBooking, closeAppointment]
  );

  // The open appointment is held apart from the calendar's, so that a visit cancelled from
  // its pane stays open, showing it cancelled, once the calendar stops loading it.
  useResourceModified('Appointment', (event) => {
    if (!selectedAppointment || event.id !== selectedAppointment.id) {
      return;
    }
    if (event.operation === 'delete') {
      closeAppointment();
    } else if (event.resource) {
      setSelectedAppointment(event.resource);
    }
  });

  const openAppointment = useMemo((): WithId<Appointment> | undefined => {
    if (!selectedAppointment) {
      return undefined;
    }
    const loaded = appointments?.find((a) => a.id === selectedAppointment.id);
    // One that left the calendar some other way, by paging or by hiding its calendars,
    // closes with it.
    const statuses: readonly string[] = RESOURCE_OPTIONS.appointmentStatuses;
    return loaded ?? (statuses.includes(selectedAppointment.status) ? undefined : selectedAppointment);
  }, [appointments, selectedAppointment]);

  const openSlot = useMemo((): WithId<Slot> | undefined => {
    if (selectedSlotId) {
      return (slots ?? []).find((s) => s.id === selectedSlotId);
    }
    return undefined;
  }, [slots, selectedSlotId]);
  // A Slot that leaves the calendar, by paging, hiding its calendar, or deletion, closes for good
  // rather than reopening when it is loaded again.
  if (selectedSlotId && slots && !openSlot) {
    setSelectedSlotId(undefined);
  }

  const toItem = (candidate: ScheduleCandidate, selected: boolean): CalendarsPanelItem => ({
    id: candidate.schedule.id,
    label: getCandidateDisplay(candidate),
    selected,
  });

  const panelItems = Object.fromEntries(
    BOOKABLE_ACTOR_TYPES.map((actorType) => [
      actorType,
      candidatesByActorType[actorType].map((c) => toItem(c, !deselectedIds[actorType].has(c.schedule.id))),
    ])
  ) as Record<BookableActorType, CalendarsPanelItem[]>;

  const displayError = resourcesError ?? schedulesLoadingError;

  // The pane beside the calendar shows one thing at a time. Opening any of them already
  // closes the others, so this only decides which wins if they ever hold something together.
  const showSlot = openSlot !== undefined && openAppointment === undefined;
  const showBooking = bookingSelection !== undefined && openAppointment === undefined && openSlot === undefined;
  const blocking = showBooking && paneTab === 'block';

  return (
    <div className={`${classes.root} ${props.className ?? ''}`}>
      <Box className={classes.sidebar}>
        <CalendarsPanel
          items={panelItems}
          candidatesLoading={candidatesLoading}
          onToggle={toggleCandidate}
          filters={<CalendarFilters defaultValue={initialFilters} onChange={setFilters} />}
        />
      </Box>
      <div className={classes.calendar}>
        {displayError !== undefined && (
          <Alert color="red" mb="xs">
            {normalizeErrorString(displayError)}
          </Alert>
        )}
        <MultiCalendar
          className={classes.multiCalendar}
          sources={sources}
          onRangeChange={setRange}
          loading={resourcesLoading || servicesPending}
          onSelectInterval={startBooking}
          onSelectAppointment={selectAppointment}
          onSelectSlot={selectSlot}
          selection={blocking ? blockHighlight : bookingSelection}
          selectedId={openAppointment?.id ?? openSlot?.id}
        />
        <div className={classes.footer}>
          <CalendarTimezoneNotice timezones={timezones} anyUnknown={anyUnknown} />
          <CalendarLegend className={classes.legend} serviceTypes={serviceTypes} />
        </div>
      </div>
      {openAppointment && (
        <section
          key={openAppointment.id}
          className={cx(classes.pane, { [classes.paneWide]: rescheduleFinderOpen })}
          aria-label="Appointment details"
        >
          <Group justify="space-between" wrap="nowrap" mb="sm">
            <Title order={4}>Appointment details</Title>
            <CloseButton aria-label="Close appointment details" onClick={closeAppointment} />
          </Group>
          <AppointmentDetails
            appointment={openAppointment}
            canBypassSchedulingRules={canBypassSchedulingRules}
            cancellationReasonValueSet={appointmentCancellationReasonValueSet}
            onCancelled={props.onCancelled}
            onConfirmed={props.onConfirmed}
            onRescheduled={props.onRescheduled}
            onToggleTimeFinder={setRescheduleFinderOpen}
            onUpdated={props.onUpdated}
            procedureBinding={procedureBinding}
            diagnosisBinding={diagnosisBinding}
            mrnSystem={mrnSystem}
          />
        </section>
      )}
      {showSlot && (
        <section key={openSlot.id} className={classes.pane} aria-label="Blocked time details">
          <Group justify="space-between" wrap="nowrap" mb="sm">
            <Title order={4}>Blocked time</Title>
            <CloseButton aria-label="Close blocked time details" onClick={() => setSelectedSlotId(undefined)} />
          </Group>
          <SlotDetails slot={openSlot} />
        </section>
      )}
      {showBooking && (
        <section
          className={cx(classes.pane, { [classes.paneWide]: timeFinderOpen && !blocking })}
          aria-label="Book appointment"
        >
          <Group justify="space-between" wrap="nowrap" mb="sm">
            <Title order={4}>{blocking ? 'Block time' : 'Book appointment'}</Title>
            <CloseButton aria-label="Close booking form" onClick={closeBooking} />
          </Group>
          {/* Both panels stay mounted, so switching tabs loses nothing typed into either. */}
          <Tabs value={paneTab} onChange={(value) => setPaneTab(value as PaneTab)}>
            <Tabs.List mb="sm">
              <Tabs.Tab value="appointment">Appointment</Tabs.Tab>
              <Tabs.Tab value="block">Block</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="appointment">
              <AppointmentBookingForm
                defaultStart={bookingSelection.start}
                procedureBinding={procedureBinding}
                diagnosisBinding={diagnosisBinding}
                mrnSystem={mrnSystem}
                canBypassSchedulingRules={canBypassSchedulingRules}
                appointmentExtensions={appointmentExtensions}
                allowRecurring
                onToggleTimeFinder={setTimeFinderOpen}
                onChangeProposal={setProposal}
                onBooked={finishBooking}
                defaultLocation={selectedLocation}
                defaultService={selectedService}
              />
            </Tabs.Panel>
            <Tabs.Panel value="block">
              <BlockTimeForm
                candidatesByActorType={candidatesByActorType}
                defaultRange={bookingSelection}
                onChangeTime={setBlockHighlight}
                onBlocked={finishBlock}
              />
            </Tabs.Panel>
          </Tabs>
        </section>
      )}
    </div>
  );
}

/**
 * Reads the HealthcareServices the appointments are for. We use
 * `HealthcareService.name` to title events, and read an extension
 * (see SchedulingColorURI) to choose a color to draw the event in.
 *
 * @param appointments - The appointments on the calendar.
 * @returns The services whose reads have settled, by reference: undefined for one that could
 * not be read.
 */
function useAppointmentServices(
  appointments: readonly Appointment[] | undefined
): ReadonlyMap<string, HealthcareService | undefined> {
  const medplum = useMedplum();
  const [services, setServices] = useState(NO_SERVICES);

  // A string, so the effect below runs only when the references themselves change.
  const referencesKey = useMemo(() => {
    const references = new Set(
      (appointments ?? []).map((a) => extractServiceTypeReferences(a.serviceType)[0]?.reference).filter(isDefined)
    );
    return [...references].sort((a, b) => a.localeCompare(b)).join(',');
  }, [appointments]);

  useEffect(() => {
    if (!referencesKey) {
      return;
    }
    // No abort signal: these reads are shared, through the client's cache, with the event
    // titles, which would fail along with them. A late result is still worth keeping.
    // Each settles on its own, so one slow read doesn't hold back the other service types.
    const settle = (reference: string, read: HealthcareService | undefined): void =>
      setServices((previous) => {
        // A failed read settles the service without forgetting one read before.
        const service = read ?? previous.get(reference);
        return previous.has(reference) && previous.get(reference) === service
          ? previous
          : new Map(previous).set(reference, service);
      });
    for (const reference of referencesKey.split(',')) {
      medplum
        .readReference<HealthcareService>({ reference })
        .then((service) => settle(reference, service))
        .catch(() => settle(reference, undefined));
    }
  }, [medplum, referencesKey]);

  return services;
}

function toggleId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
