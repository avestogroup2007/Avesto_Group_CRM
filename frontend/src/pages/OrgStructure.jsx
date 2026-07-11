// Экран «Оргструктура»: юрлица, филиалы и подразделения группы.
import { Building2 } from "lucide-react";
import { C } from "../lib/theme.js";
import { fmtMoney } from "../lib/format.js";
import { ORG, budgetFor } from "../lib/org.js";
import { Avatar, Badge } from "../components/ui.jsx";

/* ------------------------------ оргструктура ------------------------------- */
export function OrgStructure() {
  return (
    <div className="space-y-5">
      {ORG.companies.map((co) => (
        <div
          key={co.id}
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} color={C.brandA} />
            <h3
              className="font-extrabold"
              style={{ color: C.ink, fontSize: 18 }}
            >
              {co.name}
            </h3>
            <Badge>ИНН {co.inn}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {ORG.branches
              .filter((b) => b.companyId === co.id)
              .map((b) => {
                const staff = ORG.users
                  .filter((u) => u.branchId === b.id && u.active !== false)
                  .sort((a, z) => a.level - z.level);
                return (
                  <div
                    key={b.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "#FBFCFE",
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className="font-bold"
                        style={{ color: C.ink, fontSize: 15 }}
                      >
                        Филиал «{b.name}»
                      </div>
                      <Badge color={C.violet} bg="#F5F0FE">
                        Бюджет: {fmtMoney(budgetFor(b.id))}/мес
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {staff.length === 0 && (
                        <div style={{ fontSize: 13, color: C.faint }}>
                          Без сотрудников
                        </div>
                      )}
                      {staff.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-2.5 min-w-0"
                          style={{ paddingLeft: (u.level - 1) * 12 }}
                        >
                          <Avatar id={u.id} size={28} />
                          <div className="min-w-0">
                            <div
                              style={{
                                fontSize: 13.5,
                                color: C.ink,
                                fontWeight: 600,
                              }}
                            >
                              {u.name}
                            </div>
                            <div style={{ fontSize: 12, color: C.sub }}>
                              {u.pos}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="font-bold mb-2" style={{ color: C.ink, fontSize: 15 }}>
          Руководство (видит все филиалы)
        </div>
        <div className="flex flex-wrap gap-4">
          {ORG.users
            .filter((u) => u.branchId === null && u.active !== false)
            .map((u) => (
              <div key={u.id} className="flex items-center gap-2.5">
                <Avatar id={u.id} size={32} />
                <div>
                  <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                    {u.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub }}>{u.pos}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default OrgStructure;
