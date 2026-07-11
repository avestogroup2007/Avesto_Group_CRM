// Экран «Архив задач»: завершённые заявки.
import { CheckCircle2 } from "lucide-react";
import { C } from "../lib/theme.js";
import { TZ, fmtMoney } from "../lib/format.js";
import { branchById } from "../lib/org.js";

/* -------------------------------- архив ------------------------------------ */
export function ArchiveView({ tasks, onOpen }) {
  const done = tasks
    .filter((t) => t.phase >= 5)
    .sort((a, z) => z.createdAt - a.createdAt);
  return (
    <div
      className="rounded-2xl bg-white p-3"
      style={{ border: `1px solid ${C.border}` }}
    >
      {done.length === 0 && (
        <div className="py-10 text-center" style={{ color: C.faint }}>
          В архиве пока нет завершённых задач.
        </div>
      )}
      {done.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t.id)}
          className="w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl"
          style={{ borderBottom: `1px solid ${C.line}` }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <CheckCircle2
            size={18}
            color={C.ok}
            className="shrink-0"
            style={{ marginTop: 2 }}
          />
          <div className="flex-1 min-w-0">
            <div
              className="font-semibold"
              style={{
                color: C.ink,
                fontSize: 14.5,
                overflowWrap: "break-word",
              }}
            >
              {t.title}
            </div>
            <div
              className="truncate"
              style={{ fontSize: 12.5, color: C.sub, marginTop: 1 }}
            >
              {branchById(t.branchId)?.name} • {t.cat}
              {t.amount ? ` • ${fmtMoney(t.amount)}` : ""}
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
              {new Date(t.createdAt).toLocaleDateString("ru-RU", {
                timeZone: TZ,
              })}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default ArchiveView;
