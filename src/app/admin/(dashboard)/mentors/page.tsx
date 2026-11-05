import { requireAdminPage } from "@/lib/auth/guard";
import Mentors from "@/components/admin/Mentors";
export default async function Page() { await requireAdminPage(); return <Mentors />; }
