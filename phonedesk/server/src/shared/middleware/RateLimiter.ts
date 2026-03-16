import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests. Попробуйте через минуту.",
  },
});

export const mouseRateLimiter = rateLimit({
  windowMs: 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many mouse requests. Попробуйте через секунду.",
  },
});

export const noStoreApiCache = (_request: Request, response: Response, next: NextFunction): void => {
  response.setHeader("Cache-Control", "no-store");
  next();
};
