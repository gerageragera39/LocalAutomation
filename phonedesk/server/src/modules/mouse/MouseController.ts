import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { AppError } from "../../shared/errors/AppError";
import { mouseRateLimiter } from "../../shared/middleware/RateLimiter";
import type { MouseClickPayload, MouseMovePayload, MouseScrollPayload } from "./MouseTypes";
import { MouseService } from "./MouseService";

const moveSchema = z.object({
  dx: z.number().finite(),
  dy: z.number().finite(),
});

const clickSchema = z.object({
  button: z.enum(["left", "right"]),
});

const scrollSchema = z.object({
  dy: z.number().finite(),
});

export class MouseController {
  constructor(private readonly mouseService: MouseService) {}

  public createRouter(): Router {
    const router = Router();

    router.use(mouseRateLimiter);
    router.post("/move", (request, response, next) => this.move(request, response, next));
    router.post("/click", (request, response, next) => this.click(request, response, next));
    router.post("/scroll", (request, response, next) => this.scroll(request, response, next));

    return router;
  }

  private async move(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const payload = moveSchema.parse(request.body) as MouseMovePayload;
      const result = await this.mouseService.move(payload.dx, payload.dy);

      if (!result.success) {
        throw new AppError(
          result.message ?? "Mouse move failed",
          result.statusCode ?? 500,
          "MOUSE_MOVE_FAILED",
        );
      }

      response.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  private async click(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const payload = clickSchema.parse(request.body) as MouseClickPayload;
      const result = await this.mouseService.click(payload.button);

      if (!result.success) {
        throw new AppError(
          result.message ?? "Mouse click failed",
          result.statusCode ?? 500,
          "MOUSE_CLICK_FAILED",
        );
      }

      response.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  private async scroll(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const payload = scrollSchema.parse(request.body) as MouseScrollPayload;
      const result = await this.mouseService.scroll(payload.dy);

      if (!result.success) {
        throw new AppError(
          result.message ?? "Mouse scroll failed",
          result.statusCode ?? 500,
          "MOUSE_SCROLL_FAILED",
        );
      }

      response.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
