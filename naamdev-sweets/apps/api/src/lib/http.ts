import type { Request } from "express";
import type { Query } from "firebase-admin/firestore";
import type { ZodTypeAny, z } from "zod";
import { countOf, getDocs, type WithId } from "@naamdev/db";
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

/** Slices an in-memory list into a page (used where data is filtered in memory). */
export function pageOf<T>(items: T[], page: number, pageSize: number) {
  const { skip, take } = paginate(page, pageSize);
  return { items: items.slice(skip, skip + take), meta: pageMeta(items.length, page, pageSize) };
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

/** Runs a Firestore query as a page with a total count (offset pagination — fine at this shop's scale). */
export async function pageQuery<T>(q: Query, page: number, pageSize: number): Promise<{ items: WithId<T>[]; meta: ReturnType<typeof pageMeta> }> {
  const [total, items] = await Promise.all([countOf(q), getDocs<T>(q.offset((page - 1) * pageSize).limit(pageSize))]);
  return { items, meta: pageMeta(total, page, pageSize) };
}
