import { redirect } from "next/navigation";

export default function NuevaRequisicionPage() {
  redirect("/requisiciones?crear=1");
}
