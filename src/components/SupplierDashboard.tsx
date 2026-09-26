"use client";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  SlidersHorizontal,
  Database,
  Plug,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import type { API, Customer, Dashboard, Principal } from "@/lib/contracts";
import { initials } from "@/lib/initials";
import { usePoll } from "@/lib/use-poll";
import { Analytics } from "@/features/analytics/Analytics";
import { AccessSwitches } from "@/features/access/Access";
import { DataBrowser } from "@/features/data-browser/DataBrowser";
import { DataSources, ERPIndicator } from "@/features/erp-status/Status";
// Rep assignments is hidden until task 6.1 rebuilds it as one rep per customer.
const navigation = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "access", label: "Customer access", icon: SlidersHorizontal },
  { id: "data", label: "Data browser", icon: Database },
  { id: "sources", label: "Data sources", icon: Plug },
];
const descriptions: Record<string, string> = {
  overview: "A clearer view of your customer conversations.",
  access: "You decide what your customers can see.",
  data: "Your customer records, in one place.",
  sources: "Keep an eye on your ERP connection.",
};
export function SupplierDashboard({
  api,
  user,
  signOut,
}: {
  api: API;
  user: Principal;
  signOut: () => void;
}) {
  const [scope, setScope] = useState("all"),
    [section, setSection] = useState("overview"),
    [customers, setCustomers] = useState<Customer[]>([]),
    [error, setError] = useState("");
  const load = useCallback(
    () => api.get<Dashboard>(`supplier/dashboard/${scope}`),
    [api, scope],
  );
  const { data, error: loadError, refresh } = usePoll(load);
  useEffect(() => {
    let active = true;
    api
      .get<Customer[]>("supplier/customers")
      .then((c) => {
        if (active) setCustomers(c);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [api]);
  return (
    <div className="supplier-shell">
      <aside className="supplier-sidebar">
        <a className="wordmark" href="/">
          <img src="/querent-logo.png" alt="" width="36" height="36" />
          <span>Querent</span>
        </a>
        <div className="workspace-label">
          <p className="eyebrow">WORKSPACE</p>
          <strong>Herrick Industrial Supply</strong>
          <span>Supplier console</span>
        </div>
        <nav aria-label="Supplier navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={section === id ? "active" : ""}
              onClick={() => setSection(id)}
              key={id}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="initials">{initials(user.user_name)}</div>
          <div>
            <strong>{user.user_name}</strong>
            <small>{user.name}</small>
          </div>
          <button className="workspace-switch compact" aria-label="Switch workspace" onClick={signOut}>
            <LogOut size={15} /> Switch
          </button>
        </div>
      </aside>
      <div className="supplier-content">
        <header className="supplier-topbar">
          <span>
            Workspace <span className="breadcrumb">/</span>{" "}
            <strong>{navigation.find((n) => n.id === section)?.label}</strong>
          </span>
          <ERPIndicator api={api} />
        </header>
        <main className="supplier-main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">CUSTOMER SELF-SERVICE</p>
              <h1>{navigation.find((n) => n.id === section)?.label}</h1>
              <p>{descriptions[section]}</p>
            </div>
            <div className="scope-control">
              <label htmlFor="customer-scope">Viewing</label>
              <select
                id="customer-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="all">All customers</option>
                {customers.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {(error || loadError) && (
            <p className="error" role="alert">
              {error || loadError}
            </p>
          )}
          {!data ? (
            loadError ? null : (
              <div className="card loading-card" role="status">
                Loading customer workspace…
              </div>
            )
          ) : (
            <>
              {section === "overview" && (
                <div className="overview-grid">
                  <div>
                    <Analytics data={data.analytics} />
                  </div>
                  <div className="overview-aside">
                    <section className="card insight-card">
                      <span className="insight-icon">
                        <ArrowUpRight size={24} />
                      </span>
                      <h2>
                        Answers for customers.
                        <br />
                        Time for your team.
                      </h2>
                      <p>
                        Let customers find the information they need, while your
                        team focuses on the work that needs a person.
                      </p>
                      <div className="insight-stat">
                        <strong>
                          {data.access.filter((r) => r.enabled === true).length}{" "}
                          of {data.access.length}
                        </strong>
                        <span>categories fully enabled</span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setSection("access")}
                      >
                        Manage customer access <ArrowUpRight size={16} />
                      </button>
                    </section>
                    <DataSources api={api} />
                  </div>
                </div>
              )}
              {section === "access" && (
                <AccessSwitches
                  key={scope}
                  api={api}
                  scope={scope}
                  rules={data.access}
                  refresh={() => void refresh()}
                />
              )}
              {section === "data" && (
                <DataBrowser
                  key={scope}
                  api={api}
                  scope={scope}
                  customers={customers}
                />
              )}
              {section === "sources" && <DataSources api={api} />}
            </>
          )}
        </main>
        <footer className="supplier-footer">
          Querent <span>Customer data, finally customer-facing.</span>
        </footer>
      </div>
    </div>
  );
}
