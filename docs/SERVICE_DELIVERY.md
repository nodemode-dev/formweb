# Signed form delivery

Configure delivery separately from the portable site document. POST /api/delivery/config accepts a site ID and at most 32 endpoints. Each endpoint has a stable id, URL, secretEnv, optional formId and enabled flag. GET /api/delivery/config reports configuration and whether the environment signing secret exists; it never returns the secret value.

The server administrator sets FORMWEB_WEBHOOK_HOSTS to exact approved hostnames and supplies each referenced FORMWEB_ environment variable with a signing secret at least 16 characters long. Production endpoints require HTTPS on port 443. FORMWEB_ALLOW_LOCAL_WEBHOOKS=1 permits explicitly configured loopback fixtures. URL credentials, query strings and fragments are rejected. Resolved addresses are checked and the connection is pinned to a permitted address while retaining the original hostname for TLS certificate verification.

Accepted forms create durable SQLite jobs. Payload JSON is UTF-8 and contains event `form.submitted` and the stored submission. Headers are X-FormWeb-Delivery, X-FormWeb-Timestamp and X-FormWeb-Signature. The signature is `sha256=` followed by the hexadecimal HMAC-SHA256 of `[timestamp].[delivery-id].[exact-body-bytes]`. Receivers should compare signatures in constant time, reject old timestamps and deduplicate the stable delivery ID. This is the FormWeb signing format, not a claim of compatibility with another vendor's header format.

The worker records attempts, HTTP status and bounded diagnostic messages. Success requires a 2xx response. Most 4xx responses stop automatic retry; 408 and 429 remain retryable. Transient failures retry with exponential delay, at most eight automatic attempts. Explicit retry retains history. Missing signing secrets block the job. Startup requeues interrupted inflight jobs. Delivery is at least once, so a receiver must deduplicate. GET /api/delivery reports jobs and history; POST /api/delivery/[job-id]/retry queues an eligible job.

A configured webhook that is unavailable cannot turn a stored submission into a fabricated delivery success. Submission intake and remote delivery have separate status. Queue retention is bounded at 100,000 jobs and reports when no new jobs can be accepted. Form retention also deletes corresponding delivery bodies and attempts, including queued or interrupted jobs. An already initiated network request cannot be recalled; its completion cannot recreate the deleted local job or attempt history.

## Observed verification

A real loopback HTTP receiver returned 500 once and 204 on retry. All three observed requests, including an interrupted job recovered after restart, had valid signatures. Duplicate enqueue returned the same job. This verifies local transport, persistence and signing; no external endpoint was contacted.

## Primary references

- [Python HTTP client documentation](https://docs.python.org/3/library/http.client.html), fetched 2026-10-10: connection, bounded reads and HTTPS certificate/hostname checking. API-specific evidence comes from the Python project only.
- [RFC 2104](https://www.rfc-editor.org/info/rfc2104/), fetched 2026-10-10: keyed HMAC construction.
- [GitHub validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), fetched 2026-10-10: HMAC-SHA256 body signing and constant-time verification. These independent organizations corroborate the common signing category; they do not document FormWeb's custom wire format.
