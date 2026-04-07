// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PractitionerRole } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DOSESPOT_PRACTITIONER_ROLE_TYPE_SYSTEM, hasDoseSpotIdentifier } from '../components/utils';

export interface DoseSpotAccess {
  /** True if the user is already enrolled (has a DoseSpot identifier on membership). */
  enrolled: boolean;
  /** True if the user is authorized via PractitionerRole but not yet enrolled. */
  authorizedNotEnrolled: boolean;
  /** True if either enrolled or authorized (show DoseSpot UI). */
  hasAccess: boolean;
  /** True if selfEnroll should be passed to useDoseSpotIFrame. */
  needsSelfEnroll: boolean;
  /** True while the PractitionerRole check is loading. */
  loading: boolean;
}

/**
 * Hook that determines DoseSpot access for the current user.
 *
 * Checks two things:
 * 1. Whether the user already has a DoseSpot identifier (already enrolled)
 * 2. Whether the user has a PractitionerRole authorizing DoseSpot enrollment
 *
 * Returns access flags that control UI visibility and self-enrollment behavior.
 */
export function useDoseSpotAccess(): DoseSpotAccess {
  const medplum = useMedplum();
  const membership = medplum.getProjectMembership();
  const profile = medplum.getProfile();
  const enrolled = hasDoseSpotIdentifier(membership);
  const checkedRef = useRef(false);
  const [authorizedNotEnrolled, setAuthorizedNotEnrolled] = useState(false);
  const [loading, setLoading] = useState(!enrolled);

  const practitionerId = profile?.resourceType === 'Practitioner' ? profile.id : undefined;

  const checkPractitionerRole = useCallback(async () => {
    if (enrolled || !practitionerId || checkedRef.current) {
      setLoading(false);
      return;
    }

    checkedRef.current = true;
    try {
      const roles = await medplum.searchResources('PractitionerRole', {
        practitioner: `Practitioner/${practitionerId}`,
        active: 'true',
        _count: '10',
      });

      setAuthorizedNotEnrolled(hasDoseSpotPractitionerRole(roles));
    } catch (err) {
      console.warn('Failed to check DoseSpot PractitionerRole:', err);
    } finally {
      setLoading(false);
    }
  }, [medplum, enrolled, practitionerId]);

  useEffect(() => {
    checkPractitionerRole().catch(console.error);
  }, [checkPractitionerRole]);

  const hasAccess = enrolled || authorizedNotEnrolled;

  return {
    enrolled,
    authorizedNotEnrolled,
    hasAccess,
    needsSelfEnroll: authorizedNotEnrolled && !enrolled,
    loading,
  };
}

function hasDoseSpotPractitionerRole(roles: PractitionerRole[]): boolean {
  return roles.some((role) =>
    role.code?.some((cc) =>
      cc.coding?.some((c) => c.system === DOSESPOT_PRACTITIONER_ROLE_TYPE_SYSTEM)
    )
  );
}
