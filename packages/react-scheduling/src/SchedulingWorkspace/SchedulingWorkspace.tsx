// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineColor } from '@mantine/core';
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  CloseButton,
  Divider,
  getThemeColor,
  Group,
  Popover,
  Stack,
  Tabs,
  Text,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import {
  extractServiceTypeReferences,
  getReferenceString,
  isDefined,
  isResourceWithId,
  normalizeErrorString,
} from '@medplum/core';
import type {
  Appointment,
  Extension,
  HealthcareService,
  Location,
  Reference,
  Resource,
  Slot,
} from '@medplum/fhirtypes';
import { useMedplum, useResourceModified } from '@medplum/react-hooks';
import { IconCalendarPlus, IconFilter2Search } from '@tabler/icons-react';
import cx from 'clsx';
import type { CSSProperties, JSX, PointerEvent, ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BookableActorType } from '../actors';
import { BOOKABLE_ACTOR_TYPES } from '../actors';
import type { AppointmentBooking } from '../AppointmentFinder/AppointmentBookingForm';
import { AppointmentBookingForm } from '../AppointmentFinder/AppointmentBookingForm';
import type { ActorSelections, ScheduleCandidate } from '../AppointmentFinder/AppointmentFinder.schedules';
import {
  getCandidateDisplay,
  getRequirements,
  searchScheduleCandidates,
} from '../AppointmentFinder/AppointmentFinder.schedules';
import { formatZonedTime, getAppointmentKey } from '../AppointmentFinder/AppointmentFinder.times';
import type { AppointmentWrite } from '../AppointmentFinder/AppointmentFinder.writes';
import type { AppointmentProposalFormActions } from '../AppointmentFinder/AppointmentProposalForm';
import type { AppointmentReschedule } from '../AppointmentFinder/AppointmentRescheduleForm';
import { isServiceKeptAtAnyLocation } from '../AppointmentFinder/AppointmentServiceSelect.utils';
import type { AvailabilityShade, AvailabilityShadingCalendar } from '../availabilityShading';
import { computeBookingShading } from '../availabilityShading';
import { resolveBookingGeometry } from '../bookingGeometry';
import { filterBookedSlots } from '../CalendarBase/CalendarBase.utils';
import { fallbackColorIndex, getSchedulingColor, resolveThemeColor } from '../colors';
import { DiscardChangesModal } from '../ConfirmModal/DiscardChangesModal';
import { useSchedulingResources } from '../hooks/useSchedulingResources';
import type { CalendarHandle, MultiCalendarSource } from '../MultiCalendar/MultiCalendar';
import { MultiCalendar } from '../MultiCalendar/MultiCalendar';
import type { CalendarSelection, DateTimeRange } from '../types';
import { AppointmentDetails } from './AppointmentDetails/AppointmentDetails';
import { BlockTimeForm } from './BlockTimeForm/BlockTimeForm';
import type { CalendarFilterValues } from './CalendarFilters';
import { CalendarFilters } from './CalendarFilters';
import { keepServicesAtSites } from './CalendarFilters.utils';
import type { ServiceTypeLegendItem } from './CalendarLegend';
import { CalendarLegend } from './CalendarLegend';
import type { CalendarsPanelItem } from './CalendarsPanel/CalendarsPanel';
import { CalendarsPanel } from './CalendarsPanel/CalendarsPanel';
import { CalendarTimezoneNotice } from './CalendarTimezoneNotice';
import { PaneHeader } from './PaneHeader';
import classes from './SchedulingWorkspace.module.css';
import {
  filterSlotsByDrawnAppointments,
  getCalendarTimezones,
  groupAppointmentsByService,
  matchesCalendarFilters,
} from './SchedulingWorkspace.utils';
import { SlotDetails } from './SlotDetails';
import { UnifiedCalendarFilters } from './UnifiedCalendarFilters';
import { useBookingPaneGuard } from './useBookingPaneGuard';

type CandidatesByActorType = Readonly<Record<BookableActorType, ScheduleCandidate[]>>;
type DeselectedIdsByActorType = Readonly<Record<BookableActorType, ReadonlySet<string>>>;
type PaneTab = 'appointment' | 'block';

const NO_CANDIDATES: CandidatesByActorType = { Practitioner: [], Location: [], Device: [] };

const NO_SERVICES: ReadonlyMap<string, HealthcareService | undefined> = new Map();

const NO_FILTERS: CalendarFilterValues = {};

const NO_SELECTIONS: ActorSelections = {};

const DAY_MS = 24 * 60 * 60 * 1000;

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
  /**
   * The workspace's background: behind the calendars, the calendar and the pane beside it, and
   * the drawer the pane widens into. Pass the host page's color to sit the workspace flush on
   * the page. A theme color such as `gray.0`, or any CSS color. Defaults to the body color.
   */
  readonly backgroundColor?: MantineColor;
  /** The ValueSet the procedure code field binds to. Defaults to full CPT valueset. */
  readonly procedureBinding?: string;
  /** The ValueSet the diagnosis code field binds to. Defaults to full ICD-10-CM valueset. */
  readonly diagnosisBinding?: string;
  /** See {@link AppointmentProposalFormProps.mrnSystem}. */
  readonly mrnSystem?: string;
  /**
   * The most characters an appointment's notes may hold, when booking and when editing. See
   * {@link AppointmentProposalFormProps.commentMaxLength}.
   */
  readonly appointmentCommentMaxLength?: number;
  readonly onBooked?: (booking: AppointmentBooking) => void | Promise<void>;
  /** Called with the Slots written when time is blocked from the pane's Block Time tab. */
  readonly onBlocked?: (slots: WithId<Slot>[]) => void | Promise<void>;
  readonly onCancelled?: (appointment: WithId<Appointment>) => void | Promise<void>;
  /** Called with what `$confirm` wrote, after a pending appointment is confirmed from its details. */
  readonly onConfirmed?: (confirmation: AppointmentWrite) => void | Promise<void>;
  readonly onRescheduled?: (reschedule: AppointmentReschedule) => void | Promise<void>;
  /** Called with the appointment as written, after its visit type's codes are edited. */
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
   * The site the Service facility filter starts on, e.g. the facility the host launched
   * scheduling from. The user can still change or clear it. Read once on mount; key
   * the workspace to start it over on another site.
   */
  readonly defaultServiceFacility?: WithId<Location> | (Reference<Location> & { reference: string });
  /** Prototype. Called with the site the workspace is on, on mount and whenever either pane changes it. */
  readonly onChangeServiceFacility?: (serviceFacility: Reference<Location> | WithId<Location> | undefined) => void;
  /**
   * Prototype. Lists the filters pane's visit types once, each with its appointments and its availability
   * to turn on, in place of a Visit Type filter and an Availability field picked from apart. See
   * `UnifiedCalendarFilters`.
   */
  readonly unifiedVisitTypes?: boolean;
}

