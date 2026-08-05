import type { LucideIcon } from 'lucide-react';
import { Users, HardHat, Building2, ShoppingBag, HeartPulse, GraduationCap } from 'lucide-react';

export interface GalleryTemplate {
  id: string;
  name: string;
  description: string;
  seedPrompt: string;
}

export interface GalleryIndustry {
  id: string;
  name: string;
  icon: LucideIcon;
  templates: readonly [GalleryTemplate, GalleryTemplate, GalleryTemplate, GalleryTemplate, GalleryTemplate];
}

export const TEMPLATE_GALLERY: readonly [
  GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry
] = [
  {
    id: 'hr',
    name: 'HR & Onboarding',
    icon: Users,
    templates: [
      {
        id: 'hr-offer-letter',
        name: 'Offer Letter',
        description: 'A formal job offer with role, compensation, and sign-off.',
        seedPrompt: 'Create a job offer letter template with fields for candidate name, job title, department, start date, annual salary, reporting manager, offer expiry date, and signature lines for the candidate and the hiring manager.',
      },
      {
        id: 'hr-onboarding-checklist',
        name: 'Employee Onboarding Checklist',
        description: 'Track equipment, accounts, and orientation for new hires.',
        seedPrompt: 'Create an employee onboarding checklist with fields for employee name, start date, department, a checklist of onboarding tasks (equipment issued, accounts created, orientation completed, handbook received), and sign-off lines for the new hire and their manager.',
      },
      {
        id: 'hr-leave-request',
        name: 'Leave Request Form',
        description: 'Employee time-off requests with manager approval.',
        seedPrompt: 'Create a leave request form with fields for employee name, employee ID, leave type (annual, sick, unpaid), start date, end date, total days requested, reason for leave, and signature lines for the employee and approving manager.',
      },
      {
        id: 'hr-timesheet',
        name: 'Timesheet',
        description: 'Weekly hours worked, signed off by employee and supervisor.',
        seedPrompt: 'Create a weekly timesheet with fields for employee name, employee ID, week ending date, a table of days worked with hours per day, total hours, and signature lines for the employee and their supervisor.',
      },
      {
        id: 'hr-offboarding',
        name: 'Exit / Offboarding Form',
        description: 'Wrap up equipment return and final pay on an employee exit.',
        seedPrompt: 'Create an employee exit form with fields for employee name, last working day, reason for leaving, equipment returned checklist, final pay confirmation, and signature lines for the employee and HR representative.',
      },
    ],
  },
  {
    id: 'construction',
    name: 'Construction & Facilities',
    icon: HardHat,
    templates: [
      {
        id: 'construction-visitor-log',
        name: 'Site Visitor Log',
        description: 'Track who is on site and why, with a safety acknowledgment.',
        seedPrompt: 'Create a construction site visitor log with fields for visitor name, company, date, time in, time out, purpose of visit, host name, and a safety briefing acknowledgment signature.',
      },
      {
        id: 'construction-safety-inspection',
        name: 'Safety Inspection Checklist',
        description: 'Routine site safety checks with an inspector sign-off.',
        seedPrompt: 'Create a site safety inspection checklist with fields for site name, inspector name, inspection date, a checklist of safety items (PPE worn, hazards flagged, equipment guarded, walkways clear), notes, and inspector signature.',
      },
      {
        id: 'construction-equipment-checkout',
        name: 'Equipment Checkout Form',
        description: 'Log tools and equipment leaving and returning to site.',
        seedPrompt: 'Create an equipment checkout form with fields for equipment name, equipment ID, checked out by, date checked out, expected return date, condition notes, and signature lines for checkout and return.',
      },
      {
        id: 'construction-work-order',
        name: 'Work Order',
        description: 'Assign and track a piece of requested work.',
        seedPrompt: 'Create a work order form with fields for work order number, requested by, date, location, description of work, priority level, assigned technician, and completion sign-off.',
      },
      {
        id: 'construction-incident-report',
        name: 'Incident Report',
        description: 'Document what happened, injuries, and corrective action.',
        seedPrompt: 'Create a site incident report with fields for date and time of incident, location, people involved, description of what happened, injuries (if any), corrective actions taken, and signature lines for the reporter and site supervisor.',
      },
    ],
  },
  {
    id: 'real-estate',
    name: 'Real Estate',
    icon: Building2,
    templates: [
      {
        id: 'real-estate-lease',
        name: 'Lease Agreement',
        description: 'Core residential lease terms for landlord and tenant.',
        seedPrompt: 'Create a residential lease agreement template with fields for landlord name, tenant name, property address, lease start date, lease end date, monthly rent, security deposit amount, and signature lines for landlord and tenant.',
      },
      {
        id: 'real-estate-property-inspection',
        name: 'Property Inspection Checklist',
        description: 'Room-by-room condition record at inspection time.',
        seedPrompt: 'Create a property inspection checklist with fields for property address, inspection date, inspector name, a room-by-room condition checklist (walls, floors, fixtures, appliances), notes, and signature lines for inspector and tenant.',
      },
      {
        id: 'real-estate-tenant-application',
        name: 'Tenant Application',
        description: 'Prospective tenant details, income, and references.',
        seedPrompt: 'Create a rental tenant application form with fields for applicant name, contact details, current address, employer name, monthly income, references, desired move-in date, and applicant signature.',
      },
      {
        id: 'real-estate-move-checklist',
        name: 'Move-In/Move-Out Checklist',
        description: 'Condition record and damage notes at move in or out.',
        seedPrompt: 'Create a move-in/move-out condition checklist with fields for property address, tenant name, move date, a condition checklist per room, damage notes, and signature lines for landlord and tenant.',
      },
      {
        id: 'real-estate-maintenance-request',
        name: 'Maintenance Request',
        description: 'Tenant-submitted repair or maintenance issue.',
        seedPrompt: 'Create a property maintenance request form with fields for tenant name, unit/property address, date submitted, description of the issue, urgency level, preferred access times, and tenant signature.',
      },
    ],
  },
  {
    id: 'retail-hospitality',
    name: 'Retail & Hospitality',
    icon: ShoppingBag,
    templates: [
      {
        id: 'retail-purchase-order',
        name: 'Purchase Order',
        description: 'Itemized order to a supplier with delivery details.',
        seedPrompt: 'Create a purchase order form with fields for PO number, vendor name, order date, a table of items ordered with quantity and unit price, total amount, delivery address, and authorizing signature.',
      },
      {
        id: 'retail-delivery-note',
        name: 'Delivery Note',
        description: 'Confirm items and condition on delivery.',
        seedPrompt: 'Create a delivery note with fields for delivery date, supplier name, recipient name, a table of items delivered with quantities, condition on arrival, and signature lines for delivery driver and recipient.',
      },
      {
        id: 'retail-customer-registration',
        name: 'Customer Registration Form',
        description: 'Capture new customer contact details and consent.',
        seedPrompt: 'Create a customer registration form with fields for full name, contact number, email address, mailing address, date of registration, marketing consent checkbox, and customer signature.',
      },
      {
        id: 'retail-incident-report',
        name: 'Incident Report',
        description: 'Document a customer-facing incident and the response.',
        seedPrompt: 'Create a customer-facing incident report with fields for date and time, location, description of the incident, people involved, witnesses, action taken, and signature lines for the reporting staff member and manager.',
      },
      {
        id: 'retail-guest-feedback',
        name: 'Guest Feedback Form',
        description: 'Ratings and comments from a guest or customer visit.',
        seedPrompt: "Create a guest feedback form with fields for guest name, visit date, service rating, food/product quality rating, comments, whether they'd recommend the business, and an optional contact field for follow-up.",
      },
    ],
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    icon: HeartPulse,
    templates: [
      {
        id: 'healthcare-patient-intake',
        name: 'Patient Intake Form',
        description: 'New patient details, history, and emergency contact.',
        seedPrompt: 'Create a patient intake form with fields for patient name, date of birth, contact details, emergency contact, reason for visit, known allergies, current medications, and patient signature.',
      },
      {
        id: 'healthcare-consent-to-treatment',
        name: 'Consent to Treatment',
        description: 'Documented consent before a procedure or treatment.',
        seedPrompt: 'Create a consent to treatment form with fields for patient name, date of birth, description of proposed treatment, risks explained checkbox, physician name, and signature lines for patient and physician.',
      },
      {
        id: 'healthcare-appointment-record',
        name: 'Appointment Record',
        description: 'Visit summary and follow-up scheduling.',
        seedPrompt: 'Create an appointment record form with fields for patient name, date and time of appointment, provider name, reason for visit, notes, follow-up required checkbox, and next appointment date.',
      },
      {
        id: 'healthcare-discharge-summary',
        name: 'Discharge Summary',
        description: 'Diagnosis, treatment, and discharge instructions.',
        seedPrompt: 'Create a patient discharge summary with fields for patient name, admission date, discharge date, diagnosis, treatment summary, discharge instructions, follow-up care needed, and physician signature.',
      },
      {
        id: 'healthcare-visitor-log',
        name: 'Visitor Log',
        description: 'Track hospital visitors with a health screening step.',
        seedPrompt: 'Create a hospital visitor log with fields for visitor name, patient visited, relationship to patient, date, time in, time out, and a health screening confirmation checkbox.',
      },
    ],
  },
  {
    id: 'education',
    name: 'Education',
    icon: GraduationCap,
    templates: [
      {
        id: 'education-enrollment',
        name: 'Student Enrollment Form',
        description: 'New student and guardian details for enrollment.',
        seedPrompt: 'Create a student enrollment form with fields for student full name, date of birth, grade applying for, parent/guardian name, contact details, home address, and parent/guardian signature.',
      },
      {
        id: 'education-parental-consent',
        name: 'Parental Consent Form',
        description: 'Guardian consent for a specific school activity.',
        seedPrompt: 'Create a parental consent form with fields for student name, grade, description of the activity requiring consent, date, parent/guardian name, and parent/guardian signature.',
      },
      {
        id: 'education-field-trip-permission',
        name: 'Field Trip Permission Slip',
        description: 'Trip details, emergency contact, and guardian sign-off.',
        seedPrompt: 'Create a field trip permission slip with fields for student name, grade, trip destination, trip date, departure and return times, emergency contact, medical notes, and parent/guardian signature.',
      },
      {
        id: 'education-incident-report',
        name: 'Incident Report',
        description: 'Document a school incident and guardian notification.',
        seedPrompt: 'Create a school incident report with fields for student name, date and time, location, description of the incident, witnesses, action taken, and signature lines for the staff member and parent/guardian notified.',
      },
      {
        id: 'education-attendance-record',
        name: 'Attendance Record',
        description: 'Daily class attendance signed off by the teacher.',
        seedPrompt: 'Create a class attendance record with fields for class name, teacher name, date, a table of student names with present/absent/late marks, and teacher signature.',
      },
    ],
  },
];
