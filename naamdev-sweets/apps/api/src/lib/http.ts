import type { Request } from "express";
import type { ZodTypeAny, z } from "zod";
import { badRequest } from "./errors";

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = r.error.issues[0];
    throw badRequest(first ? `${first.path.length ? first.path.join(".") + ": " : ""}${first.message}` : "Invalid input", { fields }, "VALIDATION_ERROR");
  }
  return r.data;
}

export const body = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => parse(schema, req.body ?? {});
export const query = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => parse(schema, req.query ?? {});

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const param = (req: Request, name: string): string => {
  const v = req.params[name];
  if (typeof v !== "string" || !v || v.length > 100) throw badRequest(`Invalid ${name}`);
  return v;
};

export function clientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}
