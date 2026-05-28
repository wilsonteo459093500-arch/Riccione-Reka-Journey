// =====================================================================
// Sail CRM — Constants
// All enums, role config, stage gates, design-workflow definition.
// Kept in a single file so business rules are easy to audit.
// =====================================================================

export const PIC_OPTIONS = ['Sheerly', 'Reina', 'Wilson'];

export const CLIENT_TYPES = ['Retail Customer', 'Designer', 'ID Company', 'ZXL', 'Project'];

export const LEAD_SOURCES = [
  'Instagram', 'Facebook', 'Tik Tok', 'Rednote', 'Website',
  'Walk-in', 'Referral', 'ZXL', 'Archidex', 'From Sail China',
];

export const CONTACT_METHODS = ['Whatsapp', 'Wechat', 'Instagram', 'Phone', 'Email'];

export const PRIORITIES = [
  { value: '1. High (Confirmed)', label: 'High (Confirmed)', color: '#3D5A4A', dot: '#3D5A4A' },
  { value: '2. High (Potential)', label: 'High (Potential)', color: '#A87C4F', dot: '#A87C4F' },
  { value: '3. Medium',           label: 'Medium',           color: '#B8995A', dot: '#B8995A' },
  { value: '4. Low',              label: 'Low',              color: '#9A8F7E', dot: '#9A8F7E' },
];

export const SALES_STAGES = [
  { value: 'Stage 1: New Contact',                  short: 'New Contact',         order: 1,  color: '#9A8F7E' },
  { value: 'Stage 2: Visited Showroom but No Quote', short: 'Showroom, No Quote',  order: 2,  color: '#B8995A' },
  { value: 'Stage 2: Quoted but No Showroom',       short: 'Quoted, No Showroom', order: 2,  color: '#C89B5A' },
  { value: 'Stage 2: Visited Showroom & Quoted',    short: 'Showroom + Quoted',   order: 2,  color: '#A87C4F' },
  { value: 'Stage 3: Design',                       short: 'Design',              order: 3,  color: '#6B8E7F' },
  { value: 'Stage 4: Order & Start Production',     short: 'Production',          order: 4,  color: '#4A6B5A' },
  { value: 'Stage 5: Shipping',                     short: 'Shipping',            order: 5,  color: '#3D5A4A' },
  { value: 'Stage 6: Installation',                 short: 'Installation',        order: 6,  color: '#345040' },
  { value: 'Stage 7: Complete',                     short: 'Complete',            order: 7,  color: '#2D4A3E' },
  { value: 'Dropped',                               short: 'Dropped',             order: 99, color: '#9C6B5C' },
];

export const COMPLETE_STAGE = 'Stage 7: Complete';
export const DROPPED_STAGE  = 'Dropped';
export const WON_STAGES = [
  'Stage 4: Order & Start Production',
  'Stage 5: Shipping',
  'Stage 6: Installation',
  'Stage 7: Complete',
];

export const PIPELINE_STAGES = [
  'Stage 1: New Contact',
  'Stage 2: Visited Showroom but No Quote',
  'Stage 2: Quoted but No Showroom',
  'Stage 2: Visited Showroom & Quoted',
];

export const CONFIRMED_STAGES = [
  'Stage 3: Design',
  'Stage 4: Order & Start Production',
  'Stage 5: Shipping',
  'Stage 6: Installation',
  'Stage 7: Complete',
];

export const PIPELINE_STAGE_ORDER = [...PIPELINE_STAGES, ...CONFIRMED_STAGES];

export const isActiveStage    = (s) => s !== DROPPED_STAGE && s !== COMPLETE_STAGE;
export const isPipelineStage  = (s) => PIPELINE_STAGES.includes(s);
export const isConfirmedStage = (s) => CONFIRMED_STAGES.includes(s);

// Stage gates: signed documents required before a project can advance
export const STAGE_GATES = {
  'Stage 4: Order & Start Production': {
    field: 'signedDetailDrawing',
    checkLabel: 'Detailed drawing has been signed / confirmed by customer',
    title: 'Confirm before moving to Production',
    note: 'Production cannot start until the customer has signed off on the detailed drawing.',
    requireLink: false,
  },
  'Stage 7: Complete': {
    field: 'signedHandoverList',
    checkLabel: 'Handover list has been signed by customer',
    title: 'Confirm before marking Complete',
    note: 'A project can only be marked Complete after the customer has signed the handover list AND the site supervisor has uploaded all handover photos to Google Drive.',
    requireLink: true,
    linkField: 'handoverDriveLink',
    linkLabel: 'Google Drive link to handover photos',
    linkPlaceholder: 'https://drive.google.com/...',
  },
};

// Migrate older / renamed stage values stored in the database
export const STAGE_MIGRATION = {
  'Stage 5: Shipping & Installation': 'Stage 5: Shipping',
  'Stage 6: Complete':                'Stage 7: Complete',
};

// ---------------------------------------------------------------
// Roles & permissions
// PINs are a soft accountability layer, not real security.
// For real security, enable Supabase Auth + RLS (see schema.sql).
// ---------------------------------------------------------------
export const ROLES = {
  manager:         { label: 'Manager',         color: '#2D4A3E', desc: 'Full access · manages users & sees everything' },
  sales:           { label: 'Sales',           color: '#A87C4F', desc: 'Edits Leads, Pipeline & Design · views After-Sales' },
  designer:        { label: 'Designer',        color: '#6B8E7F', desc: 'Edits Leads, Pipeline & Design · views After-Sales' },
  site_supervisor: { label: 'Site Supervisor', color: '#3D5A4A', desc: 'Runs installation/handover & owns After-Sales tickets' },
};

