import Link from "next/link";
import { AppSwitcher, type SwitcherTool } from "@/platform/ui/app-switcher";
import { Button } from "@/platform/ui/button";
import { Badge } from "@/platform/ui/badge";
import type { SessionUser } from "@/platform/auth/types";

/**
 * Shared chrome for every tool: header with app switcher, approvals inbox,
 * audit link (permission-gated links are pre-filtered by the caller) and the
 * signed-in user.
 */
export function AppShell({
  user,
  tools,
  canViewApprovals,
  canViewAudit,
  children,
}: {
  user: SessionUser;
  tools: SwitcherTool[];
  canViewApprovals: boolean;
  canViewAudit: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="font-semibold">
            Paved Apps
          </Link>
          <AppSwitcher tools={tools} />
          <div className="ml-auto flex items-center gap-2">
            {canViewApprovals && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/approvals">Approvals</Link>
              </Button>
            )}
            {canViewAudit && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/audit">Audit</Link>
              </Button>
            )}
            <Badge variant="secondary">{user.role}</Badge>
            <span className="text-sm text-muted-foreground">{user.name}</span>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-out">Sign out</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
