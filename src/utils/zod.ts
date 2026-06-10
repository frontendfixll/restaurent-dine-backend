import { z } from 'zod';

export const mongoId = () => z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const hhmm = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm 24h format');

export const slug = () =>
  z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits, and dashes only');

export const boolFromQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'));

export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
