import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

/** Forwards rejected promises to the central error handler (Express 4 does not do this itself). */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid 24-character id');

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const buildMeta = (page: number, limit: number, total: number): PageMeta => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
