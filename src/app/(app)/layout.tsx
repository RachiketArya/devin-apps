import { redirect } from "next/navigation";
import { getSessionUser } from "@/platform/auth";
import { authorize } from "@/platform/authz/authorize";
import { tools } from "@/platform/registry";
import { AppShell } from "@/platform/ui/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const visible = tools
    .filter((t) => authorize(user, t.viewPermission))
    .map((t) => ({ name: t.name, path: t.path }));
  return (
    <AppShell
      user={user}
      tools={visible}
      canViewApprovals={authorize(user, "approvals:view")}
      canViewAudit={authorize(user, "audit:read")}
    >
      {children}
    </AppShell>
  );
}
