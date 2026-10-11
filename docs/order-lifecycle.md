# Order lifecycle

1. Customer adds products to the cart.
2. Customer selects a valid address and confirms checkout.
3. API validates address and serviceability.
4. Server calculates pricing and total before creating the order.
5. Server assigns the delivery slot from the authoritative scheduling service.
6. Inventory is reserved in a transactional step.
7. Order and payment records are created together.
8. Customer sees the final order and delivery time summary.
9. Staff can prepare, dispatch, and complete the order based on the delivery window.

## Status model

- PENDING
- CONFIRMED
- PREPARING
- READY_FOR_DELIVERY
- OUT_FOR_DELIVERY
- DELIVERED
- CANCELLED

Payment and delivery status remain separate so operational and revenue statuses can be analyzed independently.
