import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '@modules/auth/token.service';
import { UserModel } from '@modules/users/user.model';
import { RoleModel } from '@modules/roles/role.model';
import { AppError } from '@utils/AppError';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: { key: string; name: string; permissions: string[] };
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw AppError.unauthorized('Invalid or expired token');
    }

    const user = await UserModel.findById(payload.sub).lean();
    if (!user || !user.isActive) throw AppError.unauthorized('Account inactive');

    const role = await RoleModel.findById(user.roleId).lean();
    if (!role) throw AppError.unauthorized('Role not found');

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: { key: role.key, name: role.name, permissions: role.permissions },
    };
    next();
  } catch (err) {
    next(err);
  }
}
