import dns from 'node:dns';
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import { env } from './env.ts';

/**
 * Node's global fetch (used by the `openai` client talking to DashScope,
 * and anything else calling fetch()) does NOT automatically honor
 * HTTP_PROXY/HTTPS_PROXY the way
 * browsers do, and its default connect timeout is short. On networks that
 * require a proxy, or that have flaky/filtered routes to Google's IPs,
 * this shows up as `TypeError: fetch failed` / `ConnectTimeoutError`.
 *
 * This module fixes both:
 *  1. If HTTPS_PROXY/HTTP_PROXY is set, route all outbound fetch() calls
 *     through it.
 *  2. Otherwise, use a longer connect timeout so slow networks get a fair
 *     chance instead of failing after ~10s.
 * It also prefers IPv4 first, since some Windows/VPN setups have broken
 * or filtered IPv6 routes that make dual-stack connection attempts hang.
 *
 * Import this once, before anything that might call fetch (server.ts does
 * this at the very top).
 */
export function configureNetwork() {
  dns.setDefaultResultOrder('ipv4first');

  if (env.httpsProxy) {
    setGlobalDispatcher(new ProxyAgent(env.httpsProxy));
    console.log(`[network] Outbound HTTPS requests routed through proxy: ${env.httpsProxy}`);
    return;
  }

  setGlobalDispatcher(
    new Agent({
      connect: { timeout: 30_000 },
      keepAliveTimeout: 15_000,
      headersTimeout: 30_000,
      bodyTimeout: 30_000,
    })
  );
}
