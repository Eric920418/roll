import { UnsubscribeConfirm } from "@/components/dashboard/network/NetworkPanels";
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) { return <UnsubscribeConfirm token={(await searchParams).token || ""} />; }
