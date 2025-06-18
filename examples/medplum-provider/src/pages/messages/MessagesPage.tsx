import { ScrollArea, Text, Group, Loader } from '@mantine/core';
import { Practitioner as FhirPractitioner, Communication, Patient } from '@medplum/fhirtypes';
import { useMedplum, BaseChat, ResourceAvatar, PatientSummary } from '@medplum/react';
import React, { JSX, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createReference, formatHumanName, normalizeErrorString } from '@medplum/core';
import { useResizeObserver } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { ChatList } from '../../components/messages/ChatList';

// Add hover style for message list items
const messageListItemStyle = `
.message-list-item:hover {
  background: var(--mantine-color-gray-0) !important;
}
`;

function groupCommunicationsByPatient(
  comms: Communication[]
): { patientRef: string; comm: Communication; thread: Communication[] }[] {
  const map = new Map<string, Communication[]>();
  for (const comm of comms) {
    const patientRef = comm.subject?.reference;
    if (!patientRef) {
      continue;
    }
    if (!map.has(patientRef)) {
      map.set(patientRef, []);
    }
    (map.get(patientRef) || []).push(comm);
  }
  // Helper to safely get sent as a string
  const getSentString = (comm: Communication): string => (typeof comm.sent === 'string' ? comm.sent : '');
  // For each patient, sort their communications by sent date descending and filter out messages with missing sender
  const result = Array.from(map.entries()).map(([patientRef, thread]) => {
    // Optionally filter out messages with missing sender
    const filteredThread = thread.filter((msg) => !!msg.sender?.reference);
    const sorted = [...filteredThread].sort((a, b) => {
      const aSent = getSentString(a);
      const bSent = getSentString(b);
      if (!aSent && !bSent) {
        return 0;
      }
      if (!aSent) {
        return 1;
      }
      if (!bSent) {
        return -1;
      }
      return bSent.localeCompare(aSent);
    });
    return { patientRef, comm: sorted[0], thread: sorted };
  });
  // Sort patients by most recent message
  return result.sort((a, b) => {
    const aSent = getSentString(a.comm);
    const bSent = getSentString(b.comm);
    if (!aSent && !bSent) {
      return 0;
    }
    if (!aSent) {
      return 1;
    }
    if (!bSent) {
      return -1;
    }
    return bSent.localeCompare(aSent);
  });
}

/**
 * Messages page that matches the Home page layout but without the patient list.
 * @returns A React component that displays the messages page.
 */
