import { SetMetadata } from "@nestjs/common";

export const SKIP_CSRF_KEY = "skipCsrf";

/**
 * Mark an endpoint or controller to bypass CSRF validation.
 * Use sparingly — only for machine-to-machine endpoints (e.g. POS webhooks).
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
