#!/usr/bin/env node
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net, { isIP } from "node:net";

const listenHost = process.env.SANDBOX_EGRESS_PROXY_HOST ?? "0.0.0.0";
const listenPort = Number(process.env.SANDBOX_EGRESS_PROXY_PORT ?? 3128);
const maxTransferBytes = Number(
  process.env.SANDBOX_EGRESS_MAX_TRANSFER_BYTES ?? 3_000_000,
);
const requestTimeoutMs = Number(
  process.env.SANDBOX_EGRESS_REQUEST_TIMEOUT_MS ?? 20_000,
);

function normalizedHost(hostname) {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function isPublicAddress(address) {
  const normalized = normalizedHost(address);
  const version = isIP(normalized);
  if (version === 4) return !isPrivateIpv4(normalized);
  if (version !== 6) return false;
  const compact = normalized.toLowerCase();
  const mappedIpv4 = compact.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return !isPrivateIpv4(mappedIpv4);
  return !(
    compact === "::" ||
    compact === "::1" ||
    compact.startsWith("fc") ||
    compact.startsWith("fd") ||
    /^fe[89ab]/.test(compact) ||
    compact.startsWith("2001:db8") ||
    compact.startsWith("ff")
  );
}

export async function resolvePublicTarget(hostname) {
  const host = normalizedHost(hostname);
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Local network destinations are blocked.");
  }
  const literalVersion = isIP(host);
  const addresses = literalVersion
    ? [{ address: host, family: literalVersion }]
    : await dns.lookup(host, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error("Local network destinations are blocked.");
  }
  return addresses[0];
}

function reject(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(message),
    "X-Content-Type-Options": "nosniff",
  });
  response.end(message);
}

function safeHeaders(headers) {
  const result = { ...headers };
  delete result["proxy-authorization"];
  delete result["proxy-connection"];
  delete result.connection;
  return result;
}

async function proxyHttpRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    reject(response, 405, "Sandbox web access only permits GET and HEAD.");
    return;
  }
  let target;
  try {
    target = new URL(request.url ?? "");
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Only HTTP and HTTPS are supported.");
    }
    const port = Number(
      target.port || (target.protocol === "https:" ? 443 : 80),
    );
    if (port !== 80 && port !== 443) {
      throw new Error("Only ports 80 and 443 are permitted.");
    }
    const resolved = await resolvePublicTarget(target.hostname);
    const transport = target.protocol === "https:" ? https : http;
    const upstream = transport.request(
      {
        host: resolved.address,
        family: resolved.family,
        port,
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: { ...safeHeaders(request.headers), host: target.host },
        servername: target.hostname,
        timeout: requestTimeoutMs,
      },
      (upstreamResponse) => {
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          safeHeaders(upstreamResponse.headers),
        );
        let transferred = 0;
        upstreamResponse.on("data", (chunk) => {
          transferred += chunk.byteLength;
          if (transferred > maxTransferBytes) {
            upstreamResponse.destroy();
            response.destroy();
          }
        });
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("timeout", () =>
      upstream.destroy(new Error("Request timed out.")),
    );
    upstream.on("error", (error) => {
      if (!response.headersSent) reject(response, 502, error.message);
      else response.destroy(error);
    });
    upstream.end();
  } catch (error) {
    reject(
      response,
      403,
      error instanceof Error ? error.message : "Request blocked.",
    );
  }
}

async function proxyConnect(request, clientSocket, head) {
  clientSocket.on("error", () => undefined);
  try {
    const target = new URL(`https://${request.url}`);
    const port = Number(target.port || 443);
    if (port !== 443) throw new Error("HTTPS tunnels are limited to port 443.");
    const resolved = await resolvePublicTarget(target.hostname);
    const upstream = net.connect({
      host: resolved.address,
      family: resolved.family,
      port,
    });
    upstream.setTimeout(requestTimeoutMs, () => upstream.destroy());
    upstream.once("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      let transferred = head.length;
      const count = (chunk) => {
        transferred += chunk.byteLength;
        if (transferred > maxTransferBytes) {
          upstream.destroy();
          clientSocket.destroy();
        }
      };
      upstream.on("data", count);
      clientSocket.on("data", count);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
  } catch (error) {
    clientSocket.end(
      `HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n${error instanceof Error ? error.message : "Request blocked."}`,
    );
  }
}

export function startEgressProxy() {
  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      reject(response, 200, "ok");
      return;
    }
    void proxyHttpRequest(request, response);
  });
  server.on("connect", (request, socket, head) => {
    void proxyConnect(request, socket, head);
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  server.listen(listenPort, listenHost);
  return server;
}

if (process.env.SANDBOX_EGRESS_PROXY_VALIDATE_ONLY !== "true") {
  startEgressProxy();
}
