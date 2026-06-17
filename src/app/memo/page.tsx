import { redirect } from "next/navigation";

export default function MemoRedirectPage() {
  redirect("/?action=memo");
}
