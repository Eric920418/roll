import { notFound } from 'next/navigation';
import { NewsletterAction } from '@/components/sections/product/Newsletter';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ params, searchParams }: {
    params: Promise<{
        action: string;
    }>;
    searchParams: Promise<{
        token?: string;
    }>;
}) {
    const { action } = await params;
    if (action !== 'confirm' && action !== 'unsubscribe')
        notFound();
    return <NewsletterAction action={action} token={(await searchParams).token || ''}/>;
}
