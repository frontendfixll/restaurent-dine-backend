import { NextFunction, Request, Response } from 'express';
import { AppError } from '@utils/AppError';
import { hasPermission, Permission } from '@modules/roles/permissions';

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    const granted = req.user.role.permissions;
    const okAll = perms.every((p) => hasPermission(granted, p));
    if (!okAll) return next(AppError.forbidden(`Missing permission: ${perms.join(', ')}`));
    next();
  };
}

export function requireAnyPermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    const granted = req.user.role.permissions;
    const okAny = perms.some((p) => hasPermission(granted, p));
    if (!okAny) return next(AppError.forbidden(`Missing permission: ${perms.join(' or ')}`));
    next();
  };
}