/**
 * A data-coordination component pairing `CalendarsPanel` with {@link MultiCalendar}.
 *
 * Prototype: on this branch the workspace has two panes, at most one open, and the open one drives the
 * calendar: the filters pane on the left for browsing, the booking pane on the right for booking. The
 * notes below on opening the form from a click describe the workspace as it is on main. The Find And
 * Book story says what changed.
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
 *   The new appointment then opens in the pane, selected on the calendar, which pages
 *   to its day.
 * - Blocks time from the calendar: the same pane has a Block Time tab, writing a `busy` Slot
 *   over the time on each calendar the user names, reported through `onBlocked`. The new
 *   blocked time then opens in the pane, on a calendar shown where it can, with the other
 *   calendars it blocks listed beside it, and the calendar pages to its day.
 * - Shows what is booked: clicking an appointment opens `AppointmentDetails` in the
 *   same pane the booking form uses, describing the visit and offering to cancel or
 *   reschedule it, or to confirm one still pending.
 * - Shows blocked time: clicking a Slot opens `SlotDetails` in that same pane, saying
 *   whose time it holds, when, and why, and offering to edit its time and comment or
 *   delete it.
 * - Highlights the time clicked, and draws the visit the form would book as a draft
 *   appointment beside it, from whenever the form holds a time until it drops it. The
 *   calendar is never moved to reach either; one off the days on screen is drawn again
 *   on paging back to it.
 * - Filters calendars and what is booked on them: the Service facility and Visit Type filters
 *   narrow the calendars listed to the ones held at that site and offering that service type,
 *   and the appointments drawn to the ones recording that site and naming that service type.
 *   Under either filter, the Slots of an appointment it hides, such as its buffers, are hidden
 *   with it. Blocked time stays on every calendar left listed: Slots record no site, and a
 *   block takes its actor's time whatever the visit type.
 * - Keeps an open appointment or blocked time open until it is closed, even once paging,
 *   filtering, or hiding its calendars takes it off the calendar, with a notice saying when the
 *   filters or hidden calendars are why.
 * - Can open on a site the host chooses: `defaultServiceFacility` is where the Service facility filter,
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
    appointmentCommentMaxLength,
    onBooked,
    onBlocked,
    appointmentCancellationReasonValueSet,
    canBypassSchedulingRules,
    appointmentExtensions,
    defaultServiceFacility,
    onChangeServiceFacility,
    unifiedVisitTypes = false,
  } = props;
  const medplum = useMedplum();
  const theme = useMantineTheme();

  const [schedulesLoadingError, setSchedulesLoadingError] = useState<unknown>();

  const [candidatesByActorType, setCandidatesByActorType] = useState<CandidatesByActorType>(NO_CANDIDATES);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [deselectedIds, setDeselectedIds] = useState<DeselectedIdsByActorType>(NONE_DESELECTED);

  // Prototype: two panes, at most one open, and the open one drives the calendar.
  //
  // The filters pane, on the left, is for browsing. Its site narrows the calendars listed and the
  // appointments drawn, its visit types the appointments drawn only, and its checklist the calendars on
  // show. Its Availability field, which filters nothing, shades where the visit types it names could
  // go. It also drives the calendar while both panes are closed.
  //
  // The booking pane, on the right, is for booking. Its form's visit type narrows the calendars to the
  // ones serving it, whose other appointments stay drawn, as they explain gaps in the shading. Its visit
  // type and actors decide the availability shaded, and its actors, once any is named, the calendars on
  // show.
  //
  // The site is the one answer the panes share. The filters pane can hold several, and the booking form,
  // which books at one, starts on the first of them and makes its own site their first.
  const [filters, setFilters] = useState<CalendarFilterValues>(
    defaultServiceFacility ? { serviceFacilities: [defaultServiceFacility] } : NO_FILTERS
  );
  // Remounts the filter fields on the site the booking form moved to.
  const [filtersKey, setFiltersKey] = useState(0);
  // The site the booking form is on. The filters' first, except while the form's is cleared and the
  // filters hold several, which the form leaves alone.
  const [formServiceFacility, setFormServiceFacility] = useState(defaultServiceFacility);
  const [bookingOpen, setBookingOpen] = useState(true);
  const [formService, setFormService] = useState<WithId<HealthcareService>>();
  const [formSelections, setFormSelections] = useState<ActorSelections>(NO_SELECTIONS);
  // Remounts the form, starting it over on the site the workspace is on.
  const [formKey, setFormKey] = useState(0);
  // Where open time was clicked while browsing, which is where the offer to start booking is drawn.
  const [bookPrompt, setBookPrompt] = useState<PointerPosition & { readonly start?: BookingStart }>();
  // Where shading several providers are free in was clicked with nobody named, which is where the
  // reminder to name one is drawn.
  const [providerPrompt, setProviderPrompt] = useState<PointerPosition>();
  const lastPointer = useRef<PointerPosition>(undefined);
  // Only the booking form's visit type narrows the calendars. The filter's does not: the availability
  // shaded is worked out from the calendars on show, so it would take away shading asked for beside it.
  const calendarService = bookingOpen ? formService : undefined;
  // A visit type in the booking form hides no appointments, so only its site is left of the filters.
  const calendarFilters = useMemo(
    (): CalendarFilterValues =>
      bookingOpen ? { serviceFacilities: formServiceFacility ? [formServiceFacility] : undefined } : filters,
    [bookingOpen, filters, formServiceFacility]
  );
  const calendarFacilities = calendarFilters.serviceFacilities;
  // The offered time under the pointer, in the time search or on the calendar's shading, drawn on the
  // calendar as a fainter draft.
  const [hoveredTime, setHoveredTime] = useState<Appointment>();
  // Where the pointer is on the shading, to the pixel. A click reports only the grid row it landed in,
  // which can hold several offered times, so the click picks by this instead.
  const shadingHoverInstant = useRef<Date>(undefined);
  // The availability block the pointer is on, which while browsing says whose lane a click is in.
  const hoveredShadeId = useRef<string>(undefined);
  // The visit type the booking form opens on, when it is opened from a click on that visit type's lane.
  const [formDefaultService, setFormDefaultService] = useState<WithId<HealthcareService>>();
  // The provider and time that click also settled, handed to the form once the pane's opening mounts it.
  const pendingFormPick = useRef<{ readonly provider: ScheduleCandidate; readonly instant: Date }>(undefined);
  useEffect(() => {
    const pick = pendingFormPick.current;
    if (bookingOpen && pick) {
      pendingFormPick.current = undefined;
      formActionsRef.current?.pickWith('Practitioner', pick.provider, pick.instant);
    }
  }, [bookingOpen]);
  const formActionsRef = useRef<AppointmentProposalFormActions>(null);

  const [range, setRange] = useState<DateTimeRange>();

  // What was selected
  const [blockRange, setBlockRange] = useState<DateTimeRange>(getNextHalfHour);
  const [blockSeed, setBlockSeed] = useState(0);
  const [selectedAppointment, setSelectedAppointment] = useState<WithId<Appointment>>();
  const [selectedSlot, setSelectedSlot] = useState<WithId<Slot>>();
  // The Slots of a block just written, one per calendar, listed beside whichever is open.
  const [newBlockSlots, setNewBlockSlots] = useState<readonly WithId<Slot>[]>();

  const calendarRef = useRef<CalendarHandle>(null);

  const [paneTab, setPaneTab] = useState<PaneTab>('appointment');

  // The visit the booking form would book, drawn on the calendar apart from the click that
  // opened it, so each has one writer.
  const [proposal, setProposal] = useState<Appointment>();
  // What the calendar highlights while blocking: the block form's time, which a click resets.
  const [blockHighlight, setBlockHighlight] = useState<DateTimeRange | undefined>(blockRange);
  const [calendarsOpen, setCalendarsOpen] = useState(false);
  const sidebarId = useId();
  const bookingPaneId = useId();
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
        const candidates = await searchScheduleCandidates(medplum, calendarService, {
          actorType,
          query: '',
          location: calendarFacilities,
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
  }, [medplum, calendarService, calendarFacilities]);

  // While booking, the actors the form names are the calendars on show, and until it names any, every
  // calendar found. While browsing, the Calendars panel decides.
  const formCandidates = useMemo(() => {
    const byId = new Map(
      getRequirements(formSelections).flatMap((row) => row.candidates.map((c) => [c.schedule.id, c] as const))
    );
    return [...byId.values()];
  }, [formSelections]);

  const activeCandidates = useMemo(() => {
    if (bookingOpen && formCandidates.length > 0) {
      return formCandidates;
    }
    return BOOKABLE_ACTOR_TYPES.flatMap((actorType) =>
      candidatesByActorType[actorType].filter((c) => bookingOpen || !deselectedIds[actorType].has(c.schedule.id))
    );
  }, [bookingOpen, formCandidates, candidatesByActorType, deselectedIds]);

  const schedules = useMemo(() => activeCandidates.map((c) => c.schedule), [activeCandidates]);
  const {
    slots,
    appointments,
    loading: resourcesLoading,
    error: resourcesError,
  } = useSchedulingResources(schedules, range, RESOURCE_OPTIONS);
  const services = useAppointmentServices(appointments);

  const { sources, serviceTypes, servicesPending, shownSlots, isOnShownCalendar } = useMemo(() => {
    const isSettled = (reference: string): boolean =>
      services.has(reference) || medplum.getCachedReference({ reference }) !== undefined;
    // The color the HealthcareService names, or else one picked by its reference, so it holds
    // whichever days are on show, for everyone, and as other service types come and go.
    const serviceColor = (reference: string): keyof typeof theme.colors => {
      const service = services.get(reference) ?? medplum.getCachedReference<HealthcareService>({ reference });
      return resolveThemeColor(theme, getSchedulingColor(service), fallbackColorIndex(reference));
    };
    const actorsOnShow = new Set(
      activeCandidates
        .flatMap((candidate) => candidate.schedule.actor.map((actor) => actor.reference))
        .filter(isDefined)
    );
    const isOnShownCalendar = (appointment: Appointment): boolean =>
      appointment.participant.some(
        (participant) => participant.actor?.reference && actorsOnShow.has(participant.actor.reference)
      );
    const appointmentsOnShow = (appointments ?? []).filter(isOnShownCalendar);
    const visibleAppointments = appointmentsOnShow.filter((appointment) =>
      matchesCalendarFilters(appointment, calendarFilters)
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
    // Under a filter, the Slots of an appointment it hides go with it. Blocked time stays: the
    // calendars listed are already the ones the filters keep.
    const shownSlots =
      calendarFilters.services || calendarFilters.serviceFacilities?.length
        ? filterSlotsByDrawnAppointments(slots ?? [], appointments ?? [], visibleAppointments)
        : (slots ?? []);
    const openSlots = filterBookedSlots(
      shownSlots,
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
    // Hidden with the Book Appointment tab, as the selection follows the tab on show. Drafts, and
    // not clickable: there is nothing booked yet to open.
    const draftsOnShow = paneTab === 'appointment' && !selectedAppointment && !selectedSlot;
    const toDraftSource = (draft: Appointment, label: string, ghost: boolean): MultiCalendarSource => {
      const reference = extractServiceTypeReferences(draft.serviceType)[0]?.reference;
      return {
        color: reference ? serviceColor(reference) : 'gray',
        slots: [],
        appointments: [draft],
        interactive: false,
        draft: true,
        ghost,
        label,
      };
    };
    const hoverIsProposal = hoveredTime && proposal && getAppointmentKey(hoveredTime) === getAppointmentKey(proposal);
    const proposalSources = draftsOnShow
      ? [
          ...(proposal ? [toDraftSource(proposal, 'Draft New Appointment', false)] : []),
          ...(hoveredTime && !hoverIsProposal
            ? [toDraftSource(hoveredTime, getProposedTimeLabel(hoveredTime), true)]
            : []),
        ]
      : [];
    const legend = groups
      .map(({ reference, group, color }): ServiceTypeLegendItem => ({
        id: reference ?? 'none',
        // Named as its events are titled, by the HealthcareService its color is picked from.
        appointment: group[0],
        color,
      }))
      // By reference, so the order holds from page to page; the names load only as the legend
      // shows them. The appointments naming no service type go last.
      .sort((a, b) => Number(a.id === 'none') - Number(b.id === 'none') || a.id.localeCompare(b.id));
    return {
      sources: [...calendarSources, ...serviceSources, ...proposalSources],
      serviceTypes: legend,
      servicesPending: groups.length < allGroups.length,
      shownSlots,
      isOnShownCalendar,
    };
  }, [
    activeCandidates,
    slots,
    appointments,
    calendarFilters,
    services,
    medplum,
    theme,
    paneTab,
    proposal,
    hoveredTime,
    selectedAppointment,
    selectedSlot,
  ]);

  // A calendar with what is held on it, for working out its open time. Indexed once, as there can be
  // hundreds of calendars and thousands of appointments, and each shading asks for every calendar.
  const toShadingCalendar = useMemo(() => {
    const appointmentsByActor = new Map<string, Appointment[]>();
    for (const appointment of appointments ?? []) {
      for (const participant of appointment.participant) {
        const reference = participant.actor?.reference;
        if (reference) {
          const held = appointmentsByActor.get(reference) ?? [];
          held.push(appointment);
          appointmentsByActor.set(reference, held);
        }
      }
    }
    const slotsBySchedule = new Map<string, Slot[]>();
    for (const slot of slots ?? []) {
      const reference = slot.schedule?.reference;
      if (reference) {
        const held = slotsBySchedule.get(reference) ?? [];
        held.push(slot);
        slotsBySchedule.set(reference, held);
      }
    }
    return (candidate: ScheduleCandidate): AvailabilityShadingCalendar => ({
      schedule: candidate.schedule,
      appointments: [
        ...new Set(candidate.schedule.actor.flatMap((actor) => appointmentsByActor.get(actor.reference ?? '') ?? [])),
      ],
      slots: slotsBySchedule.get(getReferenceString(candidate.schedule)) ?? [],
    });
  }, [appointments, slots]);

  // Where the visit the form describes could go, shaded behind the events. With only a visit type, any
  // provider will do; once the form names actors, its rows decide, as they do for `$find`.
  const availabilityShading = useMemo(() => {
    if (!formService || !range) {
      return undefined;
    }
    const namedRows = getRequirements(formSelections).filter((row) => row.candidates.length > 0);
    const rows =
      namedRows.length > 0
        ? namedRows.map((row) => row.candidates.map(toShadingCalendar))
        : [candidatesByActorType.Practitioner.map(toShadingCalendar)];
    return computeBookingShading({
      rows,
      service: formService,
      serviceFacility: formServiceFacility,
      range,
      color: resolveThemeColor(
        theme,
        getSchedulingColor(formService),
        fallbackColorIndex(getReferenceString(formService))
      ),
      minMinutes: resolveBookingGeometry(formService).duration,
      from: new Date(),
    });
  }, [formService, formSelections, formServiceFacility, range, toShadingCalendar, candidatesByActorType, theme]);

  // While browsing, where each visit type chosen under Availability could go: at least one provider's
  // calendar on show is open for it. One visit type takes the day's whole column, and several a lane
  // each, in the order chosen, named on the first block of the day as two can share a color.
  const browseShading = useMemo(() => {
    const chosen = filters.availabilityServices ?? [];
    if (bookingOpen || chosen.length === 0 || !range) {
      return undefined;
    }
    const calendars = candidatesByActorType.Practitioner.filter(
      (candidate) => !deselectedIds.Practitioner.has(candidate.schedule.id)
    ).map(toShadingCalendar);
    const from = new Date();
    const serviceByShade = new Map<string, WithId<HealthcareService>>();
    const shades = chosen.flatMap((service, lane) => {
      let labelledDay: string | undefined;
      return computeBookingShading({
        rows: [calendars],
        service,
        serviceFacility: filters.serviceFacilities,
        range,
        color: resolveThemeColor(theme, getSchedulingColor(service), fallbackColorIndex(getReferenceString(service))),
        minMinutes: resolveBookingGeometry(service).duration,
        from,
      }).map((shade): AvailabilityShade => {
        const day = shade.start.toDateString();
        const label = chosen.length > 1 && day !== labelledDay ? service.name : undefined;
        labelledDay = day;
        const id = `${service.id}-${shade.id}`;
        serviceByShade.set(id, service);
        return { ...shade, id, left: lane / chosen.length, width: 1 / chosen.length, label };
      });
    });
    return { shades, serviceByShade };
  }, [bookingOpen, filters, range, candidatesByActorType, deselectedIds, toShadingCalendar, theme]);

  const { timezones, anyUnknown } = useMemo(() => getCalendarTimezones(activeCandidates), [activeCandidates]);

  const changeFilters = useCallback(
    (values: CalendarFilterValues): void => {
      setFilters(values);
      onChangeServiceFacility?.(values.serviceFacilities?.[0]);
    },
    [onChangeServiceFacility]
  );

  // The form's site becomes the filters' first: moved up if it is already among them, and otherwise in
  // place of the first one. The form's field has to be cleared before another site can be chosen, so a
  // cleared site leaves several filter sites alone, and clears a lone one, as it did when there was only
  // ever one. The form reports its site on mount too, which changes nothing.
  //
  // The filter fields hold their own state, so they are remounted on the result, dropping the visit types
  // none of its sites hold, as they do when their own sites change.
  const changeFormServiceFacility = useCallback(
    (serviceFacility: Reference<Location> | WithId<Location> | undefined): void => {
      onChangeServiceFacility?.(serviceFacility);
      const next =
        serviceFacility && (isResourceWithId(serviceFacility) || serviceFacility.reference)
          ? (serviceFacility as NonNullable<CalendarFilterValues['serviceFacilities']>[number])
          : undefined;
      const nextReference = next && getReferenceString(next);
      if (nextReference !== (formServiceFacility && getReferenceString(formServiceFacility))) {
        setFormServiceFacility(next);
        setHoveredTime(undefined);
      }
      const sites = filters.serviceFacilities ?? [];
      if (nextReference === (sites[0] && getReferenceString(sites[0])) || (!next && sites.length > 1)) {
        return;
      }
      const others = sites.filter((site) => getReferenceString(site) !== nextReference);
      const alreadyChosen = others.length < sites.length;
      const serviceFacilities = next ? [next, ...(alreadyChosen ? others : others.slice(1))] : [];
      setFilters({
        serviceFacilities,
        services: keepServicesAtSites(filters.services, serviceFacilities),
        availabilityServices: filters.availabilityServices?.filter((service) =>
          isServiceKeptAtAnyLocation(service, serviceFacilities)
        ),
      });
      setFiltersKey((key) => key + 1);
    },
    [filters, formServiceFacility, onChangeServiceFacility]
  );

  const changeFormService = useCallback((service: WithId<HealthcareService> | undefined): void => {
    setHoveredTime(undefined);
    setProviderPrompt(undefined);
    setFormService(service);
  }, []);

  const changeFormSelections = useCallback((selections: ActorSelections): void => {
    setHoveredTime(undefined);
    setProviderPrompt(undefined);
    setFormSelections(selections);
  }, []);

  // Starts the booking form over on the filters' first site.
  const resetBookingForm = useCallback((): void => {
    setFormKey((key) => key + 1);
    setFormServiceFacility(filters.serviceFacilities?.[0]);
    setFormDefaultService(undefined);
    setFormService(undefined);
    setFormSelections(NO_SELECTIONS);
    setProposal(undefined);
    setHoveredTime(undefined);
  }, [filters]);

  const discard = useBookingPaneGuard();
  const { guard, reset: resetDirty } = discard;

  // Closing the pane unmounts both forms, which clears their answers. The site is held here, so it stays.
  const closeBooking = useCallback((): void => {
    setBookingOpen(false);
    resetBookingForm();
    setBlockHighlight(undefined);
    resetDirty();
  }, [resetBookingForm, resetDirty]);

  // Takes the filters pane's place, and that of any details open, so the form is what shows. What to
  // start on is given when the click that opens it was on a visit type's availability.
  const openBooking = useCallback(
    (start?: BookingStart): void => {
      const nextHalfHour = getNextHalfHour();
      setBlockRange(nextHalfHour);
      setBlockHighlight(nextHalfHour);
      setBookPrompt(undefined);
      setCalendarsOpen(false);
      setSelectedAppointment(undefined);
      setSelectedSlot(undefined);
      setNewBlockSlots(undefined);
      setRescheduleFinderOpen(false);
      setFormServiceFacility(filters.serviceFacilities?.[0]);
      setFormDefaultService(start?.service);
      setFormService(start?.service);
      pendingFormPick.current =
        start?.provider && start.instant ? { provider: start.provider, instant: start.instant } : undefined;
      setBookingOpen(true);
    },
    [filters]
  );

  const toggleBooking = useCallback((): void => {
    if (bookingOpen) {
      guard(closeBooking);
    } else {
      openBooking();
    }
  }, [bookingOpen, guard, closeBooking, openBooking]);

  // The panes are never open together: opening the filters closes the booking pane, asking first if
  // its forms hold answers.
  const toggleCalendars = useCallback((): void => {
    if (calendarsOpen) {
      setCalendarsOpen(false);
    } else if (bookingOpen) {
      guard(() => {
        closeBooking();
        setCalendarsOpen(true);
      });
    } else {
      setCalendarsOpen(true);
    }
  }, [calendarsOpen, bookingOpen, guard, closeBooking]);

  // Where the pointer last went up over the calendar, which is where a click's prompt is drawn. The
  // calendar reports the time clicked, not where on screen.
  const recordPointer = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const box = event.currentTarget;
    const rect = box.getBoundingClientRect();
    lastPointer.current = {
      left: event.clientX - rect.left + box.scrollLeft,
      top: event.clientY - rect.top + box.scrollTop,
    };
  }, []);

  const goToNextRange = useCallback((): void => calendarRef.current?.next(), []);

  // Shows the offered time a click at the pointer would pick, before it is clicked.
  const hoverShading = useCallback((instant: Date | undefined, shadeId?: string): void => {
    shadingHoverInstant.current = instant;
    hoveredShadeId.current = shadeId;
    const offered = instant && formActionsRef.current?.timeAt(instant);
    setHoveredTime((previous) =>
      previous && offered && getAppointmentKey(previous) === getAppointmentKey(offered) ? previous : offered
    );
  }, []);

  // Hides are kept across a service change rather than pruned: a calendar hidden under
  // one service type stays hidden if another offers it again.
  const toggleCandidate = useCallback((actorType: BookableActorType, id: string): void => {
    setDeselectedIds((prev) => ({ ...prev, [actorType]: toggleId(prev[actorType], id) }));
  }, []);

  // Opens what was blocked and pages to it, so it isn't lost when not drawn: a Slot on a calendar
  // shown where there is one, with the others listed beside it.
  const finishBlock = useCallback(
    (slots: WithId<Slot>[]): void | Promise<void> => {
      setBlockSeed((seed) => seed + 1);
      closeBooking();
      const shown = new Set(schedules.map(getReferenceString));
      const opened = slots.find((slot) => shown.has(slot.schedule.reference ?? '')) ?? slots[0];
      setSelectedSlot(opened);
      setNewBlockSlots(slots);
      if (opened?.start) {
        calendarRef.current?.gotoDate(new Date(opened.start));
      }
      return onBlocked?.(slots);
    },
    [closeBooking, onBlocked, schedules]
  );

  const showAppointment = useCallback(
    (appointment: WithId<Appointment>): void => {
      if (appointment.id !== selectedAppointment?.id) {
        setRescheduleFinderOpen(false);
      }
      setSelectedSlot(undefined);
      setNewBlockSlots(undefined);
      setSelectedAppointment(appointment);
    },
    [selectedAppointment?.id]
  );

  // Details take the booking pane's place rather than cover it, so closing them leaves the calendar on
  // its own. That clears the pane's forms, so one holding answers is asked about first.
  const selectAppointment = useCallback(
    (appointment: Appointment): void => {
      if (isResourceWithId(appointment)) {
        guard(() => {
          closeBooking();
          showAppointment(appointment);
        });
      }
    },
    [guard, closeBooking, showAppointment]
  );

  // Opens what was booked, the first visit of a recurring series, and brings it on screen,
  // so it isn't lost on the calendar or in days off screen.
  const finishBooking = useCallback(
    (booking: AppointmentBooking): void | Promise<void> => {
      const [first] = booking.appointments;
      closeBooking();
      showAppointment(first);
      if (first.start) {
        calendarRef.current?.gotoDate(new Date(first.start));
      }
      return onBooked?.(booking);
    },
    [closeBooking, showAppointment, onBooked]
  );

  const closeAppointment = useCallback((): void => {
    setSelectedAppointment(undefined);
    setRescheduleFinderOpen(false);
  }, []);

  const selectSlot = useCallback(
    (slot: Slot): void => {
      if (isResourceWithId(slot)) {
        guard(() => {
          closeBooking();
          closeAppointment();
          setSelectedSlot(slot);
          setNewBlockSlots(undefined);
        });
      }
    },
    [guard, closeBooking, closeAppointment]
  );

  const closeSlot = useCallback((): void => {
    setSelectedSlot(undefined);
    setNewBlockSlots(undefined);
  }, []);

  // The providers whose own open time, among what an availability block is made of, covers an instant.
  const providersFreeAt = useCallback(
    (shade: AvailabilityShade, instant: Date): ScheduleCandidate[] => {
      const free = new Set(
        shade.details
          .filter((detail) => detail.start <= instant && instant < detail.end)
          .map((detail) => detail.schedule.id)
      );
      return candidatesByActorType.Practitioner.filter((candidate) => free.has(candidate.schedule.id));
    },
    [candidatesByActorType]
  );

  // With the filters pane open, open time on the grid offers to start booking, beside the pointer, as
  // taking the pane's place unasked would lose the viewer's place in it. With both panes closed it opens
  // the booking pane. While booking, on the Block Time tab it sets the block's time, and on the Book
  // Appointment tab it picks the offered time covering the click, which there only is inside the shading.
  const selectInterval = useCallback(
    (interval: CalendarSelection): void => {
      if (!bookingOpen) {
        // A click on a visit type's availability is taken to mean that visit type, and where only one
        // provider is free at the time clicked, that provider and time too.
        const shadeId = hoveredShadeId.current;
        const service = shadeId ? browseShading?.serviceByShade.get(shadeId) : undefined;
        const shade = service && browseShading?.shades.find((block) => block.id === shadeId);
        const instant = shadingHoverInstant.current;
        const providers = shade && instant ? providersFreeAt(shade, instant) : [];
        const start: BookingStart | undefined = service && {
          service,
          ...(providers.length === 1 ? { provider: providers[0], instant } : undefined),
        };
        if (!calendarsOpen) {
          openBooking(start);
        } else if (lastPointer.current) {
          setBookPrompt({ ...lastPointer.current, start });
        }
        return;
      }
      if (paneTab === 'block') {
        setBlockRange(interval);
        setBlockHighlight(interval);
      } else if (!interval.allDay) {
        const instant = shadingHoverInstant.current ?? interval.start;
        if (formActionsRef.current?.pickAt(instant) || formCandidates.length > 0) {
          return;
        }
        // With nobody named no time is offered yet, and the shading is every provider's open time. Where
        // only one of them is free the click can only mean that one, so the form names them and picks the
        // time. Where several are, the viewer is told what is missing.
        const shade = availabilityShading?.find((block) => block.start <= instant && instant < block.end);
        if (!shade) {
          return;
        }
        const providers = providersFreeAt(shade, instant);
        if (providers.length === 1) {
          formActionsRef.current?.pickWith('Practitioner', providers[0], instant);
        } else {
          setProviderPrompt(lastPointer.current);
        }
      }
    },
    [
      bookingOpen,
      calendarsOpen,
      openBooking,
      browseShading,
      paneTab,
      formCandidates,
      availabilityShading,
      providersFreeAt,
    ]
  );

  // Held apart from the calendar's, like the open appointment, so it closes on being deleted
  // rather than on leaving the calendar.
  useResourceModified('Slot', (event) => {
    const updated = event.resource;
    if (event.operation === 'delete') {
      setNewBlockSlots((prev) => prev?.filter((slot) => slot.id !== event.id));
    } else if (updated) {
      setNewBlockSlots((prev) => prev?.map((slot) => (slot.id === event.id ? updated : slot)));
    }
    if (!selectedSlot || event.id !== selectedSlot.id) {
      return;
    }
    if (event.operation === 'delete') {
      setSelectedSlot(undefined);
    } else if (event.resource) {
      setSelectedSlot(event.resource);
    }
  });

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

  // Kept open until closed, even off the calendar, so paging or filtering to find it a new time
  // doesn't lose it. Each copy the calendar loads replaces the one held, so it leaves as last seen,
  // unless it is older: a search sent before an edit can land after it.
  const loadedAppointment =
    selectedAppointment &&
    appointments?.find((a) => a.id === selectedAppointment.id && !isOlder(a, selectedAppointment));
  if (loadedAppointment && loadedAppointment !== selectedAppointment) {
    setSelectedAppointment(loadedAppointment);
  }
  const openAppointment = loadedAppointment ?? selectedAppointment;

  // Only the filters and hidden calendars get a notice: a status the calendar doesn't load, such as
  // cancelled, or a time off screen, already says why it isn't drawn.
  let hiddenNotice: string | undefined;
  const statuses: readonly string[] = RESOURCE_OPTIONS.appointmentStatuses;
  if (openAppointment && statuses.includes(openAppointment.status)) {
    if (!matchesCalendarFilters(openAppointment, calendarFilters)) {
      hiddenNotice = 'The calendar filters hide this appointment.';
    } else if (!isOnShownCalendar(openAppointment)) {
      hiddenNotice = "None of this appointment's calendars are shown.";
    }
  }

  // Kept open until closed, as the open appointment is.
  const loadedSlot = selectedSlot && slots?.find((s) => s.id === selectedSlot.id);
  const currentSlot = loadedSlot && !isOlder(loadedSlot, selectedSlot) ? loadedSlot : undefined;
  if (currentSlot && currentSlot !== selectedSlot) {
    setSelectedSlot(currentSlot);
  }
  const openSlot = currentSlot ?? selectedSlot;

  // The calendar loads only the Slots on calendars shown, so one loaded and not drawn is hidden by
  // the filters. One off screen isn't loaded, and its time already says why.
  let slotNotice: string | undefined;
  if (openSlot && !schedules.some((schedule) => getReferenceString(schedule) === openSlot.schedule.reference)) {
    slotNotice = "This blocked time's calendar isn't shown.";
  } else if (loadedSlot && !shownSlots.includes(loadedSlot)) {
    slotNotice = 'The calendar filters hide this blocked time.';
  }
  const otherBlockSlots =
    openSlot && newBlockSlots?.some((slot) => slot.id === openSlot.id)
      ? newBlockSlots.filter((slot) => slot.id !== openSlot.id)
      : [];
  const getCalendarName = (slot: Slot): string => {
    const candidate = BOOKABLE_ACTOR_TYPES.flatMap((actorType) => candidatesByActorType[actorType]).find(
      (c) => getReferenceString(c.schedule) === slot.schedule.reference
    );
    return candidate ? getCandidateDisplay(candidate) : (slot.schedule.display ?? slot.schedule.reference ?? '');
  };

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
  const calendarsLabel = calendarsOpen ? 'Hide calendars' : 'Show calendars';

  // The pane beside the calendar shows one thing at a time. Opening any of them already
  // closes the others, so this only decides which wins if they ever hold something together.
  const showSlot = openSlot !== undefined && openAppointment === undefined;
  const showBooking = bookingOpen && openAppointment === undefined && openSlot === undefined;
  const blocking = showBooking && paneTab === 'block';
  const nextRangeLabel = range ? getNextRangeLabel(range) : undefined;
  const bookingLabel = bookingOpen ? 'Hide booking' : 'Show booking';

  return (
    <div
      className={`${classes.root} ${props.className ?? ''}`}
      style={
        props.backgroundColor
          ? ({ '--scheduling-workspace-background': getThemeColor(props.backgroundColor, theme) } as CSSProperties)
          : undefined
      }
    >
      {/* Hidden rather than unmounted, so the filter fields and open sections are as they were left. */}
      <Box id={sidebarId} className={classes.sidebar} display={calendarsOpen ? undefined : 'none'}>
        <CalendarsPanel
          items={panelItems}
          candidatesLoading={candidatesLoading}
          onToggle={toggleCandidate}
          filters={
            unifiedVisitTypes ? (
              <UnifiedCalendarFilters key={filtersKey} defaultValue={filters} onChange={changeFilters} />
            ) : (
              <CalendarFilters key={filtersKey} defaultValue={filters} onChange={changeFilters} />
            )
          }
        />
      </Box>
      <div className={classes.calendar} onPointerUpCapture={recordPointer}>
        {displayError !== undefined && (
          <Alert color="red" mb="xs">
            {normalizeErrorString(displayError)}
          </Alert>
        )}
        <MultiCalendar
          ref={calendarRef}
          className={classes.multiCalendar}
          sources={sources}
          onRangeChange={setRange}
          toolbarStart={
            <Tooltip label={calendarsLabel} position="bottom" openDelay={500}>
              <ActionIcon
                className={classes.calendarsToggle}
                variant="default"
                size={32}
                radius="xl"
                c="dimmed"
                aria-label={calendarsLabel}
                aria-expanded={calendarsOpen}
                aria-controls={sidebarId}
                onClick={toggleCalendars}
              >
                <IconFilter2Search size={16} />
              </ActionIcon>
            </Tooltip>
          }
          toolbarEnd={
            <Tooltip label={bookingLabel} position="bottom" openDelay={500}>
              <ActionIcon
                className={classes.calendarsToggle}
                variant="default"
                size={32}
                radius="xl"
                c="dimmed"
                aria-label={bookingLabel}
                aria-expanded={bookingOpen}
                aria-controls={bookingPaneId}
                onClick={toggleBooking}
              >
                <IconCalendarPlus size={16} />
              </ActionIcon>
            </Tooltip>
          }
          availabilityShading={showBooking && paneTab === 'appointment' ? availabilityShading : browseShading?.shades}
          onHoverAvailability={hoverShading}
          loading={resourcesLoading || servicesPending}
          onSelectInterval={selectInterval}
          onSelectAppointment={selectAppointment}
          onSelectSlot={selectSlot}
          selection={blocking ? blockHighlight : undefined}
          selectedId={openAppointment?.id ?? openSlot?.id}
        />
        <div className={classes.footer}>
          <CalendarTimezoneNotice timezones={timezones} anyUnknown={anyUnknown} />
          <CalendarLegend className={classes.legend} serviceTypes={serviceTypes} />
        </div>
        {bookPrompt && calendarsOpen && !bookingOpen && (
          <PointerPrompt
            key={`${bookPrompt.left},${bookPrompt.top}`}
            at={bookPrompt}
            position="right-start"
            closeLabel="Dismiss the offer to book"
            onClose={() => setBookPrompt(undefined)}
          >
            <Stack gap="xs">
              <Text size="sm">{getBookPromptText(bookPrompt.start)}</Text>
              <Button size="xs" onClick={() => openBooking(bookPrompt.start)}>
                Open Find + Book
              </Button>
            </Stack>
          </PointerPrompt>
        )}
        {/* Above the pointer, clear of the shading's own tooltip beside it. */}
        {providerPrompt && showBooking && (
          <PointerPrompt
            key={`${providerPrompt.left},${providerPrompt.top}`}
            at={providerPrompt}
            position="top"
            closeLabel="Dismiss the note"
            onClose={() => setProviderPrompt(undefined)}
          >
            <Text size="sm" maw={220}>
              More than one provider is free at this time. Choose a provider to pick it.
            </Text>
          </PointerPrompt>
        )}
      </div>
      {openAppointment && (
        <SidePane key={openAppointment.id} label="Appointment details" wide={rescheduleFinderOpen}>
          <PaneHeader title="Appointment Details" closeLabel="Close appointment details" onClose={closeAppointment} />
          {hiddenNotice && (
            <Alert color="blue" mb="sm">
              {hiddenNotice}
            </Alert>
          )}
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
            commentMaxLength={appointmentCommentMaxLength}
          />
        </SidePane>
      )}
      {showSlot && (
        <SidePane key={openSlot.id} label="Blocked time details">
          <PaneHeader title="Blocked Time" closeLabel="Close blocked time details" onClose={closeSlot} />
          {slotNotice && (
            <Alert color="blue" mb="sm">
              {slotNotice}
            </Alert>
          )}
          {otherBlockSlots.length > 0 && (
            <Text size="sm" mb="sm">
              Also blocked:{' '}
              {otherBlockSlots.map((slot, index) => (
                <Fragment key={slot.id}>
                  {index > 0 && ', '}
                  <Anchor component="button" type="button" size="sm" onClick={() => setSelectedSlot(slot)}>
                    {getCalendarName(slot)}
                  </Anchor>
                </Fragment>
              ))}
            </Text>
          )}
          <SlotDetails slot={openSlot} />
        </SidePane>
      )}
      {/* Its forms are mounted while it is open. Closing it unmounts them, which is what clears their
          answers. */}
      <section id={bookingPaneId} className={classes.paneDocked} aria-label="Book appointment" hidden={!showBooking}>
        {bookingOpen && (
          // Both panels stay mounted, so switching tabs loses nothing typed into either.
          <Tabs
            value={paneTab}
            onChange={(value) => setPaneTab(value as PaneTab)}
            variant="pills"
            radius="xl"
            classNames={{ root: classes.paneTabs, tab: classes.paneTab, panel: classes.paneTabPanel }}
          >
            <Stack gap="sm" mb="sm">
              <Tabs.List>
                <Tabs.Tab value="appointment">Book Appointment</Tabs.Tab>
                <Tabs.Tab value="block">Block Time</Tabs.Tab>
              </Tabs.List>
              <Divider />
            </Stack>
            <Tabs.Panel value="appointment">
              <AppointmentBookingForm
                key={formKey}
                procedureBinding={procedureBinding}
                diagnosisBinding={diagnosisBinding}
                mrnSystem={mrnSystem}
                commentMaxLength={appointmentCommentMaxLength}
                canBypassSchedulingRules={canBypassSchedulingRules}
                appointmentExtensions={appointmentExtensions}
                allowRecurring
                finderAlwaysOpen
                keepsServiceFacility
                searchRange={range}
                nextRangeLabel={nextRangeLabel}
                onNextRange={goToNextRange}
                onHoverTime={setHoveredTime}
                highlightedTime={hoveredTime}
                onChangeProposal={setProposal}
                onChangeServiceFacility={changeFormServiceFacility}
                onChangeService={changeFormService}
                onChangeSelections={changeFormSelections}
                onDirtyChange={discard.onBookingDirtyChange}
                actionsRef={formActionsRef}
                onBooked={finishBooking}
                defaultServiceFacility={filters.serviceFacilities?.[0]}
                defaultService={formDefaultService}
              />
            </Tabs.Panel>
            <Tabs.Panel value="block">
              <BlockTimeForm
                key={blockSeed}
                candidatesByActorType={candidatesByActorType}
                defaultRange={blockRange}
                onChangeTime={setBlockHighlight}
                onDirtyChange={discard.onBlockDirtyChange}
                onBlocked={finishBlock}
              />
            </Tabs.Panel>
          </Tabs>
        )}
      </section>
      <DiscardChangesModal {...discard.modalProps}>
        Closing the booking pane clears what you entered. The service facility is kept.
      </DiscardChangesModal>
    </div>
  );
}

