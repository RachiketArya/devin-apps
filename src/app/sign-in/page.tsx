import { getIdentityProvider } from "@/platform/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/platform/ui/card";
import { Badge } from "@/platform/ui/badge";
import { Button } from "@/platform/ui/button";

export default async function SignInPage() {
  const provider = getIdentityProvider();
  const users = await provider.listSignInOptions();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {provider.key === "dev"
              ? "Dev provider — pick a seeded user. No password auth exists."
              : "Sign in with your organization account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{u.role}</Badge>
                <Button size="sm" asChild>
                  <a href={`/dev/sign-in?email=${encodeURIComponent(u.email)}`}>
                    Sign in
                  </a>
                </Button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sign-in options — the {provider.key} provider does not offer a
              user picker.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
