import { lookup } from "node:dns";
import { isIP, BlockList } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

const blocked = new BlockList();
const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blockedV6.addSubnet(address, prefix, "ipv6");
export function isBlockedAddress(address: string) {
  const family = isIP(address);
  return (
    !family ||
    (family === 4
      ? blocked.check(address, "ipv4")
      : blockedV6.check(address, "ipv6"))
  );
}
function trustedOrigin(url: URL) {
  return (process.env.MCP_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(url.origin);
}
export function assertMcpUrl(value: string | URL) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && trustedOrigin(url)))
  )
    throw new Error("MCP_URL_NOT_ALLOWED");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) && isBlockedAddress(hostname) && !trustedOrigin(url))
    throw new Error("MCP_URL_NOT_ALLOWED");
  return url;
}
// Validate at socket lookup, not before fetch: prevents DNS rebinding between checks.
const publicAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error, []);
        if (
          !addresses.length ||
          addresses.some((a) => isBlockedAddress(a.address))
        )
          return callback(new Error("MCP_URL_NOT_ALLOWED"), []);
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      });
    },
  },
});
const trustedAgent = new Agent();
export const mcpFetch: FetchLike = async (input, init) => {
  const url = assertMcpUrl(
    input instanceof Request ? input.url : String(input),
  );
  const response = await undiciFetch(url, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: trustedOrigin(url) ? trustedAgent : publicAgent,
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("MCP_REDIRECT_NOT_ALLOWED");
  }
  const result = new Response(
    response.body as ReadableStream<Uint8Array> | null,
    {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    },
  );
  Object.defineProperty(result, "url", { value: url.href });
  return result;
};
export const oauthFetch: FetchLike = (input, init) =>
  mcpFetch(input, {
    ...init,
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
