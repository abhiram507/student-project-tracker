import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session-cookie";

export default async function Home() {
  redirect((await getSession()) ? "/dashboard" : "/login");
}
