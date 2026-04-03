"use client";

import { MedplumClient } from "@medplum/core";
import { MedplumProvider as BaseMedplumProvider } from "@medplum/react";
import { useEffect, useState, type ReactNode } from "react";

interface MedplumProviderProps {
  children: ReactNode;
}

// Initialize Medplum client
const medplum = new MedplumClient({
  baseUrl: process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL || "https://api.medplum.com",
  clientId: process.env.NEXT_PUBLIC_MEDPLUM_CLIENT_ID,
});

export function MedplumProvider({ children }: MedplumProviderProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return (
    <BaseMedplumProvider medplum={medplum}>
      {children}
    </BaseMedplumProvider>
  );
}
