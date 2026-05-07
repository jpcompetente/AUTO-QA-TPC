import React, { useEffect, useState } from "react";
import {
  getComponents,
  getModels,
  getOperators,
  getAdminSettings,
  createAdminSettings,
  deleteAdminSettings,
} from "../api/backend";

const AdminDashboard = ({ onLogout }) => {
  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [operators, setOperators] = useState([]);
  const [settings, setSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [form, setForm] = useState({
    component: "",
    model: "",
    threshold: 0.5,
    assigned_operator: "",
  });

  // ✅ Fetch data function
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [c, m, o, s] = await Promise.all([
        getComponents(),
        getModels(),
        getOperators(),
        getAdminSettings(),
      ]);

      setComponents(c.data);
      setModels(m.data);
      setOperators(o.data);
      setSettings(s.data);

      setForm((prev) => ({
        ...prev,
        component: prev.component || c.data[0]?.id || "",
        model: prev.model || m.data[0]?.id || "",
        assigned_operator: prev.assigned_operator || o.data[0]?.id || "",
      }));
    } catch (err) {
      console.error("Fetch error:", err.response?.data || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Run once when component mounts
  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
    if (!form.component || !form.model || !form.assigned_operator) return;
    try {
      await createAdminSettings(form);
      fetchData();
    } catch (err) {
      console.error("Create error:", err.response?.data || err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteAdminSettings(id);
      fetchData();
    } catch (err) {
      console.error("Delete error:", err.response?.data || err.message);
    }
  };

  return (
    <div className="panel-page">
      <div className="panel-shell">
        <header className="panel-header">
          <div>
            <span className="eyebrow">Admin dashboard</span>
            <h1>Control inspection rules</h1>
            <p>
              Manage component-to-model assignments and operator routing from
              one place.
            </p>
          </div>
          <button className="ghost-button" onClick={onLogout}>
            Logout
          </button>
        </header>

        <section className="metric-grid">
          <div className="metric-card">
            <span>Components</span>
            <strong>{components.length}</strong>
          </div>
          <div className="metric-card">
            <span>Models</span>
            <strong>{models.length}</strong>
          </div>
          <div className="metric-card">
            <span>Operators</span>
            <strong>{operators.length}</strong>
          </div>
          <div className="metric-card">
            <span>Configs</span>
            <strong>{settings.length}</strong>
          </div>
        </section>

        <section className="content-grid">
          <div className="section-card">
            <div className="section-heading">
              <span className="eyebrow">Create config</span>
              <h2>Assign models and thresholds</h2>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Component</span>
                <select
                  value={form.component}
                  onChange={(e) =>
                    setForm({ ...form, component: e.target.value })
                  }
                >
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Model</span>
                <select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.version})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Operator</span>
                <select
                  value={form.assigned_operator}
                  onChange={(e) =>
                    setForm({ ...form, assigned_operator: e.target.value })
                  }
                >
                  {operators.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.username}
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
                  step="0.1"
                  value={form.threshold}
                  onChange={(e) =>
                    setForm({ ...form, threshold: e.target.value })
                  }
                />
              </label>
            </div>

            <button
              className="primary-button"
              onClick={handleSubmit}
              disabled={isLoading}
            >
              Save config
            </button>
          </div>

          <div className="section-card section-card--wide">
            <div className="section-heading">
              <span className="eyebrow">Current configs</span>
              <h2>Routing overview</h2>
            </div>

            <div className="table-wrap">
              <table>
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
                  {settings.map((s) => (
                    <tr key={s.id}>
                      <td>{s.operator_name}</td>
                      <td>{s.component_name}</td>
                      <td>{s.model_name}</td>
                      <td>{Number(s.threshold).toFixed(2)}</td>
                      <td>
                        <button
                          className="ghost-button ghost-button--danger"
                          onClick={() => handleDelete(s.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {settings.length === 0 && (
                <div className="empty-state">No configs created yet.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
