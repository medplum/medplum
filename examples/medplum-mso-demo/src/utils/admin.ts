// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient, normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';

/**
 * Checks if the current user is an admin by examining their ProjectMembership.
 *
 * @param medplum - The Medplum client instance
 * @returns A Promise that resolves to a boolean indicating whether the user is an admin
 */
export async function isUserAdmin(medplum: MedplumClient): Promise<boolean> {
  try {
    // Get the current user's profile
    const membership = medplum.getProjectMembership();
    return membership?.admin ?? false;
  } catch (error) {
    console.error('Error checking admin status:', normalizeErrorString(error));
    return false;
  }
}

/**
 * React hook that provides the admin status of the current user.
 *
 * @returns An object containing the admin status and loading state
 */
export function useAdminStatus(): { isAdmin: boolean; loading: boolean } {
  const medplum = useMedplum();
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAdminStatus = async (): Promise<void> => {
      const adminStatus = await isUserAdmin(medplum);
      setIsAdminUser(adminStatus);
      setLoading(false);
    };

    checkAdminStatus().catch((error) => {
      console.error('Error checking admin status:', normalizeErrorString(error));
      setLoading(false);
    });
  }, [medplum]);

  return { isAdmin: isAdminUser, loading };
}
