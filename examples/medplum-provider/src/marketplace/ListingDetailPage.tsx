// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Divider,
  Grid,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconArrowUpRight,
  IconBook,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconDownload,
  IconExternalLink,
  IconFile,
  IconHeadset,
  IconLoader2,
  IconMail,
  IconSend,
  IconShieldCheck,
  IconTrash,
  IconWorld,
  IconX,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAppsPanel } from '../components/AppsPanel';
import {
  getListingById,
  listingIconColor,
  listingIconComponent,
  typeBadgeColor,
  typeBrowseLabels,
  typeDisplayNames,
  typeIconComponent,
} from './data';
import { InstallModal } from './InstallModal';
import type { ListingType, MarketplaceListing } from './types';
import { useMarketplace } from './useMarketplace';
import { useMarketplaceBreadcrumbs } from './useMarketplaceBreadcrumbs';

const LISTINGS_WITH_SETUP_FLOW = new Set(['carebridge-dashboard', 'dosespot-eprescribing', 'telehealth-bridge']);

const LISTINGS_WITH_REQUEST_ACCESS = new Set(['dosespot-provider-example']);

const LISTING_TO_APP_PANEL_ID: Record<string, string> = {
  'carebridge-dashboard': 'carebridge-dashboard',
  'dosespot-eprescribing': 'dosespot',
  'dosespot-provider-example': 'dosespot-provider',
  'growth-chart-app': 'growth-chart',
  'telehealth-bridge': 'telehealth',
};

function getDisplayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Button copy by listing type (individual item detail page only)
function getActionCopy(type: ListingType): {
  action: string;
  loading: string;
  openLabel: string;
  remove: string;
} {
  if (type === 'App') {
    return { action: 'Install', loading: 'Installing...', openLabel: 'Open App', remove: 'Uninstall' };
  }
  if (type === 'Service Provider') {
    return { action: 'Get In Touch', loading: 'Sending...', openLabel: 'View', remove: 'Remove' };
  }
  return {
    action: 'Add to Project',
    loading: 'Adding...',
    openLabel: 'Open',
    remove: 'Remove from Project',
  };
}

// ─── Install Button ─────────────────────────────────────────────────────────

