import type {Metadata} from 'next';
import {cookies} from 'next/headers';
import {notFound} from 'next/navigation';
import {repAccess} from '@/server/rep/access';
import {tablePrefs} from '@/server/repository';
import {COOKIE,principalFromCookie} from '@/server/session';
import {UiFixture} from './UiFixture';

// Test tooling, not a product page (plan U0; listed under "No frame" in docs/plans/status.md): renders
// the new UI's tokens and primitives so e2e/frames-primitives.spec.ts can compare their computed styles
// with the canvas frames. It exists only when the server runs with QUERENT_E2E_RESET=1, like
// /api/test/*. A signed-in rep gets their saved "fixture-quotes" table prefs, and changes are saved.
// TODO(R-6): guard test-only routes more strictly before deployment.

export const metadata:Metadata={title:'UI primitives',robots:{index:false}};

const FIXTURE_TABLE='fixture-quotes';

export default async function UiFixturePage(){
  const user=principalFromCookie((await cookies()).get(COOKIE)?.value);
  if(process.env.QUERENT_E2E_RESET!=='1')notFound();
  const access=repAccess(user);
  return <UiFixture tableId={FIXTURE_TABLE} prefs={access.ok?tablePrefs(access.repId,FIXTURE_TABLE):null} persist={access.ok}/>;
}
