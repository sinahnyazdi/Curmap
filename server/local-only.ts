import type { Request, Response, NextFunction } from "express";

function clientAddress(req: Request): string {
  return req.socket.remoteAddress ?? "";
}

/** Credential endpoints are only reachable from this machine. */
export function isLocalRequest(req: Request): boolean {
  const ip = clientAddress(req);
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1")
  ) {
    return true;
  }

  const host = (req.headers.host ?? "").toLowerCase();
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function requireLocalCredentials(req: Request, res: Response, next: NextFunction) {
  if (!isLocalRequest(req)) {
    res.status(403).json({
      error: "API key management is only available when the API runs on this computer.",
    });
    return;
  }
  next();
}
