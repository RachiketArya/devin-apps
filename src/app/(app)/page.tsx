import Link from "next/link";
import { getSessionUser } from "@/platform/auth";
import { authorize } from "@/platform/authz/authorize";
import { tools } from "@/platform/registry";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/platform/ui/card";

export default async function HomePage() {
  const user = await getSessionUser();
  const visible = tools.filter((t) => authorize(user, t.viewPermission));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your tools</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => (
          <Link key={t.key} href={t.path}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle>{t.name}</CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
        {visible.length === 0 && (
          <p className="text-muted-foreground">
            No tools are available to your role.
          </p>
        )}
      </div>
    </div>
  );
}
