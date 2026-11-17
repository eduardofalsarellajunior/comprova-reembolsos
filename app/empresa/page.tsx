import { redirect } from "next/navigation";

export default function CompanyRedirect() {
  redirect("/configuracoes?secao=dados-empresa");
}
