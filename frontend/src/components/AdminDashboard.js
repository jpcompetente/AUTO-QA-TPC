import React, { useEffect, useState } from 'react';
import {
  getComponents,
  getModels,
  getOperators,
  getAdminSettings,
  createAdminSettings,
  deleteAdminSettings
} from '../api/backend';

const AdminDashboard = ({ onLogout }) => {
  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [operators, setOperators] = useState([]);
  const [settings, setSettings] = useState([]);

  const [form, setForm] = useState({
    component: '',
    model: '',
    threshold: 0.5,
    assigned_operator: ''
  });

  // ✅ Fetch data function
  const fetchData = async () => {
    try {
      const [c, m, o, s] = await Promise.all([
        getComponents(),
        getModels(),
        getOperators(),
        getAdminSettings()
      ]);

      setComponents(c.data);
      setModels(m.data);
      setOperators(o.data);
      setSettings(s.data);
    } catch (err) {
      console.error("Fetch error:", err.response?.data || err.message);
    }
  };

  // ✅ Run once when component mounts
  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async () => {
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
    <div style={{ padding: 20 }}>
      <h2>Admin Control Panel</h2>
      <button onClick={onLogout}>Logout</button>

      <h3>Create Config</h3>

      <select onChange={e => setForm({ ...form, component: e.target.value })}>
        <option>Select Component</option>
        {components.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <select onChange={e => setForm({ ...form, model: e.target.value })}>
        <option>Select Model</option>
        {models.map(m => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.version})
          </option>
        ))}
      </select>

      <select onChange={e => setForm({ ...form, assigned_operator: e.target.value })}>
        <option>Select Operator</option>
        {operators.map(o => (
          <option key={o.id} value={o.id}>{o.username}</option>
        ))}
      </select>

      <input
        type="number"
        value={form.threshold}
        step="0.1"
        onChange={e => setForm({ ...form, threshold: e.target.value })}
      />

      <button onClick={handleSubmit}>Save Config</button>

      <h3>Configs</h3>
      <table border="1">
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
          {settings.map(s => (
            <tr key={s.id}>
              <td>{s.operator_name}</td>
              <td>{s.component_name}</td>
              <td>{s.model_name}</td>
              <td>{s.threshold}</td>
              <td>
                <button onClick={() => handleDelete(s.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminDashboard;
