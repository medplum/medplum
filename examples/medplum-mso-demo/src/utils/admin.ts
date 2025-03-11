import { MedplumClient } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
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
    const profile = medplum.getProfile();
    if (!profile) {
      return false;
    }

    // Search for the user's ProjectMembership
    const searchResult = await medplum.search('ProjectMembership', {
      profile: `${profile.resourceType}/${profile.id}`
    });

    // Check if any membership has admin=true
    const membership = searchResult.entry?.[0]?.resource as ProjectMembership | undefined;
    return !!membership?.admin;
  } catch (error) {
    console.error('Error checking admin status:', error);
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
      try {
        const adminStatus = await isUserAdmin(medplum);
        setIsAdminUser(adminStatus);
      } catch (error) {
        console.error('Error checking admin status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus().catch(console.error);
  }, [medplum]);

  return { isAdmin: isAdminUser, loading };
} 