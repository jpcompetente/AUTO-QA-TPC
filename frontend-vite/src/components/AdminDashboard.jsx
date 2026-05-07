import { useEffect, useState } from "react";
import {
  createAdminSettings,
  deleteAdminSettings,
  getAdminSettings,
  getComponents,
  getModels,
  getOperators,
} from "../api/backend";

function AdminDashboard({ onLogout }) {
  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [operators, setOperators] = useState([]);
  const [settings, setSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePage, setActivePage] = useState("overview");
  const [form, setForm] = useState({
    component: "",
    model: "",
    threshold: 0.5,
    assigned_operator: "",
  });

  const fetchData = async () => {
    setIsLoading(true);

    try {
      const [
        componentResponse,
        modelResponse,
        operatorResponse,
        settingsResponse,
      ] = await Promise.all([
        getComponents(),
        getModels(),
        getOperators(),
        getAdminSettings(),
      ]);

      setComponents(componentResponse.data);
      setModels(modelResponse.data);
      setOperators(operatorResponse.data);
      setSettings(settingsResponse.data);

      setForm((currentForm) => ({
        ...currentForm,
        component: currentForm.component || componentResponse.data[0]?.id || "",
        model: currentForm.model || modelResponse.data[0]?.id || "",
        assigned_operator:
          currentForm.assigned_operator || operatorResponse.data[0]?.id || "",
      }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchData();
    };

    void loadData();
  }, []);

  const handleSubmit = async () => {
    if (!form.component || !form.model || !form.assigned_operator) {
      return;
    }

    await createAdminSettings({
      ...form,
      confidence_threshold: Number(form.threshold),
    });

    fetchData();
  };

  const handleDelete = async (id) => {
    await deleteAdminSettings(id);
    fetchData();
  };

  const pages = [
    { id: "overview", label: "Overview" },
    { id: "configure", label: "Configure" },
    { id: "routing", label: "Routing" },
    { id: "audit", label: "Audit" },
  ];

  const currentSetting = settings[0];

  return (
    <div className="dashboard-shell dashboard-shell--admin">
      <aside className="dashboard-sidebar">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h1>Control room</h1>
          <p className="sidebar-copy">
            A single full-screen workspace for routing, configuration, and
            governance.
          </p>
        </div>

        <nav className="page-nav" aria-label="Admin pages">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={
                activePage === page.id
                  ? "page-nav__button is-active"
                  : "page-nav__button"
              }
              onClick={() => setActivePage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </nav>

        <button
          className="ghost-button ghost-button--sidebar"
          onClick={onLogout}
          type="button"
        >
          Logout
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Admin portal</p>
            <h2>Page-based dashboard</h2>
            <p>
              Manage components, models, operators, and assignment rules from
              one continuous workspace.
            </p>
          </div>
          <div className="dashboard-header__meta">
            <span>{components.length} components</span>
            <span>{models.length} models</span>
            <span>{operators.length} operators</span>
          </div>
        </header>

        {activePage === "overview" ? (
          <section className="dashboard-section dashboard-section--overview">
            <div className="stat-line">
              <div>
                <span>Configurations</span>
                <strong>{settings.length}</strong>
              </div>
              <div>
                <span>Components</span>
                <strong>{components.length}</strong>
              </div>
              <div>
                <span>Models</span>
                <strong>{models.length}</strong>
              </div>
              <div>
                <span>Operators</span>
                <strong>{operators.length}</strong>
              </div>
            </div>

            <div className="timeline">
              <div className="timeline__item">
                <span>Active routing</span>
                <strong>
                  {currentSetting?.operator_name || "No assignment yet"}
                </strong>
              </div>
              <div className="timeline__item">
                <span>Current component</span>
                <strong>
                  {currentSetting?.component_name || "Awaiting config"}
                </strong>
              </div>
              <div className="timeline__item">
                <span>Current model</span>
                <strong>
                  {currentSetting?.model_name || "Awaiting config"}
                </strong>
              </div>
              <div className="timeline__item">
                <span>Threshold</span>
                <strong>
                  {currentSetting
                    ? Number(currentSetting.threshold).toFixed(2)
                    : "0.50"}
                </strong>
              </div>
            </div>
          </section>
        ) : null}

        {activePage === "configure" ? (
          <section className="dashboard-section dashboard-section--form">
            <div className="dashboard-section__header">
              <div>
                <p className="eyebrow">Configure</p>
                <h3>Assign models and thresholds</h3>
              </div>
              <button
                className="primary-button"
                onClick={handleSubmit}
                disabled={isLoading}
                type="button"
              >
                Save config
              </button>
            </div>

            <div className="form-grid form-grid--admin">
              <label className="field">
                <span>Component</span>
                <select
                  value={form.component}
                  onChange={(event) =>
                    setForm({ ...form, component: event.target.value })
                  }
                >
                  {components.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Model</span>
                <select
                  value={form.model}
                  onChange={(event) =>
                    setForm({ ...form, model: event.target.value })
                  }
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.version})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Operator</span>
                <select
                  value={form.assigned_operator}
                  onChange={(event) =>
                    setForm({ ...form, assigned_operator: event.target.value })
                  }
                >
                  {operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.username}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Threshold</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={form.threshold}
                  onChange={(event) =>
                    setForm({ ...form, threshold: event.target.value })
                  }
                />
              </label>
            </div>
          </section>
        ) : null}

        {activePage === "routing" ? (
          <section className="dashboard-section dashboard-section--table">
            <div className="dashboard-section__header">
              <div>
                <p className="eyebrow">Routing</p>
                <h3>Current configs</h3>
              </div>
              <span className="section-note">
                {settings.length} active rows
              </span>
            </div>

            <div className="table-wrap dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>Component</th>
                    <th>Model</th>
                    <th>Threshold</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((setting) => (
                    <tr key={setting.id}>
                      <td>{setting.operator_name}</td>
                      <td>{setting.component_name}</td>
                      <td>{setting.model_name}</td>
                      <td>{Number(setting.confidence_threshold).toFixed(2)}</td>
                      <td>
                        <button
                          className="ghost-button ghost-button--danger"
                          onClick={() => handleDelete(setting.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {settings.length === 0 ? (
                <div className="empty-state">No configs created yet.</div>
              ) : null}
            </div>
          </section>
        ) : null}

        {activePage === "audit" ? (
          <section className="dashboard-section dashboard-section--audit">
            <div className="dashboard-section__header">
              <div>
                <p className="eyebrow">Audit</p>
                <h3>Operational snapshot</h3>
              </div>
              <span className="section-note">Read-only summary</span>
            </div>

            <div className="audit-list">
              <div className="audit-list__row">
                <span>Latest component</span>
                <strong>{components[0]?.name || "No components loaded"}</strong>
              </div>
              <div className="audit-list__row">
                <span>Latest model</span>
                <strong>
                  {models[0]
                    ? `${models[0].name} (${models[0].version})`
                    : "No models loaded"}
                </strong>
              </div>
              <div className="audit-list__row">
                <span>Latest operator</span>
                <strong>
                  {operators[0]?.username || "No operators loaded"}
                </strong>
              </div>
              <div className="audit-list__row">
                <span>Last assignment</span>
                <strong>
                  {currentSetting
                    ? `${currentSetting.component_name} to ${currentSetting.operator_name}`
                    : "No assignment recorded"}
                </strong>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default AdminDashboard;
