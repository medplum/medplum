export type Specialty =
  | 'fisioterapia'
  | 'psicologia'
  | 'nutricao'
  | 'fonoaudiologia'
  | 'quiropraxia'
  | 'terapia-ocupacional'
  | 'enfermagem'
  | 'cuidados-domiciliares'
  | 'educacao-fisica'
  | 'estetica'
  | 'outro';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';

export type SubscriptionPlan = 'starter' | 'pro' | 'clinic';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';

export type UserRole = 'owner' | 'practitioner' | 'receptionist';

export interface HHPatient {
  id: string;
  name: string;
  cpf?: string;
  phone: string;
  email?: string;
  birthDate?: string;
  notes?: string;
  createdAt: string;
}

export interface HHPractitioner {
  id: string;
  name: string;
  email: string;
  specialty: Specialty;
  professionalId?: string; // CRP, CREFITO, CRN etc.
  phone?: string;
}

export interface HHAppointment {
  id: string;
  patientId: string;
  patientName: string;
  practitionerId: string;
  practitionerName: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  notes?: string;
  isHomeVisit?: boolean;
  homeVisitAddress?: string;
}

export interface HHClinic {
  id: string;
  name: string;
  cnpj?: string;
  phone?: string;
  address?: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt?: string;
}
