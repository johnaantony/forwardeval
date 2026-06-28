import { useMemo, useState } from "react";
import type { RunResult, TaskResult } from "../types";
import { Card, PassPill, Tag } from "../ui";
import { FAILURE_LABELS, fmtCost, fmtTokens } from "../lib";
import type { FailureTagName } from "../types";
import { TranscriptViewer } from "./TranscriptViewer";

type SortKey = "id" | "category" | "difficulty" | "passed" | "turnsUsed" | "tokens";

export function TaskExplorer({ run }: { run: RunResult }) {
  const [selected, setSelected] = useState<TaskResult | null>(null);
  const [sort, setSort] = useState<SortKey>("passed");
  const [asc, setAsc] = useState(true);
  const [filter, setFilter] = useState<"all" | "pass" | "fail">("all");

  const rows = useMemo(() => {
    let r = [...run.tasks];
    if (filter !== "all") r = r.filter((t) => (filter === "pass" ? t.passed : !t.passed));
    r.sort((a, b) => {
      const dir = asc ? 1 : -1;
      switch (sort) {
        case "tokens":
          return (a.tokens.total - b.tokens.total) * dir;
        case "turnsUsed":
          return (a.turnsUsed - b.turnsUsed) * dir;
        case "passed":
          return (Number(a.passed) - Number(b.passed)) * dir;
        default:
          return String(a[sort]).localeCompare(String(b[sort])) * dir;
      }
    });
    return r;
  }, [run, sort, asc, filter]);

  const head = (key: SortKey, label: string) => (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left font-medium hover:text-white"
      onClick={() => (sort === key ? setAsc(!asc) : (setSort(key), setAsc(true)))}
    >
      {label} {sort === key ? (asc ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-600 px-3 py-2 text-xs text-slate-400">
        <span>{rows.length} tasks · click a row for the turn-by-turn transcript</span>
        <div className="flex gap-1">
          {(["all", "pass", "fail"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 capitalize ${filter === f ? "bg-ink-600 text-white" : "hover:bg-ink-700"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-ink-800 text-xs text-slate-400">
          <tr>
            {head("passed", "Result")}
            {head("id", "Task")}
            {head("category", "Category")}
            {head("difficulty", "Difficulty")}
            {head("turnsUsed", "Turns")}
            {head("tokens", "Tokens")}
            <th className="px-3 py-2 text-left font-medium">Cost</th>
            <th className="px-3 py-2 text-left font-medium">Failure tags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              onClick={() => setSelected(t)}
              className="cursor-pointer border-t border-ink-700 hover:bg-ink-700/50"
            >
              <td className="px-3 py-2"><PassPill passed={t.passed} /></td>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-100">{t.title}</div>
                <div className="font-mono text-[11px] text-slate-500">{t.id}</div>
              </td>
              <td className="px-3 py-2 text-slate-300">{t.category.replace("_", " ")}</td>
              <td className="px-3 py-2 text-slate-300">{t.difficulty}</td>
              <td className="px-3 py-2 tabular-nums text-slate-300">{t.turnsUsed}</td>
              <td className="px-3 py-2 tabular-nums text-slate-300">{fmtTokens(t.tokens.total)}</td>
              <td className="px-3 py-2 tabular-nums text-slate-300">{fmtCost(t.cost)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {t.failureTags.map((ft, i) => (
                    <Tag key={i} tone="fail">{FAILURE_LABELS[ft.tag as FailureTagName] ?? ft.tag}</Tag>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && <TranscriptViewer task={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}
