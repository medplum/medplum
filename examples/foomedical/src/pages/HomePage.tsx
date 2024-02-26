import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Container,
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
import PharmacyImage from '../img/homePage/pharmacy.svg';
import PillImage from '../img/homePage/pill.svg';
import classes from './HomePage.module.css';

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
  const theme = useMantineTheme();
  const profile = useMedplumProfile() as Patient | Practitioner;
  const profileName = profile.name ? formatHumanName(profile.name[0]) : '';

  return (
    <Box bg="gray.0">
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
        <Group justify="center">
          <IconGift />
          <p>Put calls to action here</p>
          <Button variant="white" onClick={() => navigate('/messages')}>
            Send Message
          </Button>
        </Group>
      </Box>
      <Box p="lg">
        <Container>
          <Grid>
            {carouselItems.map((item, index) => (
              <Grid.Col key={`card-${index}`} span={3} pb={40}>
                <Card shadow="md" radius="md" className={classes.card} p="xl">
                  <IconSquareCheck />
                  <Text size="lg" fw={500} mt="md">
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
      <Box p="lg">
        <Container>
          <Card shadow="md" radius="md" className={classes.card} p="xl">
            <IconSquareCheck />
            <Text size="lg" fw={500} mt="md">
              Better rest, better health
            </Text>
            <Text size="sm" color="dimmed" my="sm">
              Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores impedit perferendis suscipit eaque, iste
              dolor cupiditate blanditiis ratione. Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores
              impedit perferendis suscipit eaque, iste dolor cupiditate blanditiis ratione.
            </Text>
            <Group>
              <Button>Invite Friends</Button>
            </Group>
          </Card>
        </Container>
      </Box>
      <Box p="lg">
        <Container>
          <Card shadow="md" radius="md" className={classes.card} p="xl">
            <Flex>
              <Image src={HealthVisitImage} m="-40px 30px -40px -40px" w="40%" />
              <div>
                <Badge color={theme.primaryColor} size="xl">
                  Now available
                </Badge>
                <Text size="lg" fw={500} mt="md">
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
      <Box p="lg">
        <Container>
          <Grid columns={3} pb="xl">
            {linkPages.map((item, index) => (
              <Grid.Col key={`card-${index}`} span={1}>
                <Card shadow="md" radius="md" className={classes.card} p="xl">
                  <Image src={item.img} w={80} />
                  <Text size="lg" fw={500} mt="md">
                    {item.title}
                  </Text>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Container>
      </Box>
      <Box p="lg">
        <Container>
          <Grid columns={2} pb="xl">
            <Grid.Col span={1}>
              <Card shadow="md" radius="md" className={classes.card} p="xl">
                <Group wrap="nowrap">
                  <Avatar src={DoctorImage} size="xl" />
                  <div>
                    <Text fw={500}>Primary Care Provider</Text>
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
                      <Text fw={500}>{item.title}</Text>
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
    </Box>
  );
}
