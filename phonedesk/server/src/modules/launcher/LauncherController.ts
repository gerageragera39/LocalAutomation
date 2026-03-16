import { Router, type NextFunction, type Request, type Response } from "express";
import { AppsService } from "../apps/AppsService";
import { LauncherService } from "./LauncherService";

const getClientIp = (request: Request): string => {
  const forwardedForHeader = request.headers["x-forwarded-for"];

  if (typeof forwardedForHeader === "string" && forwardedForHeader.length > 0) {
    const first = forwardedForHeader.split(",")[0]?.trim();

    if (first) {
      return first;
    }
  }

  return request.ip || request.socket.remoteAddress || "unknown";
};

export class LauncherController {
  constructor(
    private readonly appsService: AppsService,
    private readonly launcherService: LauncherService,
  ) {}

  public createRouter(): Router {
    const router = Router();

    router.post("/:id/launch", (request, response, next) => this.launch(request, response, next));
    router.get("/status", (request, response, next) => this.statusStream(request, response, next));

    return router;
  }

  private async launch(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const app = await this.appsService.getAppByIdOrThrow(request.params.id);
      const result = await this.launcherService.focusOrLaunch(app, getClientIp(request));
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async statusStream(_request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();

      response.write(": connected\n\n");

      await this.launcherService.addSseClient(response);

      response.on("close", () => {
        this.launcherService.removeSseClient(response);
      });
    } catch (error) {
      next(error);
    }
  }
}
