import { getSetting } from "@/lib/cms/content";
import SettingsForm from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [contactInfo, goldenTicket] = await Promise.all([
    getSetting("contactInfo"),
    getSetting("goldenTicket"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">全站設定</h1>
      <p className="text-neutral-500 text-sm mb-6">頁尾聯絡資訊、社群連結與 Golden Ticket 頻道</p>

      <div className="flex flex-col gap-6">
        <SettingsForm
          settingKey="contactInfo"
          title="聯絡資訊（頁尾）"
          initial={contactInfo}
          fields={[
            { name: "phone", label: "電話", type: "text" },
            { name: "email", label: "Email", type: "text" },
            { name: "address", label: "地址", type: "text" },
            { name: "instagram", label: "Instagram 連結", type: "text" },
            { name: "linkedin", label: "LinkedIn 連結", type: "text" },
          ]}
        />

        <SettingsForm
          settingKey="goldenTicket"
          title="Golden Ticket 頻道"
          initial={goldenTicket}
          fields={[
            { name: "channelTitle", label: "頻道標題", type: "text" },
            { name: "subscribeUrl", label: "訂閱連結（YouTube）", type: "text" },
            { name: "avatar", label: "頻道頭像", type: "image", folder: "golden-ticket" },
            { name: "clubImage", label: "Asia Founders Club 圖片", type: "image", folder: "golden-ticket" },
          ]}
        />
      </div>
    </div>
  );
}
