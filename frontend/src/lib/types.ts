export type EventRow = {
  id: string
  name: string
  event_date: string | null
  location: string | null
  is_open: boolean
  /** Teto de registros; o trigger no Postgres recusa inserts além disso. */
  max_attendees: number
  created_at: string
}

/** Evento na home pública — só os campos que o anon pode ler. */
export type PublicEvent = Pick<EventRow, 'id' | 'name' | 'event_date' | 'location'>

export type EventWithCount = EventRow & {
  attendees: { count: number }[]
}

export type AttendeeRow = {
  id: string
  full_name: string
  cpf: string
  email: string
  phone: string | null
  created_at: string
}
