import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  // Decision 46 (plan U2): Items is Stock and Team is Teams and Reps. Old links answer 308 to the new
  // paths; Next passes the query string through (node_modules/next/dist/docs/01-app/03-api-reference/
  // 05-config/01-next-config-js/redirects.md). Tested in src/app/rep/redirects.test.ts and e2e/frames-shell.spec.ts.
  redirects() {
    return [
      { source: '/rep/items', destination: '/rep/stock', permanent: true },
      { source: '/rep/items/:path*', destination: '/rep/stock/:path*', permanent: true },
      { source: '/rep/team', destination: '/rep/teams', permanent: true },
    ];
  },
};
export default config;
