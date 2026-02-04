// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export interface PatientName {
  given: string[];
  family: string;
}

export interface PatientAddress {
  line: string[];
  city: string;
  state?: string;
  postalCode: string;
}

export interface PatientData {
  name: PatientName;
  birthDate: string;
  gender: 'male' | 'female';
  address: PatientAddress;
  phone: string;
  email: string;
}

export interface PractitionerData {
  name: PatientName;
  prefix: string[];
  phone: string;
  email: string;
  identifier: string;
}

const FIRST_NAMES_MALE = [
  'James',
  'John',
  'Robert',
  'Michael',
  'William',
  'David',
  'Richard',
  'Joseph',
  'Thomas',
  'Charles',
  'Christopher',
  'Daniel',
  'Matthew',
  'Anthony',
  'Mark',
  'Donald',
  'Steven',
  'Paul',
  'Andrew',
  'Joshua',
  'Kenneth',
  'Kevin',
  'Brian',
  'George',
  'Edward',
  'Ronald',
  'Timothy',
  'Jason',
  'Jeffrey',
  'Ryan',
  'Jacob',
  'Gary',
  'Nicholas',
  'Eric',
  'Jonathan',
];

const FIRST_NAMES_FEMALE = [
  'Mary',
  'Patricia',
  'Jennifer',
  'Linda',
  'Elizabeth',
  'Barbara',
  'Susan',
  'Jessica',
  'Sarah',
  'Karen',
  'Nancy',
  'Lisa',
  'Betty',
  'Margaret',
  'Sandra',
  'Ashley',
  'Kimberly',
  'Emily',
  'Donna',
  'Michelle',
  'Dorothy',
  'Carol',
  'Amanda',
  'Melissa',
  'Deborah',
  'Stephanie',
  'Rebecca',
  'Sharon',
  'Laura',
  'Cynthia',
  'Kathleen',
  'Amy',
  'Angela',
  'Shirley',
  'Anna',
];

const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Taylor',
  'Moore',
  'Jackson',
  'Martin',
  'Lee',
  'Thompson',
  'White',
  'Harris',
  'Sanchez',
  'Clark',
  'Ramirez',
  'Lewis',
  'Robinson',
  'Walker',
  'Young',
  'Allen',
  'King',
  'Wright',
  'Scott',
  'Torres',
  'Nguyen',
  'Hill',
  'Flores',
  'Green',
  'Adams',
];

const US_CITIES = [
  { city: 'New York', state: 'NY', postalCode: '10001' },
  { city: 'Los Angeles', state: 'CA', postalCode: '90001' },
  { city: 'Chicago', state: 'IL', postalCode: '60601' },
  { city: 'Houston', state: 'TX', postalCode: '77001' },
  { city: 'Phoenix', state: 'AZ', postalCode: '85001' },
  { city: 'Philadelphia', state: 'PA', postalCode: '19101' },
  { city: 'San Antonio', state: 'TX', postalCode: '78201' },
  { city: 'San Diego', state: 'CA', postalCode: '92101' },
  { city: 'Dallas', state: 'TX', postalCode: '75201' },
  { city: 'San Jose', state: 'CA', postalCode: '95101' },
  { city: 'Austin', state: 'TX', postalCode: '78701' },
  { city: 'Jacksonville', state: 'FL', postalCode: '32099' },
  { city: 'Fort Worth', state: 'TX', postalCode: '76101' },
  { city: 'Columbus', state: 'OH', postalCode: '43201' },
  { city: 'Charlotte', state: 'NC', postalCode: '28201' },
];

const US_STREETS = [
  'Main St',
  'Oak Ave',
  'Elm St',
  'Park Ave',
  'Maple Dr',
  'Cedar Ln',
  'Pine Rd',
  'Washington St',
  'Lincoln Ave',
  'Jefferson Dr',
  'Madison Ave',
  'Monroe St',
  'Adams Way',
  'Jackson Blvd',
  'Franklin St',
];

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(startYear: number, endYear: number): string {
  const year = randomInt(startYear, endYear);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generatePhoneNumber(): string {
  return `+1${randomInt(200, 999)}${randomInt(200, 999)}${randomInt(1000, 9999)}`;
}

function generateEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
  const name = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
  return `${name}@${randomElement(domains)}`;
}

export function generatePatient(_index: number): PatientData {
  const gender = Math.random() > 0.5 ? 'male' : 'female';
  const firstName = randomElement(gender === 'male' ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
  const lastName = randomElement(LAST_NAMES);
  const cityData = randomElement(US_CITIES);
  const street = randomElement(US_STREETS);
  const houseNumber = randomInt(1, 200);

  return {
    name: {
      given: [firstName],
      family: lastName,
    },
    birthDate: randomDate(1950, 2005),
    gender,
    address: {
      line: [`${houseNumber} ${street}`],
      city: cityData.city,
      state: cityData.state,
      postalCode: cityData.postalCode,
    },
    phone: generatePhoneNumber(),
    email: generateEmail(firstName, lastName),
  };
}

export function generatePractitioner(_index: number): PractitionerData {
  const gender = Math.random() > 0.3 ? 'male' : 'female';
  const firstName = randomElement(gender === 'male' ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
  const lastName = randomElement(LAST_NAMES);
  const prefixes = ['Dr.', 'MD'];

  return {
    name: {
      given: [firstName],
      family: lastName,
    },
    prefix: [randomElement(prefixes)],
    phone: generatePhoneNumber(),
    email: generateEmail(firstName, lastName),
    identifier: `${randomInt(100000000, 999999999)}`,
  };
}

export function generatePatients(count: number): PatientData[] {
  const patients: PatientData[] = [];
  for (let i = 0; i < count; i++) {
    patients.push(generatePatient(i));
  }
  return patients;
}

export function generatePractitioners(count: number): PractitionerData[] {
  const practitioners: PractitionerData[] = [];
  for (let i = 0; i < count; i++) {
    practitioners.push(generatePractitioner(i));
  }
  return practitioners;
}
