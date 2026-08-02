import type { z } from 'zod'

import type { createReservationSchema } from '../../../shared/schemas/reservation'
import type { DateRange } from '../../../shared/types/reservation'

export type CreateReservationInput = z.infer<typeof createReservationSchema> &
  DateRange