export function MessagesPage(): JSX.Element {
  const medplum = useMedplum();
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [selectedPatient, setSelectedPatient] = useState<Patient | undefined>(undefined);
  const [selectedPatientRef, setSelectedPatientRef] = useState<string | undefined>(undefined);
  const [threadMessages, setThreadMessages] = useState<Communication[]>([]);
  const [parentRef, parentRect] = useResizeObserver<HTMLDivElement>();
  const prevThreadRef = useRef<string | undefined>(undefined);
  const [selectedThread, setSelectedThread] = useState<Communication | undefined>(undefined);

  // Add this at the top of the component to inject the style
  if (typeof document !== 'undefined' && !document.getElementById('message-list-item-style')) {
    const style = document.createElement('style');
    style.id = 'message-list-item-style';
    style.innerHTML = messageListItemStyle;
    document.head.appendChild(style);
  }

  useEffect(() => {
    if (selectedPatientRef !== prevThreadRef.current) {
      prevThreadRef.current = selectedPatientRef;
    }
  }, [selectedPatientRef]);

  useEffect(() => {
    async function fetchAllCommunications(): Promise<void> {

      const searchResult = await medplum.searchResources('Communication', {
        // _sort: '-sent',
      }, { cache: 'no-cache' });
      setCommunications(searchResult);

      const threads: Communication[] = [];
      const threadMap: Set<string> = new Set<string>();
      searchResult.forEach((c) => {
        if (c.subject?.reference && !threadMap.has(c.subject.reference)) {
          threadMap.add(c.subject.reference);
          threads.push(c);
        }
      });

        setThreadMessages(threads);
      }
      fetchAllCommunications().catch(() => setLoading(false));
    
  }, [medplum]);

  // Only show the most recent Communication per patient
  // const patientThreads = useMemo(() => groupCommunicationsByPatient(communications), [communications]);

  // // When a patient is selected, show all messages for that patient
  // const selectedThread = useMemo(() => {
  //   if (!selectedPatientRef) {
  //     return undefined;
  //   }
  //   console.log('selectedPatientRef', selectedPatientRef);
  //   console.log('patientThreads', patientThreads);
  //   return patientThreads.find((t) => t.patientRef === selectedPatientRef);
  // }, [patientThreads, selectedPatientRef]);

  // // After participantNames is set, filter patientThreads for only those with a valid patient name
  // const validPatientThreads = useMemo(() => {
  //   return patientThreads.filter((t) => !!participantNames[t.patientRef]);
  // }, [patientThreads, participantNames]);

  // // Prefetch all patient data in batches
  // useEffect(() => {
  //   if (!validPatientThreads.length) {
  //     return;
  //   }

  //   // Process in batches of 5
  //   const batchSize = 5;
  //   const batches = [];
  //   for (let i = 0; i < validPatientThreads.length; i += batchSize) {
  //     batches.push(validPatientThreads.slice(i, i + batchSize));
  //   }

  //   // Process each batch with a small delay
  //   batches.forEach((batch, index) => {
  //     setTimeout(() => {
  //       batch.forEach((thread) => {
  //         if (!prefetchedPatients[thread.patientRef] && thread.patientRef !== selectedPatientRef) {
  //           prefetchPatient(thread.patientRef);
  //         }
  //       });
  //     }, index * 100); // 100ms delay between batches
  //   });
  // }, [validPatientThreads, prefetchedPatients, selectedPatientRef, prefetchPatient]);

  // // Fetch participant names (patients and practitioners) after communications are loaded
  // useEffect(() => {
  //   if (communications.length === 0) {
  //     return;
  //   }
  //   // Get all unique participant references from patientThreads
  //   const allRefs = new Set<string>();
  //   patientThreads.forEach(({ thread }) => {
  //     thread.forEach((comm) => {
  //       if (comm.subject?.reference) {
  //         allRefs.add(comm.subject.reference);
  //       }
  //       if (comm.sender?.reference) {
  //         allRefs.add(comm.sender.reference);
  //       }
  //       if (comm.recipient) {
  //         comm.recipient.forEach((r) => {
  //           if (r.reference) {
  //             allRefs.add(r.reference);
  //           }
  //         });
  //       }
  //     });
  //   });
  //   // Only fetch names for participants not already in the map
  //   const missingRefs = Array.from(allRefs).filter((ref) => !participantNames[ref]);
  //   if (missingRefs.length === 0) {
  //     // No new participants to fetch, do not set loading
  //     return;
  //   }
  //   const patientRefs = missingRefs.filter((ref) => ref.startsWith('Patient/'));
  //   const practitionerRefs = missingRefs.filter((ref) => ref.startsWith('Practitioner/'));
  //   const patientIds = patientRefs.map((ref) => ref.replace('Patient/', ''));
  //   const practitionerIds = practitionerRefs.map((ref) => ref.replace('Practitioner/', ''));
  //   setLoading(true);
  //   Promise.all([
  //     patientIds.length > 0 ? medplum.searchResources('Patient', { _id: patientIds.join(',') }) : Promise.resolve([]),
  //     practitionerIds.length > 0
  //       ? medplum.searchResources('Practitioner', { _id: practitionerIds.join(',') })
  //       : Promise.resolve([]),
  //   ])
  //     .then(([patients, practitioners]) => {
  //       setParticipantNames((prev) => {
  //         const map = { ...prev };
  //         (patients as Patient[]).forEach((p) => {
  //           map[`Patient/${p.id}`] = formatHumanName(p.name?.[0]);
  //         });
  //         (practitioners as FhirPractitioner[]).forEach((pr) => {
  //           map[`Practitioner/${pr.id}`] = formatHumanName(pr.name?.[0]);
  //         });
  //         return map;
  //       });
  //       setLoading(false);
  //     })
  //     .catch(() => {
  //       setLoading(false);
  //     });
  //   // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally omitting participantNames to prevent infinite loop
  // }, [patientThreads, medplum, communications.length]);

  // // Add after validPatientThreads is defined
  // useEffect(() => {
  //   // If currentPage is out of range, reset to last valid page
  //   if (currentPage > 0 && currentPage * pageSize >= validPatientThreads.length) {
  //     setCurrentPage(Math.max(0, Math.ceil(validPatientThreads.length / pageSize) - 1));
  //   } else if (currentPage !== 0 && validPatientThreads.length > 0) {
  //     setCurrentPage(0);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [validPatientThreads.length]);

  // // Auto-select the first message thread when available
  // useEffect(() => {
  //   if (!selectedPatientRef && validPatientThreads.length > 0 && !loading) {
  //     setSelectedPatientRef(validPatientThreads[0].patientRef);
  //   }
  // }, [selectedPatientRef, validPatientThreads, loading]);

  // Keep threadMessages in sync with communications for the selected thread
  // useEffect(() => {
  //   console.log('selectedThread', selectedThread);
  //   if (selectedThread) {
  //     // Find all messages for the selected thread in the latest communications
  //     const latestThreadMessages = communications.filter((c) => c.subject?.reference === selectedThread.patientRef);
  //     // Deduplicate by id
  //     const uniqueMessages: Record<string, (typeof latestThreadMessages)[0]> = {};
  //     for (const msg of latestThreadMessages) {
  //       if (msg.id) {
  //         uniqueMessages[msg.id] = msg;
  //       }
  //     }
  //     setThreadMessages(Object.values(uniqueMessages));

  //     // Use prefetched patient data if available
  //     const prefetchedPatient = prefetchedPatients[selectedThread.patientRef];
  //     if (prefetchedPatient) {
  //       setSelectedPatient(prefetchedPatient);
  //       // Remove from prefetched cache to save memory
  //       setPrefetchedPatients((prev) => {
  //         const { [selectedThread.patientRef]: _, ...rest } = prev;
  //         return rest;
  //       });
  //     } else {
  //       // Fetch patient data if not prefetched
  //       const patientId = selectedThread.patientRef.replace('Patient/', '');
  //       medplum
  //         .readResource('Patient', patientId)
  //         .then((patient) => {
  //           setSelectedPatient(patient);
  //         })
  //         .catch(console.error);
  //     }
  //   } else {
  //     setThreadMessages([]);
  //   }
  // }, [selectedThread, communications, medplum, prefetchedPatients]);

  // // Keep the sidebar preview up-to-date when new messages are added in the chat area
  // useEffect(() => {
  //   if (!selectedThread) {
  //     return;
  //   }
  //   // Find all messages for the selected thread in the global communications
  //   const globalThreadIds = new Set(
  //     communications.filter((c) => c.subject?.reference === selectedThread.patientRef).map((c) => c.id)
  //   );
  //   // Find new messages in threadMessages that are not in global communications
  //   const newMessages = threadMessages.filter((c) => c.id && !globalThreadIds.has(c.id));
  //   if (newMessages.length > 0) {
  //     setCommunications((prev) => {
  //       // Deduplicate by id
  //       const all = [...prev, ...newMessages];
  //       const unique: Record<string, (typeof all)[0]> = {};
  //       for (const msg of all) {
  //         if (msg.id) {
  //           unique[msg.id] = msg;
  //         }
  //       }
  //       return Object.values(unique);
  //     });
  //   }
  // }, [threadMessages, selectedThread, communications]);

  // // Focus the input when a thread is selected
  // useEffect(() => {
  //   if (selectedThread) {
  //     // Small delay to ensure the input is rendered
  //     const timer = setTimeout(() => {
  //       const input = document.querySelector('input[name="message"]') as HTMLInputElement;
  //       if (input) {
  //         input.focus();
  //       }
  //       return undefined;
  //     }, 100);
  //     return () => clearTimeout(timer);
  //   }
  //   return undefined;
  // }, [selectedThread]);

  // // Fetch the selected patient when selectedPatientRef changes
  // useEffect(() => {
  //   if (selectedPatientRef) {
  //     const patientId = selectedPatientRef.replace('Patient/', '');
  //     medplum.readResource('Patient', patientId).then(setSelectedPatient).catch(console.error);
  //   } else {
  //     setSelectedPatient(undefined);
  //   }
  // }, [selectedPatientRef, medplum]);


  // // Prefetch next few threads
  // useEffect(() => {
  //   if (!validPatientThreads.length) {
  //     return;
  //   }

  //   const currentIndex = validPatientThreads.findIndex((t) => t.patientRef === selectedPatientRef);
  //   if (currentIndex === -1) {
  //     return;
  //   }

  //   // Prefetch next 3 threads
  //   for (let i = 1; i <= 3; i++) {
  //     const nextThread = validPatientThreads[currentIndex + i];
  //     if (nextThread) {
  //       prefetchPatient(nextThread.patientRef);
  //     }
  //   }
  // }, [validPatientThreads, selectedPatientRef, prefetchPatient]);

  // Sidebar header
  const sidebarHeader = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 16px',
        borderBottom: '1px solid var(--app-shell-border-color)',
      }}
    >
      <Text fz="h4" fw={800} truncate style={{ minWidth: 0 }}>
        Messages
      </Text>
    </div>
  );

  let chatArea: JSX.Element;
  if (selectedThread && selectedPatient) {
    chatArea = (
      <BaseChat
        title={selectedPatient ? formatHumanName(selectedPatient.name?.[0]) : ''}
        communications={threadMessages}
        setCommunications={setThreadMessages}
        query={`subject=${selectedThread.subject?.reference}`}
        sendMessage={(content: string) => {
          if (!content) {
            return;
          }
          if (!selectedPatient) {
            return;
          }
          const profile = medplum.getProfile();
          if (!profile) {
            return;
          }
          const patientRef = createReference(selectedPatient);
          // Optimistically create the new Communication object
          const optimisticComm: Communication = {
            resourceType: 'Communication',
            status: 'in-progress',
            sender: { reference: `Practitioner/${profile.id}` },
            subject: patientRef,
            recipient: [patientRef],
            sent: new Date().toISOString(),
            payload: [{ contentString: content }],
            // Optionally add a temporary id to help with deduplication
            id: `temp-${Date.now()}`,
          };
          setCommunications((prev) => [...prev, optimisticComm]);
          setThreadMessages((prev) => [...prev, optimisticComm]);
          medplum
            .createResource<Communication>({
              resourceType: 'Communication',
              status: 'in-progress',
              sender: { reference: `Practitioner/${profile.id}` },
              subject: patientRef,
              recipient: [patientRef],
              sent: optimisticComm.sent,
              payload: [{ contentString: content }],
            })
            .then((newComm) => {
              setCommunications((prev) => {
                // Replace the optimistic message with the real one (by id)
                return prev.map((c) => (c.id === optimisticComm.id ? newComm : c));
              });
              setThreadMessages((prev) => {
                return prev.map((c) => (c.id === optimisticComm.id ? newComm : c));
              });
            })
            .catch((err) => {
              showNotification({ color: 'red', message: normalizeErrorString(err) });
              // Optionally remove the optimistic message on error
              setCommunications((prev) => prev.filter((c) => c.id !== optimisticComm.id));
              setThreadMessages((prev) => prev.filter((c) => c.id !== optimisticComm.id));
            });
        }}
        h="100%"
        radius="0"
      />
    );
  } else {
    chatArea = <div style={{ background: 'white', height: '100%' }} />;
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
      {/* Left sidebar - Messages list */}
      <div
        ref={parentRef}
        style={{
          width: 320,
          minWidth: 220,
          maxWidth: 400,
          height: '100%',
          borderRight: '1px solid var(--app-shell-border-color)',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {sidebarHeader}
        <ScrollArea
          h={parentRect.height}
          scrollbarSize={10}
          type="hover"
          scrollHideDelay={250}
        >
          {/* <ChatList communications={communications} /> */}

          {loading ? (
            <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100vh',
              minHeight: 0,
              flex: 1,
            }}
          >
            <Loader />
          </div>
          ) : (
            <ChatList communications={threadMessages} onClick={setSelectedPatientRef} />
          )}
        </ScrollArea>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, minWidth: 0, height: '100%', borderRadius: 0 }}>{chatArea}</div>

      {/* Right sidebar - Patient summary */}
      {selectedPatient && (
        <div
          style={{
            width: 350,
            height: '100%',
            borderLeft: '1px solid var(--app-shell-border-color)',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ScrollArea
            h={parentRect.height}
            scrollbarSize={10}
            type="hover"
            scrollHideDelay={250}
            style={{ flex: 1 }}
          >
            <PatientSummary key={selectedPatient.id} patient={selectedPatient} />
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
