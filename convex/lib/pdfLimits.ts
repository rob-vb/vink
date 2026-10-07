// How big a PDF may be on every way in: app upload, Intake Address and public
// API. The app checks it before uploading; nginx (deploy/nginx.conf) and the
// email Worker (workers/intake-email/src/map.ts) keep their own copy of it.
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

// The refusal's text. The app translates it by this exact text
// (lib/server-errors.ts); the public API answers it as 413 file_too_large.
export const PDF_TOO_LARGE = "The PDF is larger than 10 MB.";
