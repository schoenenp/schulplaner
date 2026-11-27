import { redirect } from "next/navigation";

export default function PartnerPreviewPage() {
  redirect("/dashboard?view=planer");
}
