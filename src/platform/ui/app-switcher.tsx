"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/platform/ui/dropdown-menu";
import { Button } from "@/platform/ui/button";

export interface SwitcherTool {
  name: string;
  path: string;
}

/** App switcher listing the tools the signed-in user can access. */
export function AppSwitcher({ tools }: { tools: SwitcherTool[] }) {
  const pathname = usePathname();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutGrid className="size-4" />
          Apps
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {tools.map((t) => (
          <DropdownMenuItem key={t.path} asChild>
            <Link
              href={t.path}
              className={pathname?.startsWith(t.path) ? "font-semibold" : ""}
            >
              {t.name}
            </Link>
          </DropdownMenuItem>
        ))}
        {tools.length === 0 && (
          <DropdownMenuItem disabled>No accessible tools</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
