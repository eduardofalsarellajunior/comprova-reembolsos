import { redirect } from "next/navigation";

const authCallbackParams = ["code", "error", "error_code", "error_description", "type", "token_hash"];

export default async function HomePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callback = new URLSearchParams();
  for (const key of authCallbackParams) {
    if (typeof params[key] === "string") callback.set(key, params[key]);
  }
  redirect(callback.size ? `/relatorios?${callback}` : "/relatorios");
}
