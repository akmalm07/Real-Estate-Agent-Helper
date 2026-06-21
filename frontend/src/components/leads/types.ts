import type { Lead as ApiLead } from '../../services/api'
import type { LeadSortKey } from './LeadFormShared'

export interface Lead extends ApiLead {
  propertyId?: number | null
}

export type MessageMode = 'ai' | 'manual' | 'none'
export type { LeadSortKey }

export interface ReferLeadFormData {
  name: string
  email: string
  phone: string
  source: 'zillow' | 'realtor' | 'referral' | 'unknown' | ''
  sourceId: string
  propertyId: string
  notes: string
  messageMode: MessageMode
  smsMessage: string
  emailSubject: string
  emailBody: string
}

export interface ReferLeadErrors {
  name?: string
  email?: string
  contact?: string
  smsMessage?: string
  emailSubject?: string
  emailBody?: string
  general?: string
}

export interface VerifyLeadErrors {
  smsMessage?: string
  emailSubject?: string
  emailBody?: string
  general?: string
}

export const EMPTY_REFER_FORM: ReferLeadFormData = {
  name:         '',
  email:        '',
  phone:        '',
  source:       'referral',
  sourceId:     '',
  propertyId:   '',
  notes:        '',
  messageMode:  'ai',
  smsMessage:   '',
  emailSubject: '',
  emailBody:    '',
}

export function leadToForm(lead: Lead): ReferLeadFormData {
  return {
    name:         lead.name    ?? '',
    email:        lead.email   ?? '',
    phone:        lead.phone   ?? '',
    source:       (lead.source ?? 'referral') as ReferLeadFormData['source'],
    sourceId:     '',
    propertyId:   lead.propertyId ? String(lead.propertyId) : '',
    notes:        '',
    messageMode:  'ai',
    smsMessage:   '',
    emailSubject: '',
    emailBody:    '',
  }
}
