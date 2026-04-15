import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response, Request } from "express";

/**
 * Global exception filter that ensures ALL errors returned to clients
 * have a consistent JSON shape and never leak stack traces in production.
 *
 * Response format:
 * {
 *   statusCode: 400,
 *   message: "Human-readable error",
 *   error: "Bad Request",
 *   timestamp: "2026-04-14T...",
 *   path: "/api/compras/..."
 * }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === "production";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Error interno del servidor";
    let error = "Internal Server Error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object") {
        const resp = exceptionResponse as Record<string, any>;
        // NestJS ValidationPipe returns { message: string[] }
        message = Array.isArray(resp.message) ? resp.message.join("; ") : resp.message || message;
        error = resp.error || error;
      }
    } else if (exception instanceof Error) {
      message = isProduction ? "Error interno del servidor" : exception.message;
    }

    // Log server errors with full details
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status >= 400) {
      this.logger.warn(`${request.method} ${request.url} → ${status}: ${message}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
