declare module 'react-big-calendar' {
  import type { ComponentType, CSSProperties } from 'react'

  export interface Event {
    title?: string
    start?: Date
    end?: Date
    allDay?: boolean
    resource?: unknown
  }

  export interface CalendarProps {
    localizer: unknown
    events: Event[]
    startAccessor: string
    endAccessor: string
    culture?: string
    selectable?: boolean
    style?: CSSProperties
    messages?: Record<string, string>
    eventPropGetter?: (event: Event) => { style?: CSSProperties }
    onSelectEvent?: (event: Event) => void
    onSelectSlot?: (slotInfo: { start: Date; end: Date }) => void
  }

  export const Calendar: ComponentType<CalendarProps>
  export function momentLocalizer(moment: unknown): unknown
  export function momentLocalizer(moment: unknown): unknown
  export function dateFnsLocalizer(config: {
    format: unknown
    parse: unknown
    startOfWeek: unknown
    getDay: unknown
    locales: Record<string, unknown>
  }): unknown
}

declare module 'react-big-calendar/lib/css/react-big-calendar.css'
