// Server-only (node:os). The laptop's IPv4 addresses that phones on the same
// network could reach, private LAN ranges first.
//
// Skipped: 192.0.0.x is the fake IPv4 a Mac gets on an IPv6-only iPhone
// hotspot (clat46); nothing can connect to it. 169.254.x.x is link-local.

import { networkInterfaces } from "node:os";

function isPrivate(address: string) {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

export function lanAddresses(): string[] {
  const usable = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === "IPv4" && !net.internal)
    .map((net) => net!.address)
    .filter((address) => !address.startsWith("192.0.0.") && !address.startsWith("169.254."));
  return [...usable.filter(isPrivate), ...usable.filter((a) => !isPrivate(a))];
}
