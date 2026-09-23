/**
 * Standalone outbound-connectivity diagnostic.
 *
 * Isolates whether the machine's Node process can reach the internet at
 * all, independent of the app, Mongo, or the AI client. Useful when the
 * Speaking Coach (or the Hanzi lookup) reports "AI coach unavailable" /
 * fetch failed / ETIMEDOUT, to tell "your whole network is down" apart
 * from "something is blocking Node specifically" (the far more common
 * case when a browser on the same machine works fine).
 *
 * Usage:
 *   npx tsx scripts/checkNetwork.ts
 *   (or: npm run check:network, if that's wired up in package.json)
 */
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const targets = [
  { url: 'https://www.baidu.com', label: 'General internet (baidu.com)' },
  { url: 'https://dashscope.aliyuncs.com', label: 'DashScope (Qwen) AI API host — mainland Beijing region' },
  { url: 'https://cloud.mongodb.com', label: 'MongoDB Atlas (unrelated control, should always pass if you can reach Mongo)' },
];

async function check(url: string, label: string) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    console.log(`✅ ${label}\n   ${url} -> HTTP ${res.status} in ${Date.now() - start}ms\n`);
    return true;
  } catch (err: any) {
    const code = err?.cause?.code || err?.code || err?.name || 'UNKNOWN';
    console.log(`❌ ${label}\n   ${url} -> ${code}: ${err.message} (after ${Date.now() - start}ms)\n`);
    return false;
  }
}

async function main() {
  console.log('Testing outbound HTTPS connectivity from THIS Node process...\n');

  const results: boolean[] = [];
  for (const t of targets) {
    results.push(await check(t.url, t.label));
  }

  console.log('---');
  if (results.every((r) => r)) {
    console.log('All targets reachable. If the Speaking Coach still fails, check DASHSCOPE_API_KEY in .env and the server logs for the actual error.');
  } else if (results.every((r) => !r)) {
    console.log(
      'Nothing reachable from Node at all.\n' +
        'If your web browser CAN load https://dashscope.aliyuncs.com (even a 404 page counts as "reachable"),\n' +
        'then something is specifically blocking outbound connections from node.exe/tsx — not your network as a whole.\n' +
        'Most likely: Windows Firewall or antivirus blocking node.exe. Check:\n' +
        '  Windows Security -> Firewall & network protection -> Allow an app through firewall -> look for node.exe\n' +
        'Also try temporarily disabling any third-party antivirus and re-running this script.\n' +
        'If your browser ALSO cannot reach these, it is a real network/ISP/VPN block, not something this app can fix in code.'
    );
  } else {
    console.log(
      'Partial connectivity. If specifically the DashScope AI API host failed while baidu.com succeeded,\n' +
        'that host may be filtered by your network or a corporate content filter — this would be unusual, since\n' +
        'dashscope.aliyuncs.com is a normal mainland Alibaba Cloud domain.'
    );
  }
}

main();
