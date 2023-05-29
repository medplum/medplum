import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Container,
  createStyles,
  Flex,
  Grid,
  Group,
  Image,
  Overlay,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import { Patient, Practitioner } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react';
import { IconChecklist, IconGift, IconSquareCheck } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import DoctorImage from '../img/homePage/doctor.svg';
import HealthRecordImage from '../img/homePage/health-record.svg';
import HealthVisitImage from '../img/homePage/health-visit.jpg';
import HeroImage from '../img/homePage/hero-background.jpg';
import PharmacyImage from '../img/homePage/pharmacy.svg';
import PillImage from '../img/homePage/pill.svg';

const useStyles = createStyles((theme) => ({
  // Announcements
  announcements: {
    backgroundColor: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 6 : 0],
    padding: theme.spacing.xs,
    textAlign: 'center',
  },

  // Hero
  hero: {
    position: 'relative',
    backgroundImage: `url(${HeroImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  },

  heroContainer: {
    height: 400,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingTop: '4.5rem',
    paddingBottom: '6rem',
    zIndex: 1,
    position: 'relative',

    [theme.fn.smallerThan('sm')]: {
      paddingTop: '3rem',
      paddingBottom: '4.5rem',
    },
  },

  heroTitle: {
    color: theme.white,
    fontSize: 50,
    fontWeight: 500,
    lineHeight: 1.2,

    [theme.fn.smallerThan('sm')]: {
      fontSize: 30,
      lineHeight: 1.2,
    },

    [theme.fn.smallerThan('xs')]: {
      fontSize: 28,
      lineHeight: 1.3,
    },
  },

  heroButton: {
    marginTop: '2.25rem',

    [theme.fn.smallerThan('sm')]: {
      width: '100%',
    },
  },

  // Call to action
  callToAction: {
    backgroundColor: theme.fn.darken(theme.fn.primaryColor(), 0.4),
    color: theme.white,
    padding: theme.spacing.md,
    textAlign: 'center',
  },

  // Task cards
  card: {
    border: `1px solid ${theme.colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[1]}`,
  },
}));

const carouselItems = [
  {
    img: <IconChecklist />,
    title: 'Welcome to Foo Medical',
    description:
      'Lorem ipsum at porta donec ultricies ut, arcu morbi amet arcu ornare, curabitur pharetra magna tempus',
    url: '/get-care',
    label: 'Learn how we help',
  },
  {
    img: <IconChecklist />,
    title: 'Verify Email',
    description:
      'Lorem ipsum at porta donec ultricies ut, arcu morbi amet arcu ornare, curabitur pharetra magna tempus',
    url: '/account',
    label: 'Send verification email',
  },
  {
    img: <IconChecklist />,
    title: 'Select a Doctor',
    description:
      'Lorem ipsum at porta donec ultricies ut, arcu morbi amet arcu ornare, curabitur pharetra magna tempus',
    url: '/account/provider/choose-a-primary-care-povider',
    label: 'Choose a Primary Care Provider',
  },
  {
    img: <IconChecklist />,
    title: 'Emergency Contact',
    description:
      'Lorem ipsum at porta donec ultricies ut, arcu morbi amet arcu ornare, curabitur pharetra magna tempus',
    url: '/account',
    label: 'Add emergency contact',
  },
];

const linkPages = [
  {
    img: HealthRecordImage,
    title: 'Health Record',
    description: '',
    href: '/health-record',
  },
  {
    img: PillImage,
    title: 'Request Prescription Renewal',
    description: '',
    href: '/health-record/medications',
  },
  {
    img: PharmacyImage,
    title: 'Preferred Pharmacy',
    description: 'Walgreens D2866 1363 Divisadero St  DIVISADERO',
    href: '#',
  },
];

const recommendations = [
  {
    title: 'Get travel health recommendations',
    description: 'Find out what vaccines and meds you need for your trip.',
  },
  {
    title: 'Get FSA/HSA reimbursement',
    description: 'Request a prescription for over-the-counter items.',
  },
  {
    title: 'Request health record',
    description: 'Get records sent to or from Foo Medical.',
  },
];

export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const { classes } = useStyles();
  const theme = useMantineTheme();
  const profile = useMedplumProfile() as Patient | Practitioner;
  const profileName = profile.name ? formatHumanName(profile.name[0]) : '';

  return (
    <>
      <Box className={classes.announcements}>
        <span>
          Announcements go here. <Anchor href="#">Include links if needed.</Anchor>
        </span>
      </Box>
      <div className={classes.hero}>
        <Overlay
          gradient="linear-gradient(180deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.4) 40%)"
          opacity={1}
          zIndex={0}
        />
        <Container className={classes.heroContainer}>
          <Title className={classes.heroTitle}>
            Hi <span className="text-teal-600">{profileName}</span>,<br /> we’re here to help
          </Title>
          <Button size="xl" radius="xl" className={classes.heroButton}>
            Get Care
          </Button>
        </Container>
      </div>
      <Box className={classes.callToAction}>
        <Group position="center">
          <IconGift />
          <p>Put calls to action here</p>
          <Button variant="light" onClick={() => navigate('/messages')}>
            Send Message
          </Button>
        </Group>
      </Box>
      <Box p="lg" bg="gray.0">
        <Container>
          <Grid>
            {carouselItems.map((item, index) => (
              <Grid.Col key={`card-${index}`} md={6} lg={3}>
                <Card shadow="md" radius="md" className={classes.card} p="xl">
                  <IconSquareCheck />
                  <Text size="lg" weight={500} mt="md">
                    {item.title}
                  </Text>
                  <Text size="sm" color="dimmed" my="sm">
                    {item.description}
                  </Text>
                  <Anchor>{item.label}</Anchor>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Container>
      </Box>
      <Box p="lg" bg="gray.0">
        <Container>
          <Card shadow="md" radius="md" className={classes.card} p="xl">
            <IconSquareCheck />
            <Text size="lg" weight={500} mt="md">
              Better rest, better health
            </Text>
            <Text size="sm" color="dimmed" my="sm">
              Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores impedit perferendis suscipit eaque, iste
              dolor cupiditate blanditiis ratione. Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores
              impedit perferendis suscipit eaque, iste dolor cupiditate blanditiis ratione.
            </Text>
            <Button>Invite Friends</Button>
          </Card>
        </Container>
      </Box>
      <Box p="lg" bg="gray.0">
        <Container>
          <Card shadow="md" radius="md" className={classes.card} p="xl">
            <Flex>
              <Image src={HealthVisitImage} m="-30px 30px -30px -30px" />
              <div>
                <Badge color={theme.primaryColor} size="xl">
                  Now available
                </Badge>
                <Text size="lg" weight={500} mt="md">
                  Title
                </Text>
                <Text size="sm" color="dimmed" my="sm">
                  Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores impedit perferendis suscipit eaque,
                  iste dolor cupiditate blanditiis ratione. Lorem ipsum, dolor sit amet consectetur adipisicing elit.
                  Maiores impedit perferendis suscipit eaque, iste dolor cupiditate blanditiis ratione.
                </Text>
              </div>
            </Flex>
          </Card>
        </Container>
      </Box>
      <Box p="lg" bg="gray.0">
        <Container>
          <Grid columns={3}>
            {linkPages.map((item, index) => (
              <Grid.Col key={`card-${index}`} span={1}>
                <Card shadow="md" radius="md" className={classes.card} p="xl">
                  <Image src={item.img} width={80} />
                  <Text size="lg" weight={500} mt="md">
                    {item.title}
                  </Text>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Container>
      </Box>
      <Box p="lg" bg="gray.0">
        <Container>
          <Grid columns={2}>
            <Grid.Col span={1}>
              <Card shadow="md" radius="md" className={classes.card} p="xl">
                <Group noWrap>
                  <Avatar src={DoctorImage} size="xl" />
                  <div>
                    <Text weight={500}>Primary Care Provider</Text>
                    <Text size="sm" color="dimmed" my="sm">
                      Having a consistent, trusted provider can lead to better health.
                    </Text>
                    <Button onClick={() => navigate('/account/provider')}>Choose Provider</Button>
                  </div>
                </Group>
              </Card>
            </Grid.Col>
            <Grid.Col span={1}>
              <Card shadow="md" radius="md" className={classes.card} p="xl">
                <Stack>
                  {recommendations.map((item, index) => (
                    <div key={`recommendation-${index}`}>
                      <Text weight={500}>{item.title}</Text>
                      <Text size="sm" color="dimmed" my="sm">
                        {item.description}
                      </Text>
                    </div>
                  ))}
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        </Container>
      </Box>
    </>
  );
}