/** What a click on a visit type's availability says a booking should start on. */
interface BookingStart {
  readonly service: WithId<HealthcareService>;
  /** The one provider free at the time clicked. Absent where several are. */
  readonly provider?: ScheduleCandidate;
  /** The time clicked, given with `provider`. */
  readonly instant?: Date;
}

function getBookPromptText(start: BookingStart | undefined): string {
  if (!start) {
    return 'Book an appointment?';
  }
  return start.provider
    ? `Book ${start.service.name} with ${getCandidateDisplay(start.provider)}?`
    : `Book ${start.service.name}?`;
}

/** A point on the calendar, from the top left of the box around it. */
interface PointerPosition {
  readonly left: number;
  readonly top: number;
}

interface PointerPromptProps {
  readonly at: PointerPosition;
  readonly position: 'right-start' | 'top';
  /** Names the button that closes the note, for assistive technology. */
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Prototype. A note drawn beside where the calendar was clicked, closed by its own button or by a click
 * anywhere else.
 * @param props - The React props.
 * @returns The note.
 */
function PointerPrompt(props: PointerPromptProps): JSX.Element {
  const { at, position, closeLabel, onClose, children } = props;
  return (
    <Popover opened onChange={(opened) => !opened && onClose()} position={position} withArrow shadow="md">
      <Popover.Target>
        <Box className={classes.promptAnchor} left={at.left} top={at.top} />
      </Popover.Target>
      <Popover.Dropdown>
        <Group align="flex-start" gap="xs" wrap="nowrap">
          {children}
          <CloseButton size="sm" aria-label={closeLabel} onClick={onClose} />
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}

interface SidePaneProps {
  /** Names the pane for assistive technology. */
  readonly label: string;
  /** Whether the pane widens over the calendar, as it does for a time search. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}

/**
 * The pane beside the calendar. Widened, it slides out over the calendar like a drawer, and
 * stays wide while it slides back.
 * @param props - The React props.
 * @returns The pane.
 */
function SidePane(props: SidePaneProps): JSX.Element {
  const { label, wide = false, children } = props;
  // Out over the calendar from widening until the slide back ends.
  const [extended, setExtended] = useState(wide);
  if (wide && !extended) {
    setExtended(true);
  }
  const closing = extended && !wide;
  const paneRef = useRef<HTMLElement>(null);
  // Before paint, as the slide back starts then and a reduced-motion one can end a frame later.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!closing || !pane) {
      return undefined;
    }
    // Only the slide back ends it, not an animation inside the pane, nor the slide open it cut
    // short. A cancelled slide back (the pane hidden, or its animation removed) ends it too, so
    // the pane can't stay wide. Listened for natively, as React has no `onAnimationCancel`.
    const settle = (event: AnimationEvent): void => {
      if (event.animationName === classes.paneSlideOut) {
        setExtended(false);
      }
    };
    pane.addEventListener('animationend', settle);
    pane.addEventListener('animationcancel', settle);
    return () => {
      pane.removeEventListener('animationend', settle);
      pane.removeEventListener('animationcancel', settle);
    };
  }, [closing]);
  return (
    <div className={classes.paneSlot}>
      <section
        ref={paneRef}
        className={cx(classes.pane, { [classes.paneWide]: extended, [classes.paneClosing]: closing })}
        aria-label={label}
      >
        {children}
      </section>
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

// Whether `resource` was last updated before `than`. Either without a time is taken as current.
function isOlder(resource: Resource, than: Resource): boolean {
  const updated = resource.meta?.lastUpdated;
  const thanUpdated = than.meta?.lastUpdated;
  return !!updated && !!thanUpdated && new Date(updated).getTime() < new Date(thanUpdated).getTime();
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

// The next half hour, which is where a block starts until the calendar is clicked.
function getNextHalfHour(): DateTimeRange {
  const start = new Date();
  start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
  return { start, end: new Date(start.getTime() + 30 * 60 * 1000) };
}

// Names the draft drawn for an offered time being considered. The time comes first, as a short visit's
// one line is cut off after a few words.
function getProposedTimeLabel(offered: Appointment): string {
  return offered.start ? `${formatZonedTime(new Date(offered.start))} · Proposed` : 'Proposed Time';
}

// Names the button paging the calendar on, by how many days the calendar has on show.
function getNextRangeLabel(range: DateTimeRange): string {
  const days = Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS);
  if (days <= 1) {
    return 'Next day';
  }
  if (days < 5) {
    return `Next ${days} days`;
  }
  return days <= 7 ? 'Next week' : 'Next month';
}
