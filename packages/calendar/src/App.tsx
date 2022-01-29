import { Avatar, Button, CssBaseline, DefaultTheme, Document, FooterLinks, FormSection, TextField } from '@medplum/ui';
import '@medplum/ui/styles.css';
import React, { useState } from 'react';
import './App.css';
import { Month } from './Month';

export function App(): JSX.Element {
  const [month, setMonth] = useState<Date>(new Date());
  const [date, setDate] = useState<string>();
  const [time, setTime] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [form, setForm] = useState<string>();

  function moveMonth(delta: number): void {
    setMonth((currMonth) => {
      const prevMonth = new Date(currMonth.getTime());
      prevMonth.setMonth(currMonth.getMonth() + delta);
      return prevMonth;
    });
  }

  return (
    <>
      <CssBaseline />
      <DefaultTheme />
      <Document>
        <div className="medplum-calendar-container">
          <div className="medplum-calendar-info-pane">
            <Avatar size="large" src="https://cody.ebberson.com/img/cody-ebberson.jpg" />
            <h1>Cody Ebberson</h1>
            <h3>1 hour</h3>
            {date && <p>{date}</p>}
            {time && <p>{time}</p>}
          </div>
          <div className="medplum-calendar-selection-pane">
            {!date && (
              <div>
                <h3>Select date</h3>
                <p>
                  {month.toLocaleString('default', { month: 'long' })}&nbsp;{month.getFullYear()}
                  &nbsp;
                  <button onClick={() => moveMonth(-1)}>&lt;</button>
                  <button onClick={() => moveMonth(1)}>&gt;</button>
                </p>
                <Month year={month.getFullYear()} month={month.getMonth()} onClick={setDate} />
              </div>
            )}
            {date && !time && (
              <div>
                <h1>Select time</h1>
                <Button onClick={() => setTime('12:00:00')}>Time</Button>
              </div>
            )}
            {date && time && !info && (
              <div>
                <h3>Enter your info</h3>
                <FormSection title="Name" htmlFor="name">
                  <TextField name="name" />
                </FormSection>
                <FormSection title="Email" htmlFor="email">
                  <TextField name="email" />
                </FormSection>
                <Button primary={true} onClick={() => setInfo('info')}>
                  Next
                </Button>
              </div>
            )}
            {date && time && info && !form && (
              <div>
                <h3>Custom questions</h3>
                <FormSection title="Question 1" htmlFor="q1">
                  <TextField name="q1" />
                </FormSection>
                <FormSection title="Question 2" htmlFor="q2">
                  <TextField name="email" />
                </FormSection>
                <FormSection title="Question 3" htmlFor="q3">
                  <TextField name="email" />
                </FormSection>
                <Button primary={true} onClick={() => setForm('form')}>
                  Next
                </Button>
              </div>
            )}
            {date && time && info && form && (
              <div>
                <h3>You're all set!</h3>
                <p>Check your email for a calendar invite.</p>
              </div>
            )}
          </div>
        </div>
      </Document>
      <FooterLinks>
        <a href="https://www.medplum.com/terms">Terms</a>
        <a href="https://www.medplum.com/privacy">Privacy</a>
      </FooterLinks>
    </>
  );
}
