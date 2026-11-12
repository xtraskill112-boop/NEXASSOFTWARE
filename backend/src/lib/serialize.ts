import type { Prisma } from '@prisma/client';

/** Converts Prisma Decimal values to plain numbers with 2 decimal precision for JSON responses. */
export function money(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value.toString()) * 100) / 100;
}