function InstallButton({
  listingId,
  listingType,
  contactEmail,
  onSetupRequired,
}: {
  readonly listingId: string;
  readonly listingType: ListingType;
  readonly contactEmail?: string;
  readonly onSetupRequired?: () => void;
}): JSX.Element {
  const { isInstalled, install, uninstall } = useMarketplace();
  const { openApp } = useAppsPanel();
  const installed = isInstalled(listingId);
  const [installing, setInstalling] = useState(false);
  const copy = getActionCopy(listingType);

  const handleInstall = useCallback((): void => {
    if (onSetupRequired) {
      onSetupRequired();
      return;
    }
    setInstalling(true);
    setTimeout(() => {
      install(listingId);
      setInstalling(false);
    }, 800);
  }, [install, listingId, onSetupRequired]);

  const handleOpenApp = useCallback((): void => {
    const appId = LISTING_TO_APP_PANEL_ID[listingId];
    if (appId) {
      openApp(appId);
    }
  }, [listingId, openApp]);

  if (installing) {
    return (
      <Button leftSection={<IconLoader2 size={16} className="spin" />} disabled size="md" fullWidth>
        {copy.loading}
      </Button>
    );
  }

  if (installed) {
    const isAddableType = listingType !== 'App' && listingType !== 'Service Provider';
    const appId = LISTING_TO_APP_PANEL_ID[listingId];
    return (
      <Group gap="xs" align="center" justify="flex-end">
        <Badge
          size="xl"
          variant="light"
          color="green"
          leftSection={<IconCircleCheck size={16} />}
          style={{ textTransform: 'none' }}
          fw={600}
          fz="0.875rem"
        >
          Installed
        </Badge>
        <Tooltip label="Remove" position="bottom" openDelay={600}>
          <ActionIcon
            variant="transparent"
            size={32}
            radius="xl"
            aria-label={copy.remove}
            onClick={() => uninstall(listingId)}
            className="marketplace-action-icon"
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
        {!isAddableType && (
          <Tooltip label="Open App" position="bottom" openDelay={600}>
            <ActionIcon
              variant="transparent"
              size={32}
              radius="xl"
              aria-label={copy.openLabel}
              onClick={appId ? handleOpenApp : undefined}
              className="marketplace-action-icon"
            >
              <IconArrowUpRight size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    );
  }

  if (listingType === 'Service Provider' && contactEmail) {
    return (
      <Button leftSection={<IconMail size={16} />} size="md" component="a" href={`mailto:${contactEmail}`} fullWidth>
        {copy.action}
      </Button>
    );
  }

  return (
    <Button leftSection={<IconDownload size={16} />} size="md" onClick={handleInstall} fullWidth>
      {copy.action}
    </Button>
  );
}

// ─── Request Access button (for listings requiring admin approval) ──────────

function RequestAccessButton({ listingId }: { readonly listingId: string }): JSX.Element {
  const { isInstalled, install, uninstall } = useMarketplace();
  const { openApp } = useAppsPanel();
  const installed = isInstalled(listingId);
  const [requested, setRequested] = useState(false);
  const [sending, setSending] = useState(false);

  const handleRequest = useCallback((): void => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setRequested(true);
    }, 600);
  }, []);

  const handleGrantAccess = useCallback((): void => {
    install(listingId);
  }, [install, listingId]);

  const handleOpenApp = useCallback((): void => {
    const appId = LISTING_TO_APP_PANEL_ID[listingId];
    if (appId) {
      openApp(appId);
    }
  }, [listingId, openApp]);

  if (sending) {
    return (
      <Button leftSection={<IconLoader2 size={16} className="spin" />} disabled size="md" fullWidth>
        Requesting...
      </Button>
    );
  }

  if (installed) {
    const appId = LISTING_TO_APP_PANEL_ID[listingId];
    return (
      <Group gap="xs" align="center">
        <Badge
          size="xl"
          variant="light"
          color="green"
          leftSection={<IconCircleCheck size={14} />}
          style={{ textTransform: 'none' }}
        >
          Installed
        </Badge>
        <Tooltip label="Open App" position="bottom" openDelay={600}>
          <ActionIcon
            variant="transparent"
            size={32}
            radius="xl"
            aria-label="Open App"
            onClick={appId ? handleOpenApp : undefined}
            className="marketplace-action-icon"
          >
            <IconArrowUpRight size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Remove" position="bottom" openDelay={600}>
          <ActionIcon
            variant="transparent"
            size={32}
            radius="xl"
            aria-label="Remove"
            onClick={() => uninstall(listingId)}
            className="marketplace-action-icon"
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  if (requested) {
    return (
      <Button
        leftSection={<IconCheck size={16} />}
        size="md"
        variant="light"
        color="gray"
        onClick={handleGrantAccess}
        fullWidth
      >
        Access Requested
      </Button>
    );
  }

  return (
    <Button leftSection={<IconSend size={16} />} size="md" onClick={handleRequest} fullWidth>
      Request Access
    </Button>
  );
}

// ─── Uninstall button (right side of action area, only when installed) ──────

function UninstallButton(_props: { readonly listingId: string; readonly listingType: ListingType }): null {
  return null;
}

// ─── Related Listing Card ────────────────────────────────────────────────────

function ListingIcon({ listing, size }: { readonly listing: MarketplaceListing; readonly size: number }): JSX.Element {
  const TypeIcon = listingIconComponent[listing.id] ?? typeIconComponent[listing.type] ?? typeIconComponent['App'];
  const boxRadius = size === 64 ? 12 : 10;
  if (listing.icon) {
    return (
      <Box
        w={size}
        h={size}
        style={{
          borderRadius: boxRadius,
          overflow: 'hidden',
          flexShrink: 0,
          border: '1px solid var(--mantine-color-gray-2)',
          background: 'white',
        }}
      >
        <img
          src={listing.icon}
          alt={listing.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: '0.5rem' }}
        />
      </Box>
    );
  }
  if (listingIconComponent[listing.id]) {
    return (
      <Box
        w={size}
        h={size}
        style={{
          borderRadius: boxRadius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: '1px solid var(--mantine-color-gray-2)',
          background: 'white',
        }}
      >
        <TypeIcon size={Math.round(size * 0.5)} color={listingIconColor[listing.id]} />
      </Box>
    );
  }
  return (
    <ThemeIcon
      size={size}
      radius="md"
      variant="light"
      color={typeBadgeColor[listing.type] ?? 'gray'}
      style={{ flexShrink: 0 }}
    >
      <TypeIcon size={Math.round(size * 0.375)} />
    </ThemeIcon>
  );
}

