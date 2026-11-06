import { EvidenceUnsubscribe } from '@/components/dashboard/evidence/Preferences';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        token?: string;
    }>;
}) { return <EvidenceUnsubscribe token={(await searchParams).token || ''}/>; }
