import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { createLoginRateLimiter } from '../../middleware/rateLimit';
import { auditContext, AuditAction, writeAudit } from '../../lib/audit';
import { changePasswordSchema, loginSchema } from './auth.schemas';
import * as authService from './auth.service';

export function authRouter() {
  const router = Router();

  router.post('/login', createLoginRateLimiter(), async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password, auditContext(req));
    res.json(result);
  });

  router.get('/me', authenticate, async (req, res) => {
    res.json({ user: await authService.getProfile(req.user!.id) });
  });

  router.post('/logout', authenticate, async (req, res) => {
    await writeAudit(auditContext(req), { action: AuditAction.AUTH_LOGOUT, entityType: 'User', entityId: req.user!.id });
    res.status(204).end();
  });

  router.post('/change-password', authenticate, async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const result = await authService.changePassword(req.user!.id, currentPassword, newPassword, auditContext(req));
    res.json({ message: 'Password updated successfully', ...result });
  });

  return router;
}
