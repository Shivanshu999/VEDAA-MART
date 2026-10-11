# Delivery schedule

Vedaa Mart uses a fixed five-slot delivery schedule in Asia/Kolkata. All assignments are resolved server-side using the business timezone and not the customer browser clock.

## Slot map

- Slot 1: Order window 21:00-08:00, delivery at 08:30
- Slot 2: Order window 08:00-11:30, delivery at 12:00
- Slot 3: Order window 11:30-14:30, delivery at 15:00
- Slot 4: Order window 14:30-18:30, delivery at 19:00
- Slot 5: Order window 18:30-20:50, delivery at 21:30

The schedule is intentionally half-open:

- start time is inclusive
- end time is exclusive

This prevents overlaps and guarantees gaps remain assigned to the correct slot.

## Important cutoff behavior

Examples:

- 08:00:00 belongs to the noon slot
- 11:30:00 belongs to the 15:00 slot
- 14:30:00 belongs to the 19:00 slot
- 18:30:00 belongs to the 21:30 slot
- 20:50:00 is assigned to the next morning’s 08:30 slot
- 21:00:00 is also assigned to the next morning’s 08:30 slot

## Timezone handling

The delivery engine uses Luxon with the business timezone set to Asia/Kolkata. The order timestamp is first treated as a UTC instant and then converted to the IST business zone for assignment.

## Persistence

Each order stores:

- deliverySlotId
- scheduledDeliveryAt
- deliveryDate
- deliveryWindowLabel

This allows historical order data to retain its original slot even if the live schedule remains fixed or is later edited by an admin in a future policy revision.

## Tests

The boundary tests run from the real scheduling service and cover the required checkpoints around midnight, date changes, and timezone conversions.
