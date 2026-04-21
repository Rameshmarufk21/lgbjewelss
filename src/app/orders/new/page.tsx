import { redirect } from "next/navigation";

export default function NewOrderRedirectPage() {
  redirect("/?action=new");
}