function RelatedListingCard({ listing }: { readonly listing: MarketplaceListing }): JSX.Element {
  const { isInstalled } = useMarketplace();
  const installed = isInstalled(listing.id);

  return (
    <Card
      component={Link}
      to={`/marketplace/${listing.id}`}
      shadow="sm"
      padding="lg"
      radius="lg"
      withBorder={false}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--mantine-color-gray-1)',
      }}
    >
      <Group justify="space-between" mb="sm" wrap="nowrap" style={{ overflow: 'hidden' }}>
        <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden', minWidth: 0 }}>
          <ListingIcon listing={listing} size={48} />
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <Text fw={700} size="lg" lineClamp={1}>
              {listing.name}
            </Text>
            <Text size="xs" c="dimmed" fw={500}>
              {typeDisplayNames[listing.type] ?? listing.type}
            </Text>
          </div>
        </Group>
        {installed && (
          <Badge size="xs" variant="light" color="green">
            Installed
          </Badge>
        )}
      </Group>
      <Text size="lg" c="gray.7" lineClamp={3} mb="xl" style={{ flex: 1 }}>
        {listing.tagline}
      </Text>
      <Group gap="4">
        {listing.categories.slice(0, 2).map((cat) => (
          <Badge
            key={cat}
            size="md"
            variant="light"
            color="gray.5"
            c="dark.3"
            style={{ textTransform: 'none', fontWeight: 500 }}
          >
            {cat}
          </Badge>
        ))}
      </Group>
    </Card>
  );
}

// ─── Detail Page ────────────────────────────────────────────────────────────

