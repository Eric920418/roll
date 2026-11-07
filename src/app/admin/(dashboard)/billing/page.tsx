import { requireAdminPage } from '@/lib/auth/guard';
import { commerceSettings } from '@/lib/billing/commerce';
import CommerceSettings from '@/components/admin/CommerceSettings';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireAdminPage(); return <CommerceSettings initial={await commerceSettings()} />; }
