// =====================================================
// SWIFTCHECKIN MULTI-TENANT TYPES - HARDENED V2
// =====================================================

export interface Organization {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  slug: string;
  tagline: string | null;
  host_names: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  brand_color: string | null;
  kiosk_welcome_heading: string | null;
  kiosk_welcome_subtext: string | null;
  admin_name: string;
  admin_email: string;
  admin_password_hash: string;
  subscription_status: 'trial' | 'active' | 'expired' | 'cancelled';
  subscription_plan: 'monthly' | 'annual' | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  timezone: string;
  paystack_customer_code: string | null;
  sms_credits: number;
  sms_welcome_enabled: boolean;
  sms_birthday_enabled: boolean;
  sms_missed_enabled: boolean;
  sms_sender_id: string | null;
}

// A church-defined bucket of grouping — "Cell Group", "Department", or
// whatever else it wants to track. Each category holds its own set of
// Groups, and a person can hold one membership per category at once.
export interface GroupCategory {
  id: string;
  created_at: string;
  org_id: string;
  name: string;
}

export interface Group {
  id: string;
  created_at: string;
  updated_at: string;
  org_id: string;
  category_id: string;
  name: string;
  leader_person_id: string | null;
  leader?: Person | null;
}

export interface PersonGroup {
  person_id: string;
  group_id: string;
}

export interface Payment {
  id: string;
  created_at: string;
  org_id: string;
  paystack_reference: string;
  plan: 'monthly' | 'annual';
  amount: number;
  currency: string;
  status: 'success' | 'failed';
  raw_event: unknown;
}

export type PersonRole = 'visitor' | 'member' | 'leader';

export interface Person {
  id: string;
  created_at: string;
  updated_at: string;
  org_id: string;
  full_name: string;
  phone: string;
  gender: 'male' | 'female' | null;
  email: string | null;
  date_of_birth: string | null;
  occupation: string | null;
  company: string | null;
  location: string | null;
  how_found_us: string | null;
  notes: string | null;
  role: PersonRole;
  first_attendance_date: string | null;
  total_checkins: number;
  last_checkin_at: string | null;
  archived: boolean;
  sms_opted_out: boolean;
  // Admin-uploaded only — never settable from the kiosk or by the person
  // themselves. See PersonModal / Avatar.
  photo_url: string | null;
  // Set by either delivery provider's bounce/complaint webhook. A confirmed
  // hard failure is permanently suppressed until an admin enters a new email.
  email_invalid_at: string | null;
  // A kiosk email that failed a disposable, MX, or previous-bounce check but
  // was deliberately kept for the person's record. It is never emailed until
  // an admin corrects/replaces it.
  email_needs_verification_at: string | null;
}

export interface Service {
  id: string;
  created_at: string;
  updated_at: string;
  org_id: string;
  service_date: string;
  service_time: string | null;
  title: string | null;
  theme: string | null;
  scripture: string | null;
  message: string | null;
  is_active: boolean;
}

export interface Checkin {
  id: string;
  created_at: string;
  updated_at: string;
  org_id: string;
  person_id: string;
  service_id: string;
  checked_in_at: string;
  is_first_time: boolean;
  synced: boolean;
  person?: Person;
  service?: Service;
}

export interface AppSettings {
  org_id: string;
  kiosk_open: boolean;
  active_service_id: string | null;
  kiosk_access_code: string | null;
  updated_at: string;
}

export type EmailTemplateType = 'welcome' | 'birthday' | 'missed';

export interface EmailTemplate {
  id: string;
  created_at: string;
  updated_at: string;
  org_id: string;
  template_type: EmailTemplateType;
  subject: string;
  body: string;
}

export interface SmsLog {
  id: string;
  created_at: string;
  org_id: string;
  person_id: string | null;
  sms_type: string;
  recipient_phone: string;
  message: string | null;
  status: 'sent' | 'failed';
}

export interface SmsBroadcast {
  id: string;
  created_at: string;
  org_id: string;
  message: string;
  sender_id: string;
  recipient_filter: string;
  recipient_count: number;
  credits_used: number;
  delivered_count: number;
  failed_count: number;
  status: 'delivered' | 'partial' | 'failed' | 'sent';
}

export interface EmailLog {
  id: string;
  created_at: string;
  org_id: string;
  person_id: string | null;
  email_type: string;
  subject: string | null;
  recipient_email: string | null;
  status: 'sent' | 'failed';
}

// Auth types - HARDENED with subscription date
export interface AuthSession {
  orgId: string;
  orgName: string;
  orgSlug: string;
  adminEmail: string;
  subscriptionStatus: Organization['subscription_status'];
  subscriptionEndDate: string | null;
  exp: number;
}

export type GivingType = 'tithe' | 'offering' | 'seed' | 'pledge' | 'other';
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer' | 'other';
export type GivingStatus = 'recorded' | 'sent';

export interface Giving {
  id: string;
  created_at: string;
  updated_at: string;
  org_id: string;
  person_id: string | null;
  giver_name: string;
  giver_email: string | null;
  amount: number;
  currency: string;
  giving_type: GivingType;
  giving_type_other: string | null;
  payment_method: PaymentMethod;
  service_id: string | null;
  notes: string | null;
  status: GivingStatus;
  receipt_sent_at: string | null;
  person?: Person;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
