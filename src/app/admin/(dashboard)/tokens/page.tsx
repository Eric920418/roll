import { requireAdminPage } from "@/lib/auth/guard";
import Tokens from "@/components/admin/Tokens";
export default async function Page() { await requireAdminPage(); return <Tokens />; }
