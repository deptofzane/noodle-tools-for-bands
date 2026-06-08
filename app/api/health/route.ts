import { NextResponse } from 'next/server';
import packageJson from '../../../package.json';

/**
 * Phase 0 smoke test. Just confirms the app is up.
 *
 * v2 has no database, so there's nothing to ping here yet. In later
 * phases this can grow into a real health check (auth provider
 * reachable, Drive API up, etc.) or be split into /api/health (cheap,
 * for load balancers) and /api/ready (deeper, for ops dashboards).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    version: packageJson.version,
  });
}
