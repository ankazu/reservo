# ADR 0003: Availability search failure policy

- Status: accepted
- Date: 2026-08-04

## Decision

The MVP searches all configured room types for a stay. A room type response
with `available: false` is a successful business result and remains part of the
search result. If any room type availability request rejects, the complete
search fails and no partial room list is shown.

## Rationale

An unavailable room type is expected inventory behavior, such as a capacity
limit or sold-out night. A rejected request indicates that the result for that
room type is unknown. Showing the other rooms without clearly modeling an
incomplete result could make the search appear complete when it is not.

## Consequences

The client uses an all-or-nothing request aggregation policy and asks the guest
to retry when an availability request fails. The policy can be revisited when
the product introduces an explicit partial-results state or independent
availability services.
