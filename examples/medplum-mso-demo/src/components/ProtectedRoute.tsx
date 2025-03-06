import { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useMedplumProfile } from '@medplum/react';

/**
 * Authentication level required for a route
 */
export enum AuthLevel {
  /** No authentication required */
  NONE = 'none',
  /** User must be authenticated */
  USER = 'user',
  /** User must be authenticated and have admin privileges */
  ADMIN = 'admin'
}

interface ProtectedRouteProps {
  children: ReactNode;
  /** The authentication level required for this route */
  authLevel?: AuthLevel;
  /** Whether the current user has admin privileges */
  isAdmin?: boolean;
  /** Where to redirect if authentication fails */
  redirectTo?: string;
}

/**
 * A component that protects routes by checking if the user has the required authentication level.
 * If not authenticated appropriately, redirects to the specified page.
 */
export function ProtectedRoute({ 
  children, 
  authLevel = AuthLevel.USER, 
  isAdmin = false,
  redirectTo = '/signin'
}: ProtectedRouteProps): JSX.Element {
  const profile = useMedplumProfile();

  // No authentication required
  if (authLevel === AuthLevel.NONE) {
    return <>{children}</>;
  }

  // User authentication required
  if (!profile) {
    return <Navigate to={redirectTo} replace />;
  }

  // Admin authentication required
  if (authLevel === AuthLevel.ADMIN && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // User is authenticated with appropriate level
  return <>{children}</>;
} 