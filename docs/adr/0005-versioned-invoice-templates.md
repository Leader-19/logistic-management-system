# ADR 0005: Versioned tenant invoice templates

## Status

Accepted

## Decision

Invoice layouts are tenant-owned structured data with immutable versions. The editor supports bounded typography, colors, paper size, optional sections, and plain-text copy; it does not store arbitrary HTML. New invoices snapshot the chosen template version and layout so an issued financial document remains visually stable after the template changes.

Template APIs require an active tenant membership and invoice/settings permissions. Template names and IDs are tenant-scoped, changes and default selection are audited, and layout input is validated against an allowlist before storage and rendering.

## Consequences

- Each tenant can save multiple layouts and choose one default for shipment and manual invoices.
- Every edit appends a version; optimistic version checks reject stale saves.
- Existing invoices without a snapshot continue to use the standard document view.
- Rich HTML editing and external document import are outside this implementation.
