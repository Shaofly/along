import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";

import { db } from "@/db";
import { user } from "@/db/schema";

import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [{ total }] = await db.select({ total: count() }).from(user);

  if (total >= 2) {
    redirect("/");
  }

  return (
    <main className="setup-shell">
      <section className="setup-panel">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">心</span>
          <span>小小朋友圈</span>
        </Link>
        <div className="auth-heading">
          <span>首次部署</span>
          <h1>先创建两位创始成员</h1>
          <p>
            邀请制度需要至少两位朋友共同确认，因此平台第一次启动时，
            由服务器管理者创建最初的两位成员。第一位自动成为管理员，
            第二位是普通创始成员，两人会自动成为朋友。
          </p>
        </div>
        <SetupForm existingCount={total} />
      </section>
    </main>
  );
}
