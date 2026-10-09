import { z } from 'zod';

const blankToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Optional trimmed text; blank strings become null. */
export const optText = (max = 2000) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Must be at most ${max} characters`).optional().nullable())
    .transform((v) => v ?? null);

/** Required trimmed text. */
export const reqText = (label, max = 255) =>
  z.string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const isoDate = (label) =>
  z.string({ required_error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} must be a valid date`);

export const optDate = (label) =>
  z.preprocess(blankToUndefined, isoDate(label).optional().nullable()).transform((v) => v ?? null);

export const money = (label, { min = 0, positive = false } = {}) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : Number(v.replace(/,/g, ''))) : v),
    z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
      .finite(`${label} must be a number`)
      .refine((n) => (positive ? n > 0 : n >= min), positive ? `${label} must be greater than 0` : `${label} cannot be negative`)
      .refine((n) => n < 1e12, `${label} is too large`),
  );

export const optId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined || v === 'null' ? null : Number(v)),
  z.number().int().positive().nullable(),
);

export const phone = z.string().trim().regex(/^\+?[0-9\s\-()]{7,20}$/, 'Enter a valid phone number');

export const optEmail = z.preprocess(blankToUndefined, z.string().trim().email('Enter a valid email address').optional().nullable())
  .transform((v) => v ?? null);

export const idParam = (req, name = 'id') => {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
  return id;
};

/** Escape LIKE wildcards in user search input. */
export const likeTerm = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
