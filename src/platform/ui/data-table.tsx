"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/platform/ui/table";
import { Input } from "@/platform/ui/input";
import { Button } from "@/platform/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface Column<Row> {
  key: string;
  header: string;
  render: (row: Row) => React.ReactNode;
  /** Value used for sorting/filtering; falls back to rendered text content. */
  value?: (row: Row) => string | number;
  sortable?: boolean;
  className?: string;
}

const PAGE_SIZE = 10;

/** Shared sortable / filterable / paginated table for tool queues. */
export function DataTable<Row>({
  columns,
  rows,
  onRowClick,
  emptyLabel = "No rows",
}: {
  columns: Column<Row>[];
  rows: Row[];
  onRowClick?: (row: Row) => void;
  emptyLabel?: string;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );
  const [page, setPage] = useState(0);

  const sortable = columns.filter((c) => c.sortable !== false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter((r) =>
        columns.some((c) => {
          const v = c.value ? c.value(r) : "";
          return String(v).toLowerCase().includes(q);
        }),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.value) {
        const dir = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = col.value!(a);
          const vb = col.value!(b);
          if (typeof va === "number" && typeof vb === "number") {
            return (va - vb) * dir;
          }
          return String(va).localeCompare(String(vb)) * dir;
        });
      }
    }
    return out;
  }, [rows, filter, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageRows = filtered.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="Filter…"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setPage(0);
        }}
        className="max-w-xs"
        aria-label="Filter rows"
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.sortable !== false && c.value ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() =>
                        setSort((s) =>
                          s?.key === c.key
                            ? s.dir === "asc"
                              ? { key: c.key, dir: "desc" }
                              : null
                            : { key: c.key, dir: "asc" },
                        )
                      }
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row, i) => (
              <TableRow
                key={i}
                className={onRowClick ? "cursor-pointer" : ""}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {sortable.length > 0 && pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {current + 1} of {pages} · {filtered.length} rows
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
