import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth';
import { auditContext } from '../../lib/audit';
import { param } from '../../lib/http';
import { uuidSchema } from '../../lib/validation';
import { createUserSchema, listUsersQuery, resetPasswordSchema, updateUserSchema, userStatusSchema } from './users.schemas';
import * as usersService from './users.service';

export function usersRouter() {
  const router = Router();
  router.use(authenticate, requirePermission('users:manage'));

  router.get('/', async (req, res) => {
    res.json(await usersService.listUsers(listUsersQuery.parse(req.query)));
  });

  router.get('/:id', async (req, res) => {
    res.json({ data: await usersService.getUser(uuidSchema.parse(param(req, 'id'))) });
  });

  router.post('/', async (req, res) => {
    const user = await usersService.createUser(createUserSchema.parse(req.body), auditContext(req));
    res.status(201).json({ data: user });
  });

  router.put('/:id', async (req, res) => {
    const id = uuidSchema.parse(param(req, 'id'));
    res.json({ data: await usersService.updateUser(id, updateUserSchema.parse(req.body), auditContext(req)) });
  });

  router.patch('/:id/status', async (req, res) => {
    const id = uuidSchema.parse(param(req, 'id'));
    const { isActive } = userStatusSchema.parse(req.body);
    res.json({ data: await usersService.setUserStatus(id, isActive, auditContext(req)) });
  });

  router.post('/:id/reset-password', async (req, res) => {
    const id = uuidSchema.parse(param(req, 'id'));
    const { password } = resetPasswordSchema.parse(req.body);
    await usersService.resetPassword(id, password, auditContext(req));
    res.json({ message: 'Password has been reset. The user must sign in again.' });
  });

  return router;
}
