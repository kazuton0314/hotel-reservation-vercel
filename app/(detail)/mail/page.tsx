import { redirect } from "next/navigation";

export default function MailTemplatesLegacyRedirect() {
  redirect("/settings/mail");
}
