import { requireAdminPage } from '@/lib/auth/guard';
import EvidencePolicy from '@/components/admin/EvidencePolicy';
export default async function Page() { await requireAdminPage(); return <EvidencePolicy />; }
