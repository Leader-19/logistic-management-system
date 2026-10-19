# Hub scanning and dispatch

The Dispatch page accepts a typed tracking number or barcode scanner input. Press Enter or select **Find parcel** to perform a tenant-authenticated shipment search. The hub location is included on the tracking event when a user records **Receive at hub** or **Load for transport**.

The shipment table has row selection for shipments currently eligible for cancellation (`BOOKED`, `PICKUP_SCHEDULED`, or `DELIVERY_FAILED`). **Cancel selected** applies the regular state-machine transition to each shipment and keeps its event and audit history. At most 100 unique shipment IDs are accepted per request; IDs outside the tenant, terminal records, and other invalid transitions are reported as skipped.

## Reliability requirements

- A hub action must validate the shipment's current status and permitted next transition on the backend. Concurrent updates must not silently overwrite one another.
- Recording a shipment event and updating the shipment state must be atomic. A failed operation must not leave a partial state change.
- Event recording is append-only. Correcting an operational mistake requires a supported follow-up event or transition.
- Scanners and users may submit the same tracking number more than once. Mutating scan actions must use an idempotency key or equivalent deduplication so safe retries do not create duplicate events. Until the API provides that guarantee for an action, check the shipment history before manually repeating it after an uncertain response.
- Tenant context and permissions are checked for both lookup and mutation. A guessed tracking number or shipment ID must not expose another tenant's record.

The browser E2E suite covers parcel lookup and bulk cancellation using mocked API responses. Run it with `npm run test:e2e`.
