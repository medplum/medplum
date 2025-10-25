// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export type PhotonPatient = {
  id: string;
  externalId?: string;
  name: PhotonName;
  dateOfBirth: string;
  sex: PhotonSexType;
  gender?: string;
  email?: string;
  phone: string;
  allergies?: PhotonPatientAllergy[];
  medicationHistory?: PhotonPatientMedication[];
  address?: PhotonAddress;
  prescriptions?: PhotonPrescription[];
  orders?: PhotonOrder[];
  preferredPharmacy?: PhotonPharmacy[];
};

export type PhotonName = {
  full: string;
  title?: string;
  first: string;
  middle?: string;
  last: string;
};

export type PhotonNameInput = {
  first: string;
  last: string;
  middle?: string;
  title?: string;
};

export type PhotonSexType = 'MALE' | 'FEMALE' | 'UNKNOWN';

export type PhotonPatientAllergy = {
  allergen: PhotonAllergen;
  comment?: string;
  onset?: string;
};

export type PhotonPatientMedication = {
  prescription?: PhotonPrescription;
  medication: PhotonMedication;
  comment?: string;
  active: boolean;
};

export type PhotonAddress = {
  name?: Name;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

export type PhotonPrescription = {
  id: string;
  externalId?: string;
  prescriber: PhotonProvider;
  patient: PhotonPatient;
  state: 'ACTIVE' | 'EXPIRED' | 'DEPLETED' | 'CANCELED';
  treatment: PhotonTreatment;
  dispenseAsWritten?: boolean;
  dispenseQuantity: number;
  dispenseUnit: string;
  refillsAllowed: number;
  fillsRemaining: number;
  fillsAllowed: number;
  daysSupply?: number;
  instructions: string;
  notes?: string;
  diagnoses?: PhotonDiagnosis[];
  effectiveDate: string;
  expirationDate: string;
  writtenAt: string;
  fills: Fill[];
};

export type PhotonOrder = {
  id: string;
  externalId?: string;
  state: 'ROUTING' | 'PENDING' | 'PLACED' | 'COMPLETED' | 'CANCELED' | 'ERROR';
  fills: Fill[];
  address?: Address;
  patient: PhotonPatient;
  pharmacy?: PhotonPharmacy;
  createdAt: string;
  fulfillment?: PhotonOrderFulfillment;
};

export type Fill = {
  id: string;
  treatment: PhotonTreatment;
  prescription?: Partial<PhotonPrescription>;
  state: 'SCHEDULED' | 'NEW' | 'SENT' | 'CANCELED';
  requestedAt: string;
  filledAt?: string;
  order?: PhotonOrder;
};

export type PhotonPharmacy = {
  id: string;
  name: string;
  name2?: string;
  NPI?: string;
  NCDP?: string;
  address?: Address;
  fax?: string;
  phone?: string;
  fulfillmentTypes?: FullfillmentType[];
};

export type FullfillmentType = 'PICK_UP' | 'MAIL_ORDER';

export type PhotonDiagnosis = {
  type: 'ICD10';
  code: string;
  name: string;
};

export type PhotonProvider = {
  id: string;
  externalId?: string;
  name: PhotonName;
  email: string;
  phone: string;
  fax?: string;
  address: PhotonAddress;
  organizations: PhotonOrganization[];
  NPI?: string;
};

export type PhotonOrganization = {
  id: string;
  name: string;
  type: 'PRESCRIBER' | 'PHARMACY';
  NPI?: string;
  address: Address;
  fax?: string;
  phone?: string;
  email?: string;
};

export type PhotonAllergen = {
  id: string;
  name: string;
  rxcui?: string;
};

export type PhotonMedication = PhotonTreatment & {
  type?: 'RX' | 'OTC';
  concept: 'DRUG' | 'PRODUCT' | 'PACKAGE';
  schedule?: 'I' | 'II' | 'III' | 'IV' | 'V';
  controlled: boolean;
  brandName?: string;
  genericName?: string;
  strength?: string;
  form?: string;
  manufacturer?: string;
};

export type PhotonTreatment = {
  id: string;
  name: string;
  codes: PhotonTreatmentCodes;
  description?: string;
};

export type PhotonTreatmentCodes = {
  rxcui?: string;
  productNDC?: string;
  packageNDC?: string;
  SKU?: string;
  HCPCS?: string;
};

export type PhotonOrderFulfillment = {
  type: FullfillmentType;
  state: string;
  carrier?: string;
  trackingNumber?: string;
};

export type CreatePatientVariables = {
  externalId: string;
  name: PhotonNameInput;
  dateOfBirth: string;
  sex: 'MALE' | 'FEMALE' | 'UNKNOWN';
  gender?: string;
  email?: string;
  phone?: string;
  allergies?: PhotonAllergenInput[];
  medicationHistory?: PhotonMedHistoryInput[];
  address?: PhotonAddress;
};

export type PhotonAllergenInput = {
  allergenId: string;
  comment?: string;
  onset?: string;
};

export type PhotonMedHistoryInput = {
  medicationId: string;
  active: boolean;
  comment?: string;
};

export interface PhotonWebhook {
  method: 'POST';
  path: string;
  query: Record<string, string>;
  client_ip: string;
  url: string;
  headers: Record<string, string>;
  body: PhotonEvent;
}

type BasePhotonEvent = {
  id: string;
  type: OrderEventType | PrescriptionEventType;
  specversion: string;
  datacontenttype: string;
  time: string;
  subject: string;
  source: string;
  data: OrderData | PrescriptionData;
};

export type OrderEventType =
  | 'photon:order:created'
  | 'photon:order:placed'
  | 'photon:order:fulfillment'
  | 'photon:order:completed'
  | 'photon:order:canceled'
  | 'photon:order:rerouted'
  | 'photon:order:error';

type PrescriptionEventType =
  | 'photon:prescription:created'
  | 'photon:prescription:depleted'
  | 'photon:prescription:expired';

type OrderData = {
  id: string;
  externalId?: string;
  patient: {
    id: string;
    externalId?: string;
  };
};

type PrescriptionData = {
  id: string;
  externalId?: string;
  patient: {
    id: string;
    externalId?: string;
  };
};

interface OrderCreatedData extends OrderData {
  pharmacyId: string;
  fills: Partial<Fill>[];
  createdAt: string;
}

interface OrderCreatedEvent extends BasePhotonEvent {
  type: 'photon:order:created';
  data: OrderCreatedData;
}

interface OrderPlacedEvent extends BasePhotonEvent {
  type: 'photon:order:placed';
  data: OrderData;
}

interface OrderFulfillmentData extends OrderData {
  fulfillment: {
    type: string;
    state: string;
    carrier: string;
    trackingNumber: string;
  };
}

interface OrderFulfillmentEvent extends BasePhotonEvent {
  type: 'photon:order:fulfillment';
  data: OrderFulfillmentData;
}

interface OrderCompletedEvent extends BasePhotonEvent {
  type: 'photon:order:completed';
  data: OrderData;
}

interface OrderCanceledEvent extends BasePhotonEvent {
  type: 'photon:order:canceled';
  data: OrderData;
}

interface OrderReroutedData extends OrderData {
  pharmacy: {
    id: string;
    name: string;
    address: PhotonAddress;
  };
}

interface OrderReroutedEvent extends BasePhotonEvent {
  type: 'photon:order:rerouted';
  data: OrderReroutedData;
}

interface OrderErrorData extends OrderData {
  reason: string;
}

interface OrderErrorEvent extends BasePhotonEvent {
  type: 'photon:order:error';
  data: OrderErrorData;
}

interface PrescriptionCreatedData extends PrescriptionData {
  dispenseQuantity: number;
  dispenseUnit: string;
  dispenseAsWritten: boolean;
  refillsAllowed: number;
  fillsAllowed?: number;
  daysSupply: number;
  instructions: string;
  effectiveDate: string;
  expirationDate: string;
  prescriberId: string;
  treatmentId: string;
  patient: {
    id: string;
    externalId: string;
  };
  notes: string;
}

interface PrescriptionCreatedEvent extends BasePhotonEvent {
  type: 'photon:prescription:created';
  data: PrescriptionCreatedData;
}

export interface PrescriptionDepletedEvent extends BasePhotonEvent {
  type: 'photon:prescription:depleted';
  data: PrescriptionData;
}

interface PrescriptionExpiredEvent extends BasePhotonEvent {
  type: 'photon:prescription:expired';
  data: PrescriptionData;
}

export type OrderEvent =
  | OrderCreatedEvent
  | OrderPlacedEvent
  | OrderFulfillmentEvent
  | OrderCompletedEvent
  | OrderCanceledEvent
  | OrderReroutedEvent
  | OrderErrorEvent;

export type PrescriptionEvent = PrescriptionCreatedEvent | PrescriptionDepletedEvent | PrescriptionExpiredEvent;

export type PhotonEvent = OrderEvent | PrescriptionEvent;
