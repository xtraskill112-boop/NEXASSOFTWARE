export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown, code = "BAD_REQUEST") => new AppError(400, code, message, details);
export const unauthorized = (message = "Please log in to continue") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You don't have permission to do that") => new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string, details?: unknown, code = "CONFLICT") => new AppError(409, code, message, details);
export const tooMany = (message = "Too many attempts. Please try again later.") => new AppError(429, "RATE_LIMITED", message);
export const unavailable = (message: string) => new AppError(503, "SERVICE_UNAVAILABLE", message);
export const badGateway = (message: string) => new AppError(502, "UPSTREAM_ERROR", message);
