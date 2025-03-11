import React, { useEffect, useState } from 'react';
import { Button, Group, Flex, Paper, useMantineTheme } from '@mantine/core';
import { IconCheck, IconArrowRight } from '@tabler/icons-react';
import classes from './EncounterStepper.module.css';
import { useLocation, Link, useParams } from 'react-router';

const steps = [
  { label: 'Check in', path: 'checkin' },
  { label: 'Exam', path: 'chart' },
  { label: 'Check out', path: 'checkout' },
  { label: 'Encounter complete', path: 'complete' },
];

export const EncounterStepper = (): JSX.Element => {
  const theme = useMantineTheme();
  const location = useLocation();
  const { patientId, encounterId } = useParams<{ patientId: string; encounterId: string }>();
  const [currentStep, setCurrentStep] = useState<string | undefined>();

  useEffect(() => {
    setCurrentStep(location.pathname.split('/').pop());
  }, [location]);

  const getClassName = (step: string): string => {
    if (step === currentStep) {
      return classes.current;
    }
    const currentStepIndex = steps.findIndex((step) => step.path === (currentStep ?? ''));
    const stepIndex = steps.findIndex((s) => s.path === step);
    if (stepIndex < currentStepIndex) {
      return classes.clear;
    }
    return classes.disabled;
  };

  return (
    <Paper p="md">
      <Flex justify="space-between" align="center">
        <Group gap="xs">
          {steps.map((step, index) => (
            <React.Fragment key={index}>
              <Button className={getClassName(step.path)} leftSection={<IconCheck className={classes.icon} />}>
                {step.label}
              </Button>
              {index < steps.length - 1 && <IconArrowRight color={theme.colors.gray[5]} />}
            </React.Fragment>
          ))}
        </Group>

        <Group>
          {currentStep === 'checkin' && (
            <Button component={Link} to={`/Patient/${patientId}/Encounter/${encounterId}/chart`}>
              Proceed to exam
            </Button>
          )}
          {currentStep === 'chart' && (
            <Button component={Link} to={`/Patient/${patientId}/Encounter/${encounterId}/complete`}>
              Proceed to checkout
            </Button>
          )}
          {currentStep === 'complete' && (
            <Button component={Link} to="#">
              Encounter completed
            </Button>
          )}
        </Group>
      </Flex>
    </Paper>
  );
};
