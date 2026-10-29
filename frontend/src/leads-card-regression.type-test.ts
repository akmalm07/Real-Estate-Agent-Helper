import type { ReferLeadErrors } from './components/leads/types'
import type { Message } from './services/api'
import type { LeadDetailMessage } from './pages/LeadDetailPage'

type Assert<T extends true> = T
type IsAssignable<From, To> = [From] extends [To] ? true : false

type SourceIdError = Assert<IsAssignable<string, ReferLeadErrors['sourceId']>>

interface LeadDetailMessageContract {
  id: number
  conversationId: number
  direction: 'inbound' | 'outbound'
  channel: 'sms' | 'email'
  body: string | null
  sentAt: string | null
  subject?: string | null
}

type RawMessageMatchesContract = Assert<
  IsAssignable<LeadDetailMessage, LeadDetailMessageContract> extends true
    ? IsAssignable<LeadDetailMessageContract, LeadDetailMessage>
    : false
>
type RawMessageIsNotSharedMessage = Assert<IsAssignable<LeadDetailMessage, Message> extends false ? true : false>

export type LeadCardTypeRegressions = SourceIdError | RawMessageMatchesContract | RawMessageIsNotSharedMessage
