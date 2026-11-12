import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination';
import { uuidSchema } from '../../lib/validation';

export const listAuditLogsQuery = paginationSchema.extend({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(64).optional(),
  userId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
  from: z.coerce.date({ error: 'Invalid date' }).optional(),
  to: z.coerce.date({ error: 'Invalid date' }).optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuery>;