export function ListingDetailPage(): JSX.Element {
  const { listingId } = useParams<{ listingId: string }>();
  const listing = listingId ? getListingById(listingId) : undefined;

  const [installModalOpened, setInstallModalOpened] = useState(false);
  const hasSetupFlow = listingId ? LISTINGS_WITH_SETUP_FLOW.has(listingId) : false;
  const hasRequestAccess = listingId ? LISTINGS_WITH_REQUEST_ACCESS.has(listingId) : false;
  const openInstallModal = useCallback((): void => setInstallModalOpened(true), []);
  const closeInstallModal = useCallback((): void => setInstallModalOpened(false), []);

  const { setBreadcrumbs } = useMarketplaceBreadcrumbs();

  const screenshots = listing?.screenshots ?? [];
  const screenshotCount = screenshots.length;
  const hasScreenshots = screenshotCount > 0;

  // Gallery thumbnail selection — reset to 0 when navigating to a different listing
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [galleryListingId, setGalleryListingId] = useState(listingId);
  if (galleryListingId !== listingId) {
    setGalleryListingId(listingId);
    setSelectedIndex(0);
  }

  // Lightbox (full-screen) state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const closeLightbox = useCallback((): void => setLightboxIndex(null), []);
  const openLightbox = useCallback((index: number): void => setLightboxIndex(index), []);
  const goPrev = useCallback((): void => {
    setLightboxIndex((i) => {
      if (i === null) {
        return null;
      }
      return i === 0 ? screenshotCount - 1 : i - 1;
    });
  }, [screenshotCount]);
  const goNext = useCallback((): void => {
    setLightboxIndex((i) => {
      if (i === null) {
        return null;
      }
      return i === screenshotCount - 1 ? 0 : i + 1;
    });
  }, [screenshotCount]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (lightboxIndex === null) {
        return;
      }
      if (e.key === 'Escape') {
        closeLightbox();
      }
      if (e.key === 'ArrowLeft') {
        goPrev();
      }
      if (e.key === 'ArrowRight') {
        goNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, closeLightbox, goPrev, goNext]);

  const typeBrowseLink = listing ? `/marketplace/browse?${new URLSearchParams({ type: listing.type }).toString()}` : '';
  const typeLabel = listing ? (typeBrowseLabels[listing.type] ?? listing.type) : '';

  useEffect(() => {
    if (listing) {
      setBreadcrumbs([{ label: typeLabel, to: typeBrowseLink }]);
    }
    return () => setBreadcrumbs([]);
  }, [listing, typeLabel, typeBrowseLink, setBreadcrumbs]);

  if (!listing) {
    return (
      <Center py="xl">
        <Stack align="center" gap="xs">
          <Text fw={500}>Listing not found</Text>
          <Anchor component={Link} to="/marketplace" size="sm">
            Back to Marketplace
          </Anchor>
        </Stack>
      </Center>
    );
  }

  const relatedListings = (listing.relatedListingIds ?? [])
    .map((id) => getListingById(id))
    .filter(Boolean) as MarketplaceListing[];

  const isServiceProvider = listing.type === 'Service Provider';
  const TypeIcon = listingIconComponent[listing.id] ?? typeIconComponent[listing.type] ?? typeIconComponent['App'];

  return (
    <Box py="xl" style={{ paddingInline: 'calc(var(--mantine-spacing-xl) * 3)' }}>
      <Grid gutter="xl" align="stretch">
        {/* ── Main content ─────────────────────────────────────────── */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          {/* Header */}
          <Group mb={64} gap="lg" align="center" justify="space-between" wrap="nowrap">
            <Group gap="md" align="center">
              <ListingIcon listing={listing} size={64} />
              <Stack gap={4}>
                <Title order={3} fw={800}>
                  {listing.name}
                </Title>
                {listing.vendor.website && (
                  <Anchor
                    href={listing.vendor.website}
                    target="_blank"
                    size="sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
                  >
                    <IconWorld size={14} style={{ flexShrink: 0 }} />
                    {getDisplayDomain(listing.vendor.website)}
                  </Anchor>
                )}
              </Stack>
            </Group>
            <Stack gap="xs" style={{ flexShrink: 0, minWidth: 180 }}>
              {hasRequestAccess ? (
                <RequestAccessButton listingId={listing.id} />
              ) : (
                <InstallButton
                  listingId={listing.id}
                  listingType={listing.type}
                  contactEmail={listing.contactEmail}
                  onSetupRequired={hasSetupFlow ? openInstallModal : undefined}
                />
              )}
              <UninstallButton listingId={listing.id} listingType={listing.type} />
            </Stack>
          </Group>

          {/* Preview — directly below header */}
          <Box mb={64}>
            <Title order={4} mb="md">
              Preview
            </Title>
            {hasScreenshots ? (
              <Stack gap="sm">
                {/* Main image — click to open lightbox */}
                <UnstyledButton
                  onClick={() => openLightbox(selectedIndex)}
                  style={{ display: 'block', width: '100%' }}
                  title="View full size"
                >
                  <Box
                    style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: '1px solid var(--mantine-color-gray-3)',
                      cursor: 'zoom-in',
                    }}
                  >
                    <img
                      src={screenshots[selectedIndex]}
                      alt={`${listing.name} screenshot ${selectedIndex + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </Box>
                </UnstyledButton>

                {/* Thumbnails */}
                {screenshotCount > 1 && (
                  <Group gap="sm" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
                    {screenshots.map((src, i) => (
                      <UnstyledButton
                        key={i}
                        onClick={() => setSelectedIndex(i)}
                        style={{ flexShrink: 0 }}
                        aria-label={`View screenshot ${i + 1}`}
                      >
                        <Box
                          w={120}
                          h={72}
                          style={{
                            borderRadius: 6,
                            overflow: 'hidden',
                            border: `1px solid ${i === selectedIndex ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-3)'}`,
                            opacity: i === selectedIndex ? 1 : 0.6,
                            transition: 'opacity 120ms ease, border-color 120ms ease',
                            cursor: 'pointer',
                          }}
                        >
                          <img
                            src={src}
                            alt={`${listing.name} thumbnail ${i + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        </Box>
                      </UnstyledButton>
                    ))}
                  </Group>
                )}
              </Stack>
            ) : (
              <Box
                h={300}
                bg="gray.1"
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--mantine-color-gray-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text size="sm" c="dimmed">
                  No preview available
                </Text>
              </Box>
            )}
          </Box>

          {/* Lightbox modal */}
          <Modal
            opened={lightboxIndex !== null && hasScreenshots}
            onClose={closeLightbox}
            withCloseButton={false}
            size="xl"
            padding={0}
            styles={{
              body: { overflow: 'hidden' },
              content: { maxWidth: '95vw' },
            }}
          >
            <Box pos="relative" style={{ minHeight: 400 }}>
              {lightboxIndex !== null && screenshots[lightboxIndex] && (
                <>
                  <UnstyledButton
                    onClick={closeLightbox}
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      zIndex: 10,
                      background: 'var(--mantine-color-dark-6)',
                      color: 'white',
                      borderRadius: 'var(--mantine-radius-sm)',
                      padding: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label="Close"
                  >
                    <IconX size={20} />
                  </UnstyledButton>
                  {screenshots.length > 1 && (
                    <>
                      <UnstyledButton
                        onClick={goPrev}
                        aria-label="Previous image"
                        style={{
                          position: 'absolute',
                          left: 12,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                          background: 'var(--mantine-color-dark-6)',
                          color: 'white',
                          borderRadius: 'var(--mantine-radius-sm)',
                          padding: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <IconChevronLeft size={28} />
                      </UnstyledButton>
                      <UnstyledButton
                        onClick={goNext}
                        aria-label="Next image"
                        style={{
                          position: 'absolute',
                          right: 12,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                          background: 'var(--mantine-color-dark-6)',
                          color: 'white',
                          borderRadius: 'var(--mantine-radius-sm)',
                          padding: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <IconChevronRight size={28} />
                      </UnstyledButton>
                    </>
                  )}
                  <Box style={{ maxHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={screenshots[lightboxIndex]}
                      alt={`${listing.name} screenshot ${lightboxIndex + 1}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '85vh',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  </Box>
                  {screenshots.length > 1 && (
                    <Text size="xs" c="dimmed" ta="center" py="xs">
                      {lightboxIndex + 1} / {screenshots.length}
                    </Text>
                  )}
                </>
              )}
            </Box>
          </Modal>

          {/* About */}
          <Box mb={64} pr={64}>
            <Title order={4} mb="md">
              About
            </Title>
            {listing.description.split('\n\n').map((paragraph, i) => (
              <Text key={i} size="lg" mb="sm" lh={1.7} c="gray.7">
                {paragraph}
              </Text>
            ))}
          </Box>
        </Grid.Col>

        {/* ── Install sidebar ──────────────────────────────────────── */}
        <Grid.Col span={{ base: 12, md: 4 }} style={{ display: 'flex', flexDirection: 'column' }}>
          <Box
            style={{
              borderLeft: '1px solid var(--mantine-color-gray-3)',
              flex: 1,
              paddingInline: 'var(--mantine-spacing-xl)',
              paddingBlock: 'var(--mantine-spacing-xs)',
            }}
          >
            <Stack gap={32}>
              {/* Categories */}
              <Box>
                <Title order={6} fw={700} mb={8}>
                  Categories
                </Title>
                <Group gap={4}>
                  {listing.categories.map((cat) => (
                    <Badge
                      key={cat}
                      component={Link}
                      to={`/marketplace/browse?${new URLSearchParams({ category: cat }).toString()}`}
                      size="md"
                      variant="light"
                      color="gray.5"
                      c="dark.3"
                      style={{ cursor: 'pointer', textDecoration: 'none', textTransform: 'none', fontWeight: 500 }}
                    >
                      {cat}
                    </Badge>
                  ))}
                </Group>
              </Box>

              {/* Type */}
              <Box>
                <Title order={6} fw={700} mb={8}>
                  Type
                </Title>
                <Group gap={8}>
                  <TypeIcon size={15} color="var(--mantine-color-gray-7)" style={{ flexShrink: 0 }} />
                  <Text size="md" c="gray.7">
                    {listing.type}
                  </Text>
                </Group>
              </Box>

              {/* Version */}
              <Box>
                <Title order={6} fw={700} mb={8}>
                  Version
                </Title>
                <Text size="md" c="gray.7">
                  {listing.version}
                </Text>
              </Box>

              {/* Last Updated */}
              <Box>
                <Title order={6} fw={700} mb={8}>
                  Last Updated
                </Title>
                <Text size="md" c="gray.7">
                  {new Date(listing.lastUpdated).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </Box>

              {/* Developer */}
              <Box>
                <Title order={6} fw={700} mb={8}>
                  Developer
                </Title>
                {listing.vendor.website ? (
                  <Anchor
                    href={listing.vendor.website}
                    target="_blank"
                    size="md"
                    c="gray.7"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                  >
                    {listing.vendor.name}
                    <IconExternalLink size={13} style={{ flexShrink: 0 }} />
                  </Anchor>
                ) : (
                  <Text size="md" c="gray.7">
                    {listing.vendor.name}
                  </Text>
                )}
              </Box>

              {/* Service Types */}
              {isServiceProvider && listing.serviceTypes && listing.serviceTypes.length > 0 && (
                <Box>
                  <Title order={6} fw={700} mb={8}>
                    Service Types
                  </Title>
                  <Stack gap={8}>
                    {listing.serviceTypes.map((st) => (
                      <Text key={st} size="md" c="dimmed">
                        {st}
                      </Text>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Resources */}
              <Box>
                <Title order={6} fw={700} mb={8}>
                  Resources
                </Title>
                <Stack gap={8}>
                  {listing.supportUrl ? (
                    <Anchor
                      href={listing.supportUrl}
                      target="_blank"
                      size="md"
                      c="gray.7"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                    >
                      <IconHeadset size={15} style={{ flexShrink: 0 }} />
                      Support
                    </Anchor>
                  ) : (
                    <Text size="md" c="gray.7" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <IconHeadset size={15} style={{ flexShrink: 0 }} />
                      Support
                    </Text>
                  )}
                  {listing.docsUrl && (
                    <Anchor
                      href={listing.docsUrl}
                      target="_blank"
                      size="md"
                      c="gray.7"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                    >
                      <IconBook size={15} style={{ flexShrink: 0 }} />
                      Documentation
                    </Anchor>
                  )}
                  {listing.contactUrl && (
                    <Anchor
                      href={listing.contactUrl}
                      target="_blank"
                      size="md"
                      c="gray.7"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                    >
                      <IconMail size={15} style={{ flexShrink: 0 }} />
                      Contact
                    </Anchor>
                  )}
                  {listing.termsUrl ? (
                    <Anchor
                      href={listing.termsUrl}
                      target="_blank"
                      size="md"
                      c="gray.7"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                    >
                      <IconFile size={15} style={{ flexShrink: 0 }} />
                      Terms
                    </Anchor>
                  ) : (
                    <Text size="md" c="gray.7" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <IconFile size={15} style={{ flexShrink: 0 }} />
                      Terms
                    </Text>
                  )}
                  {listing.privacyUrl ? (
                    <Anchor
                      href={listing.privacyUrl}
                      target="_blank"
                      size="md"
                      c="gray.7"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                    >
                      <IconShieldCheck size={15} style={{ flexShrink: 0 }} />
                      Privacy Policy
                    </Anchor>
                  ) : (
                    <Text size="md" c="gray.7" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <IconShieldCheck size={15} style={{ flexShrink: 0 }} />
                      Privacy Policy
                    </Text>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Grid.Col>
      </Grid>

      {/* Related listings — full width */}
      {relatedListings.length > 0 && (
        <Box mt="xl" mb="64px">
          <Divider mb="xl" />
          <Group mb="md" mx="4">
            <Title order={3} fw={800}>
              Related
            </Title>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {relatedListings.slice(0, 4).map((related) => (
              <RelatedListingCard key={related.id} listing={related} />
            ))}
          </SimpleGrid>
        </Box>
      )}

      {/* Install setup modal for listings that require configuration */}
      {hasSetupFlow && listing && (
        <InstallModal
          opened={installModalOpened}
          onClose={closeInstallModal}
          listingId={listing.id}
          listingName={listing.name}
        />
      )}
    </Box>
  );
}
