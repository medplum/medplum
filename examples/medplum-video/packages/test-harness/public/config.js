// Default runtime config (dev).  Overridden at container startup by
// infrastructure/test-harness/entrypoint.sh which templates env vars into
// this file before nginx starts serving it.
//
// Setting any field here to an empty string falls back to the Vite
// import.meta.env.VITE_* values loaded from .env at build time.
window.__MEDPLUM_VIDEO_CONFIG__ = {};
