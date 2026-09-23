/**
 * Frontend feature flags.
 *
 * These are intentionally plain constants (not env vars) so that toggling a
 * feature is a one-line change that is visible in code review.
 *
 * NOTE: `ALLOW_SELF_REGISTRATION` only controls the *public* self-service
 * sign-up flow on the Login page. The underlying account system, the
 * `/api/auth/register` endpoint and the admin-only student creation form in
 * the Admin panel are untouched — set this back to `true` to restore the
 * "Create Account" flow.
 */
export const ALLOW_SELF_REGISTRATION: boolean = false;
