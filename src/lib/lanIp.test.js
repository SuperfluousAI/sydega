import { describe, it, expect } from 'vitest';
import { assignLanIps, parseCidr } from './lanIp.js';

function n(id, type, configOverrides = {}) {
  return { id, type: 'system', data: { type, config: { ...configOverrides } } };
}
function e(from, to) {
  return { id: `${from}->${to}`, source: from, target: to };
}

describe('parseCidr', () => {
  it('parses 192.168.1.0/24', () => {
    const r = parseCidr('192.168.1.0/24');
    expect(r.prefix).toBe(24);
    // Network = 192.168.1.0; broadcast = 192.168.1.255 → 256 addresses
    expect(r.broadcast - r.network).toBe(255);
  });

  it('returns null on malformed input', () => {
    expect(parseCidr('not-a-cidr')).toBeNull();
    expect(parseCidr('192.168.1.0/33')).toBeNull();
    expect(parseCidr('999.0.0.0/24')).toBeNull();
  });
});

describe('assignLanIps', () => {
  const router = n('r1', 'router', { cidr: '192.168.1.0/24' });

  it('returns an empty map when there are no routers', () => {
    const out = assignLanIps([n('p', 'phone')], []);
    expect(out.size).toBe(0);
  });

  it('assigns .1 to the router', () => {
    const out = assignLanIps([router], []);
    expect(out.get('r1').ip).toBe('192.168.1.1');
    expect(out.get('r1').cidr).toBe('192.168.1.0/24');
  });

  it('assigns an IP to a wired device, in the .2-.254 host range', () => {
    const phone = n('p', 'phone');
    const out = assignLanIps([router, phone], [e('p', 'r1')]);
    expect(out.has('p')).toBe(true);
    const ip = out.get('p').ip;
    expect(ip).toMatch(/^192\.168\.1\.\d+$/);
    const last = Number(ip.split('.').pop());
    expect(last).toBeGreaterThanOrEqual(2);
    expect(last).toBeLessThanOrEqual(254);
  });

  it('is deterministic (same input → same output)', () => {
    const phone = n('p', 'phone');
    const computer = n('c', 'computer');
    const nodes = [router, phone, computer];
    const edges = [e('p', 'r1'), e('c', 'r1')];
    const a = assignLanIps(nodes, edges);
    const b = assignLanIps(nodes, edges);
    expect(a.get('p').ip).toBe(b.get('p').ip);
    expect(a.get('c').ip).toBe(b.get('c').ip);
  });

  it('does not assign overlapping IPs within one router pool', () => {
    // Many devices wired to one router — every IP must be unique.
    const devices = Array.from({ length: 30 }, (_, i) => n(`dev-${i}`, 'phone'));
    const nodes = [router, ...devices];
    const edges = devices.map((d) => e(d.id, 'r1'));
    const out = assignLanIps(nodes, edges);
    const ips = devices.map((d) => out.get(d.id).ip);
    expect(new Set(ips).size).toBe(ips.length);
    // None of the device IPs should equal the router's .1.
    expect(ips).not.toContain('192.168.1.1');
  });

  it('treats edges as undirected for membership', () => {
    const phone = n('p', 'phone');
    // Edge points FROM router TO phone (reverse of what a player might draw);
    // membership should still hold.
    const out = assignLanIps([router, phone], [e('r1', 'p')]);
    expect(out.has('p')).toBe(true);
  });

  it('respects custom CIDR per router', () => {
    const r = n('r1', 'router', { cidr: '10.0.0.0/24' });
    const phone = n('p', 'phone');
    const out = assignLanIps([r, phone], [e('p', 'r1')]);
    expect(out.get('r1').ip).toBe('10.0.0.1');
    expect(out.get('p').ip).toMatch(/^10\.0\.0\.\d+$/);
  });

  it('gives each router its own pool (cross-router collisions OK)', () => {
    // Two routers with the same CIDR. Each has its own device. The devices
    // may share host bytes — that's correct, they're on independent subnets.
    const r1 = n('r1', 'router', { cidr: '192.168.1.0/24' });
    const r2 = n('r2', 'router', { cidr: '192.168.1.0/24' });
    const d1 = n('d1', 'phone');
    const d2 = n('d2', 'phone');
    const out = assignLanIps([r1, r2, d1, d2], [e('d1', 'r1'), e('d2', 'r2')]);
    // Both routers get .1 of their respective CIDRs (collision is fine).
    expect(out.get('r1').ip).toBe('192.168.1.1');
    expect(out.get('r2').ip).toBe('192.168.1.1');
    // Each device gets an IP within its router's pool.
    expect(out.get('d1').routerId).toBe('r1');
    expect(out.get('d2').routerId).toBe('r2');
  });

  it('skips a router whose CIDR is malformed', () => {
    const broken = n('r-bad', 'router', { cidr: 'oh no' });
    const phone = n('p', 'phone');
    const out = assignLanIps([broken, phone], [e('p', 'r-bad')]);
    expect(out.has('r-bad')).toBe(false);
  });
});
