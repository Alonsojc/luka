import { Logger } from "@nestjs/common";

interface EnvVar {
  key: string;
  required: boolean;
  description: string;
  default?: string;
}

const ENV_SCHEMA: EnvVar[] = [
  { key: "DATABASE_URL", required: true, description: "PostgreSQL connection string" },
  {
    key: "JWT_SECRET",
    required: true,
    description: "Secret for signing access tokens (min 32 chars)",
  },
  {
    key: "JWT_REFRESH_SECRET",
    required: true,
    description: "Secret for signing refresh tokens (min 32 chars)",
  },
  {
    key: "JWT_EXPIRATION",
    required: false,
    description: "Access token expiration",
    default: "20h",
  },
  {
    key: "JWT_REFRESH_EXPIRATION",
    required: false,
    description: "Refresh token expiration",
    default: "7d",
  },
  {
    key: "WEB_URL",
    required: false,
    description: "Frontend URL for CORS",
    default: "http://localhost:3002",
  },
  { key: "API_PORT", required: false, description: "API server port", default: "3001" },
  { key: "SMTP_HOST", required: false, description: "SMTP server host" },
  { key: "SMTP_USER", required: false, description: "SMTP auth user" },
  { key: "SMTP_PASS", required: false, description: "SMTP auth password" },
  { key: "CORNTECH_API_KEY", required: false, description: "API key for Corntech POS integration" },
  {
    key: "PAC_PROVIDER",
    required: false,
    description: "PAC provider (sandbox|finkok|sw)",
    default: "sandbox",
  },
];

export function validateEnvironment(): void {
  const logger = new Logger("EnvValidation");
  const isProduction = process.env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_SCHEMA) {
    const value = process.env[v.key];

    if (!value && v.required) {
      errors.push(`${v.key} is required — ${v.description}`);
    } else if (!value && v.default) {
      process.env[v.key] = v.default;
    }
  }

  // Production-specific checks
  if (isProduction) {
    const jwtSecret = process.env.JWT_SECRET || "";
    const jwtRefresh = process.env.JWT_REFRESH_SECRET || "";

    if (jwtSecret.length < 32) {
      errors.push("JWT_SECRET must be at least 32 characters in production");
    }
    if (jwtRefresh.length < 32) {
      errors.push("JWT_REFRESH_SECRET must be at least 32 characters in production");
    }
    if (jwtSecret.includes("dev-") || jwtSecret.includes("change-me")) {
      errors.push("JWT_SECRET contains development placeholder — set a real secret");
    }
    if (jwtRefresh.includes("dev-") || jwtRefresh.includes("change-me")) {
      errors.push("JWT_REFRESH_SECRET contains development placeholder — set a real secret");
    }

    if (!process.env.CORNTECH_API_KEY) {
      warnings.push("CORNTECH_API_KEY not set — POS API endpoints will reject all requests");
    }
    if (!process.env.SMTP_HOST) {
      warnings.push("SMTP_HOST not set — emails will be logged but not sent");
    }
  }

  for (const w of warnings) {
    logger.warn(`⚠ ${w}`);
  }

  if (errors.length > 0) {
    for (const e of errors) {
      logger.error(`✗ ${e}`);
    }
    if (isProduction) {
      throw new Error(
        `Environment validation failed with ${errors.length} error(s). Fix the above issues before starting in production.`,
      );
    } else {
      logger.warn(`${errors.length} env validation error(s) found — allowed in development mode`);
    }
  } else {
    logger.log("Environment validation passed");
  }
}
