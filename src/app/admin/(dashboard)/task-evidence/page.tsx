import { requireAdminPage } from "@/lib/auth/guard";
import TaskEvidence from "@/components/admin/TaskEvidence";
export default async function Page() { await requireAdminPage(); return <TaskEvidence />; }
