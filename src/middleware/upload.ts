import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@utils/AppError';
import { config } from '@config/index';

const storage = multer.memoryStorage();

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new AppError('BAD_REQUEST', 'Only image files are allowed'));
  }
  cb(null, true);
};

const csvOrXlsxFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const ok =
    file.mimetype === 'text/csv' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    /\.(csv|xlsx|xls)$/i.test(file.originalname);
  if (!ok) return cb(new AppError('BAD_REQUEST', 'Only CSV/XLSX files are allowed'));
  cb(null, true);
};

export const uploadImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadSpreadsheet = multer({
  storage,
  fileFilter: csvOrXlsxFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function requireCloudinary(_req: Request, _res: Response, next: NextFunction) {
  if (!config.cloudinary.enabled) {
    return next(new AppError('SERVICE_UNAVAILABLE', 'Cloudinary not configured'));
  }
  next();
}