export const ROLE_TABS = {
  manager:         ['dashboard', 'leads', 'pipeline', 'confirmed', 'design', 'aftersales', 'calendar', 'analytics', 'users'],
  sales:           ['leads', 'pipeline', 'confirmed', 'design', 'aftersales', 'calendar'],
  designer:        ['leads', 'pipeline', 'confirmed', 'design', 'aftersales', 'calendar'],
  site_supervisor: ['confirmed', 'aftersales', 'calendar'],
};

export const EXECUTION_STAGES = [
  'Stage 4: Order & Start Production',
  'Stage 5: Shipping',
  'Stage 6: Installation',
  'Stage 7: Complete',
];

export const canViewLead = (role, lead) => {
  if (role === 'site_supervisor') return isConfirmedStage(lead.salesStage) || lead.salesStage === COMPLETE_STAGE;
  return true;
};
export const canEditLead = (role, lead) => {
  if (role === 'manager') return true;
  if (role === 'sales' || role === 'designer') return true;
  if (role === 'site_supervisor') return EXECUTION_STAGES.includes(lead.salesStage);
  return false;
};
export const canEditAfterSales = (role) => role === 'manager' || role === 'site_supervisor';
export const canAddLead        = (role) => role === 'manager' || role === 'sales' || role === 'designer';
export const canManageUsers    = (role) => role === 'manager';
export const canSeeDashboard   = (role) => role === 'manager';
export const canSeeAnalytics   = (role) => role === 'manager';

// Default seed users — manager can edit / delete / add via the Users tab.
export const DEFAULT_USERS = [
  { username: 'Wilson',     role: 'manager',         pin: '1234', email: '' },
  { username: 'Sheerly',    role: 'sales',           pin: '1234', email: '' },
  { username: 'Reina',      role: 'sales',           pin: '1234', email: '' },
  { username: 'Designer',   role: 'designer',        pin: '1234', email: '' },
  { username: 'Supervisor', role: 'site_supervisor', pin: '1234', email: '' },
];

// ---------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------
export const APPOINTMENT_TYPES = [
  { value: 'showroom',     label: 'Showroom Visit',   short: 'Showroom', color: '#A87C4F' },
  { value: 'site_visit',   label: 'Site Visit',       short: 'Site Visit', color: '#6B8E7F' },
  { value: 'installation', label: 'Installation',     short: 'Install',  color: '#3D5A4A' },
  { value: 'measurement',  label: 'Site Measurement', short: 'Measure',  color: '#B8995A' },
  { value: 'handover',     label: 'Handover',         short: 'Handover', color: '#2D4A3E' },
  { value: 'other',        label: 'Other / Meeting',  short: 'Meeting',  color: '#9A8F7E' },
];

export const getApptTypeMeta = (t) => APPOINTMENT_TYPES.find(x => x.value === t) || APPOINTMENT_TYPES[5];

// ---------------------------------------------------------------
// Design workflow (Stage 3 sub-steps)
// ---------------------------------------------------------------
export const DESIGN_STEPS = [
  { id: 'measure',  label: 'Site Measurement',         owner: 'Concept Designer',           sla: 2, slaText: '2 wd → send materials to technical designer',
    desc: 'Concept designer measures the site; within 2 working days, must hand the materials to the technical (detailing) designer.' },
  { id: 'meeting',  label: 'Concept × Technical Review', owner: 'Both Designers',           sla: 1, slaText: '1 wd',
    desc: 'After receiving materials, concept & technical designers meet to walk through everything once.' },
  { id: 'render',   label: 'Renderings (效果图)',       owner: 'Technical Designer',        slaByAmount: true, slaText: 'by quotation tier',
    desc: 'Technical designer produces the renderings. Deadline scales with quotation value.' },
  { id: 'review',   label: 'Concept Designer Review',  owner: 'Concept Designer',          sla: 1, slaText: '1 wd to review',
    desc: 'Concept designer reviews the renderings within 1 working day, then approves or requests changes.' },
  { id: 'revise',   label: 'Revisions (if major)',     owner: 'Technical Designer',        sla: 1, slaText: '1 wd to fix', optional: true,
    desc: 'If major changes are needed, technical designer fixes within 1 working day, then it goes back to review.' },
  { id: 'internal', label: 'Internal Review w/ Managers', owner: 'Concept Designer + Managers', sla: 1, slaText: 'must finish ≥2 wd before client presentation',
    desc: 'Concept designer arranges an internal review with managers within 1 working day. This must be completed at least 2 working days before presenting to the client.' },
];

export const DESIGN_STEP_MAP = Object.fromEntries(DESIGN_STEPS.map(s => [s.id, s]));

// ---------------------------------------------------------------
// Helpers / Field labels (used by the diff/audit logger)
// ---------------------------------------------------------------
export const FIELD_LABELS = {
  pic: 'PIC', clientType: 'Client Type', leadSource: 'Lead Source',
  clientName: 'Name', contactMethod: 'Contact Method', contactNo: 'Phone',
  region: 'Region', soNumber: 'SO Number', priority: 'Priority',
  salesStage: 'Stage', quotationAmount: 'Quotation', paymentInfo: 'Payment',
  clientNeeds: 'Needs', expectedDeliveryDate: 'Delivery',
  isDecisionMaker: 'Decision Maker', nextAction: 'Next Action',
  statusRemarks: 'Remarks', firstContactedDate: 'First Contact',
  homeAddress: 'Address',
};

export const AFTER_SALES_CATEGORIES = [
  'Defect / Repair', 'Warranty Claim', 'Adjustment / Tuning',
  'Missing Item', 'Customer Complaint', 'Maintenance', 'Other',
];
