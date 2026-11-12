import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toSkipTake({ page, pageSize }: Pagination) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(items: T[], total: number, { page, pageSize }: Pagination) {
  return {
    data: items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
