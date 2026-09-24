# Changelog

## 0.3.0 - 2026-09-24

- Add an activity date range filter to Conversation "Get Many" (`last_activity_at`).
- Support relative (days ago) and absolute (datetime) ranges without a manual Code node.
- Reject a null `payload.webhook` in webhook unwrapping instead of returning the wrapper object.

## 0.2.0 - 2026-08-19

- Add the Chatwoot action node with 75 operations across eight resources.
- Add contact create, exact find, search, update, upsert, block, inbox, merge, label, and attribute actions.
- Add conversation creation, filters, status, priority, assignments, labels, attributes, mute, read state, and deletion.
- Add outgoing messages, private notes, incoming API-inbox messages, WhatsApp templates, delivery status, and deletion.
- Add CRUD actions for custom attribute definitions, labels, agents, teams, team members, and common inbox settings.
- Add dynamic dropdowns for inboxes, labels, agents, teams, and typed custom attributes.
- Preserve labels and attributes by reading and merging before Chatwoot endpoints that replace full collections.
- Add optional raw responses and resolved API-call traces without credentials.
- Expand automated coverage to every published action.

## 0.1.0 - 2026-08-19

- Add the reusable Chatwoot API credential.
- Add Chatwoot Trigger with ten webhook events.
- Add automatic, isolated webhook creation, reconciliation, and cleanup.
- Add normalized output while preserving the original payload in `raw`.
- Add HMAC-SHA256 verification for Chatwoot versions that expose a webhook secret.
