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
      threshold: Number(form.threshold),
    });

    fetchData();
  };

  const handleDelete = async (id) => {
    await deleteAdminSettings(id);
    fetchData();
  };

  return (
    <div className="panel-page">
      <div className="panel-shell">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Admin dashboard</p>
            <h1>Control inspection rules</h1>
            <p>
              Assign components, models, thresholds, and operators from one
              screen.
            </p>
          </div>
          <button className="ghost-button" onClick={onLogout} type="button">
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
              <p className="eyebrow">Create config</p>
              <h2>Assign models and thresholds</h2>
            </div>

            <div className="form-grid">
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

            <button
              className="primary-button"
              onClick={handleSubmit}
              disabled={isLoading}
              type="button"
            >
              Save config
            </button>
          </div>

          <div className="section-card section-card--wide">
            <div className="section-heading">
              <p className="eyebrow">Current configs</p>
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
                  {settings.map((setting) => (
                    <tr key={setting.id}>
                      <td>{setting.operator_name}</td>
                      <td>{setting.component_name}</td>
                      <td>{setting.model_name}</td>
                      <td>{Number(setting.threshold).toFixed(2)}</td>
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
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminDashboard;
