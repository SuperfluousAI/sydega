// LAN IP assignment for routers and the devices wired to them.
//
// Deterministic — same (nodes, edges) input always yields the same IPs. This
// matters because:
//   - Tests need stable expectations.
//   - The UI rerenders constantly; we don't want IPs flickering on every render.
//
// Each router is its own subnet. The router occupies the .1 of its CIDR;
// devices wired to the router get host IPs in the .2-.254 range. Different
// routers can issue the same host IP (correct — they're separate subnets,
// just like two home routers can both have a 192.168.1.42 device).
//
// We treat the LAN edge as undirected for membership purposes: a device is
// "on" a router's LAN if there's an edge between them in either direction.

const DEFAULT_CIDR = '192.168.1.0/24';

export function assignLanIps(nodes, edges) {
  const result = new Map();
  const routers = nodes.filter((n) => n.data?.type === 'router');
  if (routers.length === 0) return result;

  const adjacency = buildUndirectedAdjacency(nodes, edges);

  for (const router of routers) {
    const cidr = router.data?.config?.cidr || DEFAULT_CIDR;
    const parsed = parseCidr(cidr);
    if (!parsed) continue; // malformed CIDR: skip this router silently

    // Router takes the .1 of its network.
    const routerIp = ipToString(parsed.network + 1);
    result.set(router.id, { ip: routerIp, cidr, routerId: router.id });

    // Walk the host range, assigning IPs to wired devices via stable hashing
    // with linear probe. The .1 is reserved for the router; .0 is the network
    // address; the broadcast (last host) is reserved too.
    const hostMin = parsed.network + 2;
    const hostMax = parsed.broadcast - 1;
    const hostCount = hostMax - hostMin + 1;
    if (hostCount <= 0) continue;

    const claimed = new Set();
    const connectedDeviceIds = (adjacency.get(router.id) || []).filter((id) => {
      const n = nodes.find((x) => x.id === id);
      // Only assign IPs to "devices" — anything that isn't a router and isn't
      // an ISP. ISPs are upstream of the LAN (Router's WAN port wires to them);
      // they have their own public IP block, not a LAN IP. Two routers
      // connected to each other do exist (uplinks); we don't model that here.
      return n && n.data?.type !== 'router' && n.data?.type !== 'isp';
    });

    // Sort by id for deterministic probe order. Without this, a hash collision
    // resolves based on traversal order, which depends on edge insertion order.
    connectedDeviceIds.sort();

    for (const devId of connectedDeviceIds) {
      let offset = stableHash(devId) % hostCount;
      // Linear-probe past any device that already claimed this slot.
      for (let i = 0; i < hostCount; i++) {
        const candidate = hostMin + ((offset + i) % hostCount);
        if (!claimed.has(candidate)) {
          claimed.add(candidate);
          result.set(devId, {
            ip: ipToString(candidate),
            cidr,
            routerId: router.id,
          });
          break;
        }
      }
    }
  }

  return result;
}

function buildUndirectedAdjacency(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  }
  return adj;
}

// Returns { network, broadcast } as 32-bit ints, or null on malformed input.
export function parseCidr(cidr) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr);
  if (!m) return null;
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return null;
  const prefix = Number(m[5]);
  if (prefix < 0 || prefix > 32) return null;
  const ip = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { network, broadcast, prefix };
}

function ipToString(int) {
  return [
    (int >>> 24) & 0xff,
    (int >>> 16) & 0xff,
    (int >>> 8) & 0xff,
    int & 0xff,
  ].join('.');
}

// Deterministic 32-bit string hash (FNV-1a variant). We don't need crypto;
// we just need stability + reasonable spread across the host byte range.
function stableHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
