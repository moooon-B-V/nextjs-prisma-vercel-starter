// SMOKE ROUTE — placeholder.
// Proves that the (authed) route group is gated by /middleware.ts and that
// server-side getSession() returns a populated session for an authenticated
// request. Replace with your real dashboard.

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Dashboard (smoke route)</h1>
      <p>
        Signed in as <strong>{session.user.email}</strong>
      </p>
      <pre style={{ background: '#f4f4f4', padding: 12, fontSize: 12 }}>
        {JSON.stringify(session, null, 2)}
      </pre>
      <form action="/api/auth/sign-out" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
