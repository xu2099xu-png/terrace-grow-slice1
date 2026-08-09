export function clientIpTracker(request: Record<string, any>): string {
  const ip = request.ip ?? request.socket?.remoteAddress;
  return typeof ip === 'string' && ip ? ip : 'unknown';
}
