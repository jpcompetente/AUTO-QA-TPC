import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  createAdminSettings,
  deleteAdminSettings,
  getAdminSettings,
  getComponents,
  getDetectionLogs,
  getModels,
  getOperators,
  updateAdminSettings,
} from "../api/backend";

const Icon = {
  Grid: () => (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  List: () => (
    <svg viewBox="0 0 24 24">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  LogOut: () => (
    <svg viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Shield: () => (
    <svg viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Box: () => (
    <svg viewBox="0 0 24 24">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  Cpu: () => (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  ),
  Save: () => (
    <svg viewBox="0 0 24 24">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    </svg>
  ),
  Edit: () => (
    <svg viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

const pages = [
  { id: "home", label: "Overview", IconC: Icon.Grid },
  { id: "detection-logs", label: "Detection Logs", IconC: Icon.List },
  { id: "batches", label: "Batches", IconC: Icon.Box },
  { id: "settings", label: "Settings", IconC: Icon.Settings },
];

function decisionClass(val) {
  if (!val) return "";
  const v = String(val).toLowerCase();
  if (v === "pass" || v === "ok" || v === "accepted") return "pass";
  if (v === "fail" || v === "reject" || v === "rejected") return "fail";
  return "";
}

function getCompatibleModelsForProduct(models, productId) {
  const pid = Number(productId);
  if (!pid) return [];
  return models.filter((model) =>
    model.compatible_component_ids?.includes(pid),
  );
}

function getDetectionLogImageSrc(log) {
  return (
    log?.image_snapshot_url ||
    log?.snapshot_url ||
    log?.image_snapshot ||
    log?.image ||
    ""
  );
}

function AdminDashboard({ onLogout }) {
  const [components, setComponents] = useState([]);
  const [models, setModels] = useState([]);
  const [operators, setOperators] = useState([]);
  const [settings, setSettings] = useState([]);
  const [detectionLogs, setDetectionLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState("");
  const [activePage, setActivePage] = useState("home");
  const [editingSettingId, setEditingSettingId] = useState(null);
  const [form, setForm] = useState({
    product: "",
    model: "",
    threshold: 0.5,
    operator: "",
  });
  const [detectionLogsLimit, setDetectionLogsLimit] = useState(20);
  const [logsSortField, setLogsSortField] = useState("id");
  const [logsSortOrder, setLogsSortOrder] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterOperator, setFilterOperator] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");
  const [filterDateMode, setFilterDateMode] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDateOnly, setFilterDateOnly] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [selectedLogPreview, setSelectedLogPreview] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [logsRes, compRes, modelRes, opRes, settingsRes] =
        await Promise.allSettled([
          getDetectionLogs(),
          getComponents(),
          getModels(),
          getOperators(),
          getAdminSettings(),
        ]);

      if (logsRes.status === "fulfilled") {
        const logs = Array.isArray(logsRes.value.data)
          ? logsRes.value.data
          : logsRes.value.data?.results || [];
        setDetectionLogs(logs);

        // If the user hasn't changed the page size (default 20), default to showing all logs
        if (logs.length > 0) {
          setDetectionLogsLimit((prev) => (prev === 20 ? logs.length : prev));
        }
      } else {
        console.error("Failed to fetch detection logs", logsRes.reason);
      }

      if (compRes.status === "fulfilled") setComponents(compRes.value.data);
      else console.error("Failed to fetch components", compRes.reason);

      if (modelRes.status === "fulfilled") setModels(modelRes.value.data);
      else console.error("Failed to fetch models", modelRes.reason);

      if (opRes.status === "fulfilled") setOperators(opRes.value.data);
      else console.error("Failed to fetch operators", opRes.reason);

      if (settingsRes.status === "fulfilled") setSettings(settingsRes.value.data);
      else console.error("Failed to fetch settings", settingsRes.reason);

      if (compRes.status === "fulfilled" && modelRes.status === "fulfilled" && opRes.status === "fulfilled") {
        const compData = compRes.value.data;
        const modelData = modelRes.value.data;
        const opData = opRes.value.data;

        setForm((f) => ({
          ...f,
          product: f.product || String(compData[0]?.id || ""),
          model:
            f.model ||
            String(
              getCompatibleModelsForProduct(modelData, compData[0]?.id)[0]
                ?.id ||
                modelData[0]?.id ||
                "",
            ),
          operator: f.operator || String(opData[0]?.id || ""),
        }));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  // Fetch logs from server using server-side filters.
  // NOTE: We intentionally do NOT send `batch_number` here; otherwise the API would
  // return only the selected batch and the Batch dropdown would lose the other
  // existing batches. Batch selection is handled client-side.
  const fetchLogs = useCallback(async (overrides = {}) => {
    const params = { ...(overrides || {}) };
    if (filterDateMode === 'single' && filterDateOnly) {
      params.date = filterDateOnly;
    }
    if (filterDateMode === 'range') {
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
    }
    if (filterOperator) params.operator = filterOperator;

    setIsLoading(true);
    try {
      const res = await getDetectionLogs(params);
      setDetectionLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch logs with params', params, err);
    } finally {
      setIsLoading(false);
    }
  }, [filterDateMode, filterDateOnly, filterDateFrom, filterDateTo, filterOperator]);

  useEffect(() => {
    void (async () => {
      await fetchLogs();
    })();
  }, [fetchLogs]);

  const compatibleModels = useMemo(() => {
    return getCompatibleModelsForProduct(models, form.product);
  }, [form.product, models]);

  const selectedProduct = useMemo(
    () =>
      components.find(
        (component) => String(component.id) === String(form.product),
      ),
    [components, form.product],
  );

  const selectedModel = useMemo(
    () => models.find((model) => String(model.id) === String(form.model)),
    [models, form.model],
  );

  const selectedOperator = useMemo(
    () =>
      operators.find(
        (operator) => String(operator.id) === String(form.operator),
      ),
    [operators, form.operator],
  );

  const selectedSettings = useMemo(
    () => ({
      product: selectedProduct?.name || "Select a product",
      model: selectedModel
        ? `${selectedModel.name}${selectedModel.version ? ` (${selectedModel.version})` : ""}`
        : "Select a compatible model",
      operator: selectedOperator?.username || "Select an operator",
      threshold:
        form.threshold === "" || form.threshold == null
          ? "0.50"
          : Number(form.threshold).toFixed(2),
      modelCount: compatibleModels.length,
    }),
    [
      compatibleModels.length,
      form.threshold,
      selectedModel,
      selectedOperator,
      selectedProduct,
    ],
  );

  const canSaveSettings =
    Boolean(form.product) &&
    Boolean(form.model) &&
    Boolean(form.operator) &&
    !isLoading;

  // Sort detection logs
  const sortedDetectionLogs = useMemo(() => {
    const sorted = [...detectionLogs];
    sorted.sort((a, b) => {
      let aVal;
      let bVal;

      switch (logsSortField) {
        case "operator":
          aVal = (a.operator_name || a.operator || "").toLowerCase();
          bVal = (b.operator_name || b.operator || "").toLowerCase();
          break;
        case "component":
          aVal = (a.component_name || a.component || "").toLowerCase();
          bVal = (b.component_name || b.component || "").toLowerCase();
          break;
        case "model":
          aVal = (a.model_name || a.model_used || "").toLowerCase();
          bVal = (b.model_name || b.model_used || "").toLowerCase();
          break;
        case "decision":
          aVal = (a.final_decision || a.system_decision || "").toLowerCase();
          bVal = (b.final_decision || b.system_decision || "").toLowerCase();
          break;
        case "status":
          aVal = (a.status || "").toLowerCase();
          bVal = (b.status || "").toLowerCase();
          break;
        case "batch_number":
          aVal = Number(a.batch_number || 1);
          bVal = Number(b.batch_number || 1);
          break;
        case "timestamp":
        default:
          aVal = new Date(a.timestamp || a.created_at).getTime();
          bVal = new Date(b.timestamp || b.created_at).getTime();
          break;
        case "id":
          aVal = Number(a.id ?? a.log_id ?? 0);
          bVal = Number(b.id ?? b.log_id ?? 0);
          break;
      }

      if (aVal < bVal) return logsSortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return logsSortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [detectionLogs, logsSortField, logsSortOrder]);

  const availableBatchNumbers = useMemo(() => {
    return [...new Set(detectionLogs.map((log) => Number(log.batch_number || 1)).filter((value) => value >= 1))].sort(
      (left, right) => left - right,
    );
  }, [detectionLogs]);

  const getLocalDateKey = useCallback((value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
  }, []);

  // Filters + pagination for detection logs
  const filteredSortedDetectionLogs = useMemo(() => {
    let logs = [...sortedDetectionLogs];

    if (filterBatch !== "all") {
      const selectedBatch = Number(filterBatch) || 1;
      logs = logs.filter((log) => Number(log.batch_number || 1) === selectedBatch);
    }

    // Operator filter (compare against id or name where available)
    if (filterOperator) {
      const opId = Number(filterOperator);
      const opObj = operators.find((o) => o.id === opId);
      logs = logs.filter((l) => {
        if (
          l.operator == null &&
          l.operator_name == null &&
          l.operator_id == null
        ) {
          return false;
        }
        if (opObj) {
          return (
            Number(l.operator) === opId ||
            Number(l.operator_id) === opId ||
            l.operator_name === opObj.username
          );
        }
        return (
          String(l.operator) === filterOperator ||
          String(l.operator_id) === filterOperator ||
          l.operator_name === filterOperator
        );
      });
    }

    if (filterDateMode === "single" && filterDateOnly) {
      logs = logs.filter((log) => {
        const logDate = getLocalDateKey(log.timestamp || log.created_at);
        return logDate === filterDateOnly;
      });
    } else if (filterDateMode === "range" && (filterDateFrom || filterDateTo)) {
      logs = logs.filter((log) => {
        const logDate = getLocalDateKey(log.timestamp || log.created_at);
        if (!logDate) return false;
        if (filterDateFrom && logDate < filterDateFrom) return false;
        if (filterDateTo && logDate > filterDateTo) return false;
        return true;
      });
    }

    // Search filter (case-insensitive) across several fields
    if (filterSearch && String(filterSearch).trim() !== "") {
      const q = String(filterSearch).trim().toLowerCase();
      logs = logs.filter((l) => {
        return (
          String(l.id).toLowerCase().includes(q) ||
          String(l.operator_name || l.operator || "")
            .toLowerCase()
            .includes(q) ||
          String(l.component_name || l.component || "")
            .toLowerCase()
            .includes(q) ||
          String(l.model_name || l.model_used || "")
            .toLowerCase()
            .includes(q) ||
          String(l.status || "")
            .toLowerCase()
            .includes(q) ||
          String(l.final_decision || l.system_decision || "")
            .toLowerCase()
            .includes(q)
        );
      });
    }

    return logs;
  }, [
    sortedDetectionLogs,
    filterBatch,
    filterDateMode,
    filterOperator,
    filterDateFrom,
    filterDateTo,
    filterDateOnly,
    operators,
    filterSearch,
    getLocalDateKey,
  ]);

  const totalLogs = filteredSortedDetectionLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / detectionLogsLimit));

  useEffect(() => {
    // clamp current page when totalPages changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  // Note: page size defaulting handled in fetchData to avoid synchronous setState in effects

  // Paginate: compute window based on `detectionLogsLimit` and `currentPage`
  const startIndex = (currentPage - 1) * detectionLogsLimit;
  // When detectionLogsLimit equals the full length we show everything; otherwise slice by page.
  const paginatedDetectionLogs =
    detectionLogsLimit === filteredSortedDetectionLogs.length
      ? filteredSortedDetectionLogs
      : filteredSortedDetectionLogs.slice(startIndex, startIndex + detectionLogsLimit);

  // Compute shown-from / shown-to for the UI based on actual paginated list
  const shownFrom = paginatedDetectionLogs.length ? startIndex + 1 : 0;
  const shownTo = paginatedDetectionLogs.length
    ? startIndex + paginatedDetectionLogs.length
    : 0;

  const handleSubmit = async () => {
    if (!form.product || !form.model || !form.operator) {
      setFormError(
        "Choose a product, a compatible model, and an operator before saving.",
      );
      return;
    }
    setFormError("");
    const payload = {
      product: form.product,
      operator: form.operator,
      model: form.model,
      threshold: Number(form.threshold),
    };
    try {
      if (editingSettingId)
        await updateAdminSettings(editingSettingId, payload);
      else await createAdminSettings(payload);
      setEditingSettingId(null);
      fetchData();
    } catch (err) {
      const rd = err.response?.data;
      const opErr = rd?.operator;
      if (Array.isArray(opErr) && opErr.length > 0) setFormError(opErr[0]);
      else if (typeof opErr === "string") setFormError(opErr);
      else if (typeof rd?.detail === "string") setFormError(rd.detail);
      else
        setFormError(
          "Failed to save config. This user may already have a configuration.",
        );
      setIsLoading(false);
    }
  };

  const handleEdit = (setting) => {
    setEditingSettingId(setting.id);
    setFormError("");
    setForm({
      product: String(setting.product ?? setting.product_id ?? ""),
      model: String(setting.model ?? setting.model_id ?? ""),
      operator: String(setting.operator ?? setting.operator_id ?? ""),
      threshold: setting.threshold ?? setting.confidence_threshold ?? 0.5,
    });
    setActivePage("settings");
  };

  const handleCancelEdit = () => {
    setEditingSettingId(null);
    setFormError("");
    const defaultProductId = components[0]?.id ? String(components[0].id) : "";
    const defaultCompatibleModels = getCompatibleModelsForProduct(
      models,
      defaultProductId,
    );
    setForm((f) => ({
      ...f,
      product: defaultProductId,
      model: defaultCompatibleModels[0]?.id
        ? String(defaultCompatibleModels[0].id)
        : models[0]?.id
          ? String(models[0].id)
          : "",
      operator: operators[0]?.id ? String(operators[0].id) : "",
      threshold: 0.5,
    }));
  };

  const handleDelete = async (id) => {
    await deleteAdminSettings(id);
    fetchData();
  };

  const currentSetting = settings[0];

  const getConfidence = (log) => {
    return (
      log.confidence ??
      log.score ??
      log.probability ??
      log.model_confidence ??
      null
    );
  };

  // Normalize status from available fields
  const getStatus = (log) => {
    const s =
      log.status ??
      log.final_decision ??
      log.system_decision ??
      log.decision ??
      log.result ??
      null;
    if (s == null) return "";
    return String(s);
  };

  const formatConfidence = (log) => {
    const c = getConfidence(log);
    if (c == null) return "-";
    const n = Number(c);
    if (Number.isNaN(n)) return "-";
    if (n <= 1) return `${(n * 100).toFixed(1)}%`;
    return `${n.toFixed(1)}%`;
  };

  // Batch grouping for Batches page
  const getBatchKey = (log) => {
    if (log.batch_number != null) {
      return Number(log.batch_number || 1);
    }
    return (
      log.batch ??
      log.batch_id ??
      log.batch_no ??
      log.batchName ??
      log.batch_name ??
      null
    );
  };

  const batches = useMemo(() => {
    const logs = [...sortedDetectionLogs];
    // detect if logs contain explicit batch keys
    const explicitKeys = new Set();
    logs.forEach((l) => {
      const k = getBatchKey(l);
      if (k != null) explicitKeys.add(String(k));
    });

    if (explicitKeys.size > 0) {
      const map = {};
      logs.forEach((l) => {
        const k = String(getBatchKey(l) ?? "unknown");
        if (!map[k]) map[k] = [];
        map[k].push(l);
      });
      const keys = Object.keys(map);
      const extractNum = (s) => {
        const m = String(s).match(/(\d+)/);
        return m ? Number(m[1]) : null;
      };
      keys.sort((a, b) => {
        const na = extractNum(a);
        const nb = extractNum(b);
        if (na != null && nb != null) return na - nb; // numeric order
        if (na != null) return -1;
        if (nb != null) return 1;
        return String(a).localeCompare(String(b));
      });
      return keys.map((k) => ({ key: k, logs: map[k] }));
    }

    // fallback: chunk into pages sized by detectionLogsLimit
    const chunks = [];
    for (let i = 0; i < logs.length; i += detectionLogsLimit) {
      const chunk = logs.slice(i, i + detectionLogsLimit);
      const idx = chunks.length + 1;
      chunks.push({ key: `Batch ${idx}`, logs: chunk });
    }
    return chunks.length > 0 ? chunks : [{ key: "Batch 1", logs: [] }];
  }, [sortedDetectionLogs, detectionLogsLimit]);

  const [activeBatchKey, setActiveBatchKey] = useState(null);

  const getFailLogsForBatch = (batch) => {
    return (batch.logs || []).filter((l) => {
      const d = (l.final_decision || l.system_decision || "")
        .toString()
        .toLowerCase();
      return (
        d.includes("fail") ||
        d.includes("reject") ||
        (l.status || "").toString().toLowerCase() === "fail"
      );
    });
  };

  // Export failed images as individual PNG downloads (one file per failed item)
  const exportImagesForLogs = async (logsToExport, filenamePrefix = "fail") => {
    const items = logsToExport.map((l) => ({
      id: l.id,
      url: getDetectionLogImageSrc(l),
    }));
    if (items.length === 0) return;
    for (const it of items) {
      if (!it.url) continue;
      try {
        const res = await fetch(it.url, { cache: "no-cache" });
        if (!res.ok) continue;
        const blob = await res.blob();
        const ext = blob.type?.split("/")?.pop() || "png";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filenamePrefix}_${it.id}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        // ignore single failures
        console.warn("Failed to export image", it.url, e);
      }
    }
  };

  // derived metrics for Model Health + Alerts
  const currentModelObj = models.find(
    (m) =>
      String(m.id) ===
      String(currentSetting?.model || currentSetting?.model_id),
  );

  const decisionCounts = detectionLogs.reduce(
    (acc, l) => {
      const d = (l.final_decision || l.system_decision || "")
        .toString()
        .toLowerCase();
      if (d.includes("pass")) acc.pass += 1;
      else if (d.includes("fail") || d.includes("reject")) acc.fail += 1;
      else acc.other += 1;
      return acc;
    },
    { pass: 0, fail: 0, other: 0 },
  );

  const recent = detectionLogs.slice(-100);
  const recentPassRate = recent.length
    ? recent.filter((l) =>
        (l.final_decision || l.system_decision || "")
          .toString()
          .toLowerCase()
          .includes("pass"),
      ).length / recent.length
    : null;
  const prev = detectionLogs.slice(-200, -100);
  const prevPassRate = prev.length
    ? prev.filter((l) =>
        (l.final_decision || l.system_decision || "")
          .toString()
          .toLowerCase()
          .includes("pass"),
      ).length / prev.length
    : null;
  const performanceDelta =
    recentPassRate != null && prevPassRate != null
      ? recentPassRate - prevPassRate
      : null;

  const lowConfidenceClusters = (() => {
    const byKey = {};
    detectionLogs.forEach((l) => {
      const key =
        l.model_name ||
        l.model_used ||
        l.component_name ||
        l.component ||
        "unknown";
      const c = getConfidence(l);
      if (!byKey[key]) byKey[key] = { sum: 0, n: 0 };
      if (c != null && !Number.isNaN(Number(c))) {
        byKey[key].sum += Number(c);
        byKey[key].n += 1;
      }
    });
    return Object.entries(byKey)
      .map(([k, v]) => ({ key: k, avg: v.n ? v.sum / v.n : null, n: v.n }))
      .filter((x) => x.n >= 5 && x.avg != null)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 6);
  })();

  const pageTitles = {
    home: ["Overview", "Admin portal"],
    "detection-logs": ["Detection logs", "Audit trail"],
    batches: ["Batches", "Export fails"],
    settings: ["Settings", "Configuration"],
  };

  const [pageTitle, pageEyebrow] = pageTitles[activePage] || [
    "Dashboard",
    "Admin portal",
  ];

  return (
    <motion.div
      className="adash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Sidebar */}
      <motion.aside
        className="adash__sidebar"
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="adash__brand">
          <div className="adash__brand-icon">
            <Icon.Shield />
          </div>
          <div className="adash__brand-text">
            <span className="adash__brand-label">Admin</span>
            <span className="adash__brand-name">Control Room</span>
          </div>
        </div>

        <nav className="adash__nav" aria-label="Admin pages">
          <div className="adash__nav-section">Navigation</div>
          {pages.map(({ id, label, IconC }) => (
            <motion.button
              key={id}
              type="button"
              className={`adash__nav-btn${activePage === id ? " is-active" : ""}`}
              onClick={() => setActivePage(id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <IconC />
              {label}
            </motion.button>
          ))}
        </nav>

        <div className="adash__sidebar-footer">
          <button
            className="adash__logout-btn"
            onClick={onLogout}
            type="button"
          >
            <Icon.LogOut />
            Sign out
          </button>
        </div>
      </motion.aside>

      {/* Main */}
      <motion.main
        className="adash__main"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {/* Topbar */}
        <motion.header
          className="adash__topbar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="adash__page-title">
            <span className="adash__eyebrow">{pageEyebrow}</span>
            <h2>{pageTitle}</h2>
          </div>
          <div className="adash__meta-pills">
            <span className="adash__pill">
              <span className="adash__pill-dot" />
              {components.length} components
            </span>
            <span className="adash__pill">
              <span className="adash__pill-dot" />
              {models.length} models
            </span>
            <span className="adash__pill">
              <span className="adash__pill-dot" />
              {operators.length} operators
            </span>
          </div>
        </motion.header>

        <div className="adash__content">
          {/* ── Home ── */}
          {activePage === "home" && (
            <>
              <div className="adash__stats">
                <div className="adash__stat">
                  <div className="adash__stat-icon">
                    <Icon.Settings />
                  </div>
                  <div className="adash__stat-label">Active configs</div>
                  <div className="adash__stat-value">{settings.length}</div>
                </div>
                <div className="adash__stat">
                  <div className="adash__stat-icon">
                    <Icon.Box />
                  </div>
                  <div className="adash__stat-label">Products</div>
                  <div className="adash__stat-value">{components.length}</div>
                </div>
                <div className="adash__stat">
                  <div className="adash__stat-icon">
                    <Icon.Cpu />
                  </div>
                  <div className="adash__stat-label">Models</div>
                  <div className="adash__stat-value">{models.length}</div>
                </div>
                <div className="adash__stat">
                  <div className="adash__stat-icon">
                    <Icon.Users />
                  </div>
                  <div className="adash__stat-label">Operators</div>
                  <div className="adash__stat-value">{operators.length}</div>
                </div>
              </div>

              <div className="adash__card-grid">
                <div className="adash__card">
                  <div className="adash__card-label">Active routing</div>
                  <div
                    className={`adash__card-value${!currentSetting?.operator_name ? " adash__card-value--muted" : ""}`}
                  >
                    {currentSetting?.operator_name || "No assignment yet"}
                  </div>
                </div>
                <div className="adash__card">
                  <div className="adash__card-label">Current product</div>
                  <div
                    className={`adash__card-value${!(currentSetting?.product_name || currentSetting?.component_name) ? " adash__card-value--muted" : ""}`}
                  >
                    {currentSetting?.product_name ||
                      currentSetting?.component_name ||
                      "Awaiting config"}
                  </div>
                </div>
                <div className="adash__card">
                  <div className="adash__card-label">Current model</div>
                  <div
                    className={`adash__card-value${!currentSetting?.model_name ? " adash__card-value--muted" : ""}`}
                  >
                    {currentSetting?.model_name || "Awaiting config"}
                  </div>
                </div>
                <div className="adash__card">
                  <div className="adash__card-label">Threshold</div>
                  <div className="adash__card-value">
                    {currentSetting
                      ? Number(currentSetting.threshold).toFixed(2)
                      : "0.50"}
                  </div>
                </div>
              </div>

              <div
                className="adash__overview-grid"
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div
                  className="adash__card"
                  style={{ padding: 18, minHeight: 180 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div className="adash__card-label">Model Health</div>
                      <div style={{ fontWeight: 600, marginTop: 6 }}>
                        {currentModelObj
                          ? `${currentModelObj.name} ${currentModelObj.version || ""}`
                          : currentSetting?.model_name || "No model selected"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        Recent vs prior
                      </div>
                      <div style={{ fontWeight: 700, marginTop: 6 }}>
                        {performanceDelta == null
                          ? "—"
                          : `${(performanceDelta * 100).toFixed(1)}%`}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>
                      Confusion snapshot
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div
                        style={{
                          flex: 1,
                          padding: 8,
                          background: "#f7f7f7",
                          borderRadius: 6,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#666" }}>Pass</div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {decisionCounts.pass}
                        </div>
                      </div>
                      <div
                        style={{
                          flex: 1,
                          padding: 8,
                          background: "#f7f7f7",
                          borderRadius: 6,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#666" }}>Fail</div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {decisionCounts.fail}
                        </div>
                      </div>
                      <div
                        style={{
                          flex: 1,
                          padding: 8,
                          background: "#f7f7f7",
                          borderRadius: 6,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "#666" }}>Other</div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>
                          {decisionCounts.other}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="adash__card"
                  style={{ padding: 18, minHeight: 180 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div className="adash__card-label">Alerts & Issues</div>
                      <div
                        style={{ fontSize: 13, color: "#666", marginTop: 6 }}
                      >
                        {detectionLogs.length} observations
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#888" }}>
                      Auto-detected
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>
                      Low-confidence clusters
                    </div>
                    {lowConfidenceClusters.length === 0 ? (
                      <div style={{ color: "#666", fontSize: 13 }}>
                        No low-confidence clusters found.
                      </div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {lowConfidenceClusters.map((c) => (
                          <li key={c.key} style={{ marginBottom: 6 }}>
                            <strong>{c.key}</strong>: avg {c.avg.toFixed(2)}{" "}
                            across {c.n} samples
                          </li>
                        ))}
                      </ul>
                    )}

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>
                        Active alerts
                      </div>
                      {detectionLogs
                        .filter(
                          (l) =>
                            (l.status || "").toString().toLowerCase() ===
                            "alert",
                        )
                        .slice(0, 5)
                        .map((a) => (
                          <div
                            key={a.id}
                            style={{
                              padding: 8,
                              background: "#fff6f6",
                              borderRadius: 6,
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              {a.component_name ||
                                a.component ||
                                a.model_name ||
                                a.model_used ||
                                `#${a.id}`}
                            </div>
                            <div style={{ fontSize: 12, color: "#666" }}>
                              {(a.final_decision ||
                                a.system_decision ||
                                a.status) +
                                " • " +
                                new Date(
                                  a.timestamp || a.created_at,
                                ).toLocaleString()}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Detection Logs ── */}
          {/* ── Batches ── */}
          {activePage === "batches" && (
            <>
              <div className="adash__section-header">
                <h3>Batches</h3>
                <span className="adash__section-badge">
                  {batches.length} batches
                </span>
                <div style={{ marginLeft: "auto" }} />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {batches.map((b) => {
                  const failCount = getFailLogsForBatch(b).length;
                  const numericBatchKey = Number(b.key);
                  const batchLabel =
                    Number.isFinite(numericBatchKey) && numericBatchKey >= 1
                      ? `Batch ${numericBatchKey}`
                      : Number.isFinite(numericBatchKey)
                        ? "Batch 1"
                        : String(b.key);
                  return (
                    <div
                      key={b.key}
                      className="adash__card"
                      style={{ padding: 12 }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, color: "#666" }}>
                            {batchLabel}
                          </div>
                          <div style={{ fontWeight: 700, marginTop: 6 }}>
                            {b.logs.length} items
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            Fails
                          </div>
                          <div style={{ fontWeight: 700, marginTop: 6 }}>
                            {failCount}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          className="adash__btn adash__btn--ghost"
                          type="button"
                          onClick={() =>
                            setActiveBatchKey(
                              activeBatchKey === b.key ? null : b.key,
                            )
                          }
                        >
                          {activeBatchKey === b.key ? "Hide" : "View fails"}
                        </button>
                        <button
                          className="adash__btn adash__btn--primary"
                          type="button"
                          onClick={() =>
                            exportImagesForLogs(
                              getFailLogsForBatch(b),
                              `${String(batchLabel).replace(/\s+/g, "_")}_fail`,
                            )
                          }
                          disabled={failCount === 0}
                        >
                          Export Images
                        </button>
                      </div>
                      {activeBatchKey === b.key && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 13, marginBottom: 8 }}>
                            Failed items in {batchLabel}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {getFailLogsForBatch(b).map((l) => (
                              <div
                                key={l.id}
                                style={{ width: 120, textAlign: "center" }}
                              >
                                {getDetectionLogImageSrc(l) ? (
                                  <img
                                    src={getDetectionLogImageSrc(l)}
                                    alt={`#${l.id}`}
                                    style={{
                                      width: 120,
                                      height: 80,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: 120,
                                      height: 80,
                                      background: "#f3f3f3",
                                      borderRadius: 6,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    No image
                                  </div>
                                )}
                                <div
                                  style={{ fontSize: 12, marginTop: 6 }}
                                >{`#${l.id}`}</div>
                              </div>
                            ))}
                            {getFailLogsForBatch(b).length === 0 && (
                              <div style={{ color: "#666" }}>
                                No failed items in this batch.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {activePage === "detection-logs" && (
            <>
              <div className="adash__section-header">
                <h3>Detection records</h3>
                <span className="adash__section-badge">
                  {detectionLogs.length} rows
                </span>
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <select
                      value={logsSortField}
                      onChange={(e) => setLogsSortField(e.target.value)}
                      style={{
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                      }}
                    >
                      <option value="batch_number">Batch</option>
                      <option value="timestamp">Time</option>
                      <option value="operator">Operator</option>
                      <option value="component">Component</option>
                      <option value="model">Model</option>
                      <option value="decision">Decision</option>
                      <option value="status">Status</option>
                      <option value="id">ID</option>
                    </select>

                    <button
                      className="adash__btn adash__btn--ghost"
                      type="button"
                      onClick={() =>
                        setLogsSortOrder((o) => (o === "asc" ? "desc" : "asc"))
                      }
                      style={{
                        height: "30px",
                        padding: "0 10px",
                        fontSize: "12px",
                      }}
                    >
                      {logsSortOrder === "asc" ? "Asc" : "Desc"}
                    </button>

                    <input
                      placeholder="Search logs..."
                      value={filterSearch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilterSearch(v);
                        // search should show results as a single batch
                        if (String(v).trim() !== "") {
                          setFilterBatch("all");
                        }
                        setCurrentPage(1);
                      }}
                      style={{
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        minWidth: "180px",
                      }}
                    />

                    <select
                      value={filterDateMode}
                      onChange={(e) => {
                        const mode = e.target.value;
                        setFilterDateMode(mode);
                        if (mode === "all") {
                          setFilterDateOnly("");
                          setFilterDateFrom("");
                          setFilterDateTo("");
                        }
                        setCurrentPage(1);
                      }}
                      style={{
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                      }}
                    >
                      <option value="all">Date: all</option>
                      <option value="single">Specific date</option>
                      <option value="range">Date range</option>
                    </select>

                    {filterDateMode === "single" && (
                      <input
                        type="date"
                        value={filterDateOnly}
                        onChange={(e) => {
                          setFilterDateOnly(e.target.value);
                          setCurrentPage(1);
                        }}
                        title="Filter by specific date"
                        style={{
                          padding: "6px 10px",
                          fontSize: "12px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                        }}
                      />
                    )}

                    {filterDateMode === "range" && (
                      <>
                        <input
                          type="date"
                          value={filterDateFrom}
                          onChange={(e) => {
                            setFilterDateFrom(e.target.value);
                            setCurrentPage(1);
                          }}
                          title="Start date"
                          style={{
                            padding: "6px 10px",
                            fontSize: "12px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                          }}
                        />
                        <input
                          type="date"
                          value={filterDateTo}
                          onChange={(e) => {
                            setFilterDateTo(e.target.value);
                            setCurrentPage(1);
                          }}
                          title="End date"
                          style={{
                            padding: "6px 10px",
                            fontSize: "12px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                          }}
                        />
                      </>
                    )}

                    <select
                      value={filterBatch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilterBatch(v);
                        setCurrentPage(1);
                      }}
                      style={{
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                      }}
                    >
                      <option value="all">All batches</option>
                      {availableBatchNumbers.map((batch) => (
                        <option key={batch} value={batch}>
                          Batch {batch}
                        </option>
                      ))}
                    </select>

                    <button
                      className="adash__btn adash__btn--ghost"
                      type="button"
                      onClick={() => {
                        setFilterOperator("");
                        setFilterBatch("all");
                        setFilterDateMode("all");
                        setFilterDateFrom("");
                        setFilterDateTo("");
                        setFilterDateOnly("");
                        setFilterSearch("");
                        setCurrentPage(1);
                      }}
                      style={{
                        height: "30px",
                        padding: "0 10px",
                        fontSize: "12px",
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  <label style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                    Show:
                  </label>
                  <select
                    value={detectionLogsLimit}
                    onChange={(e) => {
                      setDetectionLogsLimit(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: "6px 10px",
                      fontSize: "12px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                    }}
                  >
                    <option value={20}>20 logs</option>
                    <option value={50}>50 logs</option>
                    <option value={detectionLogs.length}>All logs</option>
                  </select>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <button
                      className="adash__btn adash__btn--ghost"
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => {
                        const np = Math.max(1, currentPage - 1);
                        setCurrentPage(np);
                      }}
                      style={{
                        height: "30px",
                        padding: "0 10px",
                        fontSize: "12px",
                      }}
                    >
                      Prev
                    </button>
                    <span style={{ fontSize: "12px", color: "#444" }}>
                      {filterBatch === "all"
                        ? `All (${totalPages} pages)`
                        : `Batch ${filterBatch} • Page ${currentPage} / ${totalPages}`}
                    </span>
                    <button
                      className="adash__btn adash__btn--ghost"
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => {
                        const np = Math.min(totalPages, currentPage + 1);
                        setCurrentPage(np);
                      }}
                      style={{
                        height: "30px",
                        padding: "0 10px",
                        fontSize: "12px",
                      }}
                    >
                      Next
                    </button>
                    {totalLogs > 0 && (
                      <span style={{ fontSize: "11px", color: "#666" }}>
                        Showing {shownFrom} - {shownTo} of {totalLogs}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="adash__table-wrap">
                <table className="adash__table">
                  <thead>
                    <tr>
                      <th style={{ cursor: "default" }}>No.</th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const f = "batch_number";
                          if (logsSortField === f)
                            setLogsSortOrder((o) =>
                              o === "asc" ? "desc" : "asc",
                            );
                          else {
                            setLogsSortField(f);
                            setLogsSortOrder("desc");
                          }
                        }}
                      >
                        Batch {" "}
                        {logsSortField === "batch_number"
                          ? logsSortOrder === "asc"
                            ? "▲"
                            : "▼"
                          : ""}
                      </th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const f = "id";
                          if (logsSortField === f)
                            setLogsSortOrder((o) =>
                              o === "asc" ? "desc" : "asc",
                            );
                          else {
                            setLogsSortField(f);
                            setLogsSortOrder("asc");
                          }
                        }}
                      >
                        ID{" "}
                        {logsSortField === "id"
                          ? logsSortOrder === "asc"
                            ? "▲"
                            : "▼"
                          : ""}
                      </th>
                      <th style={{ cursor: "default" }}>Image</th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const f = "operator";
                          if (logsSortField === f)
                            setLogsSortOrder((o) =>
                              o === "asc" ? "desc" : "asc",
                            );
                          else {
                            setLogsSortField(f);
                            setLogsSortOrder("asc");
                          }
                        }}
                      >
                        Operator{" "}
                        {logsSortField === "operator"
                          ? logsSortOrder === "asc"
                            ? "▲"
                            : "▼"
                          : ""}
                      </th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const f = "component";
                          if (logsSortField === f)
                            setLogsSortOrder((o) =>
                              o === "asc" ? "desc" : "asc",
                            );
                          else {
                            setLogsSortField(f);
                            setLogsSortOrder("asc");
                          }
                        }}
                      >
                        Component{" "}
                        {logsSortField === "component"
                          ? logsSortOrder === "asc"
                            ? "▲"
                            : "▼"
                          : ""}
                      </th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const f = "model";
                          if (logsSortField === f)
                            setLogsSortOrder((o) =>
                              o === "asc" ? "desc" : "asc",
                            );
                          else {
                            setLogsSortField(f);
                            setLogsSortOrder("asc");
                          }
                        }}
                      >
                        Model{" "}
                        {logsSortField === "model"
                          ? logsSortOrder === "asc"
                            ? "▲"
                            : "▼"
                          : ""}
                      </th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const f = "decision";
                          if (logsSortField === f)
                            setLogsSortOrder((o) =>
                              o === "asc" ? "desc" : "asc",
                            );
                          else {
                            setLogsSortField(f);
                            setLogsSortOrder("asc");
                          }
                        }}
                      >
                        Decision{" "}
                        {logsSortField === "decision"
                          ? logsSortOrder === "asc"
                            ? "▲"
                            : "▼"
                          : ""}
                      </th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const f = "status";
                          if (logsSortField === f)
                            setLogsSortOrder((o) =>
                              o === "asc" ? "desc" : "asc",
                            );
                          else {
                            setLogsSortField(f);
                            setLogsSortOrder("asc");
                          }
                        }}
                      >
                        Status{" "}
                        {logsSortField === "status"
                          ? logsSortOrder === "asc"
                            ? "▲"
                            : "▼"
                          : ""}
                      </th>
                      <th style={{ cursor: "default" }}>Confidence</th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const f = "timestamp";
                          if (logsSortField === f)
                            setLogsSortOrder((o) =>
                              o === "asc" ? "desc" : "asc",
                            );
                          else {
                            setLogsSortField(f);
                            setLogsSortOrder("desc");
                          }
                        }}
                      >
                        Time{" "}
                        {logsSortField === "timestamp"
                          ? logsSortOrder === "asc"
                            ? "▲"
                            : "▼"
                          : ""}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDetectionLogs.map((log, idx) => {
                      // compute display number: global when showing all, otherwise per-batch starting at 1
                      const displayNo =
                        filterBatch === "all"
                          ? filteredSortedDetectionLogs.indexOf(log) + 1
                          : idx + 1;
                      // determine batch label: prefer explicit batch key, otherwise compute chunked batch number
                      const explicitBatch = getBatchKey(log);
                      let batchLabel = "-";
                      if (explicitBatch != null) batchLabel = String(explicitBatch);
                      else {
                        const globalIndex = filteredSortedDetectionLogs.indexOf(log);
                        if (globalIndex >= 0) {
                          const num = Math.floor(globalIndex / detectionLogsLimit) + 1;
                          batchLabel = `Batch ${num}`;
                        }
                      }

                      return (
                        <tr key={log.id}>
                          <td
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "12px",
                              color: "var(--text-3)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {displayNo}
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                            {Number(log.batch_number || 1)}
                          </td>
                          <td
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "12px",
                              color: "var(--text-3)",
                            }}
                          >
                            #{log.id}
                          </td>
                          <td>
                            {getDetectionLogImageSrc(log) ? (
                              <button
                                type="button"
                                className="adash__log-thumb-btn"
                                onClick={() => setSelectedLogPreview(log)}
                                aria-label={`Preview image for detection log ${log.id}`}
                              >
                                <img
                                  className="adash__log-thumb-img"
                                  src={getDetectionLogImageSrc(log)}
                                  alt={`Detection preview ${log.id}`}
                                  loading="lazy"
                                />
                              </button>
                            ) : (
                              <div className="adash__log-thumb-placeholder">
                                No image
                              </div>
                            )}
                          </td>
                          <td>{log.operator_name || log.operator}</td>
                          <td>{log.component_name || log.component}</td>
                          <td>{log.model_name || log.model_used}</td>
                          <td>
                            <span
                              className={`adash__decision-badge ${decisionClass(log.final_decision || log.system_decision)}`}
                            >
                              {log.final_decision || log.system_decision || "-"}
                            </span>
                          </td>
                          <td>{getStatus(log)}</td>
                          <td
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "12px",
                              color: "var(--text-3)",
                            }}
                          >
                            {formatConfidence(log)}
                          </td>
                          <td
                            style={{
                              color: "var(--text-3)",
                              fontSize: "12px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {new Date(
                              log.timestamp || log.created_at,
                            ).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {detectionLogs.length === 0 && (
                      <tr>
                        <td colSpan={11} className="adash__table-empty">
                          No detection logs yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedLogPreview &&
                getDetectionLogImageSrc(selectedLogPreview) && (
                  <motion.div
                    className="adash__preview-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSelectedLogPreview(null)}
                  >
                    <motion.div
                      className="adash__preview-modal"
                      initial={{ scale: 0.96, y: 12, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.96, y: 12, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="adash__preview-modal-header">
                        <div>
                          <div className="adash__card-label">
                            Detection preview
                          </div>
                          <h3>Log #{selectedLogPreview.id}</h3>
                        </div>
                        <button
                          type="button"
                          className="adash__btn adash__btn--ghost"
                          onClick={() => setSelectedLogPreview(null)}
                        >
                          <Icon.X />
                          Close
                        </button>
                      </div>
                      <img
                        className="adash__preview-image"
                        src={getDetectionLogImageSrc(selectedLogPreview)}
                        alt={`Detection preview ${selectedLogPreview.id}`}
                      />
                      <div className="adash__preview-meta">
                        <span>
                          {selectedLogPreview.operator_name ||
                            selectedLogPreview.operator}
                        </span>
                        <span>
                          {selectedLogPreview.component_name ||
                            selectedLogPreview.component}
                        </span>
                        <span>
                          {selectedLogPreview.model_name ||
                            selectedLogPreview.model_used}
                        </span>
                        <span>
                          Confidence: {formatConfidence(selectedLogPreview)}
                        </span>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
            </>
          )}

          {/* ── Settings ── */}
          {activePage === "settings" && (
            <>
              <div className="adash__section-header">
                <h3>
                  {editingSettingId
                    ? "Edit configuration"
                    : "Assign models & thresholds"}
                </h3>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  {editingSettingId && (
                    <button
                      className="adash__btn adash__btn--ghost"
                      type="button"
                      onClick={handleCancelEdit}
                    >
                      <Icon.X />
                      Cancel
                    </button>
                  )}
                  <button
                    className="adash__btn adash__btn--primary"
                    onClick={handleSubmit}
                    disabled={!canSaveSettings}
                    type="button"
                  >
                    <Icon.Save />
                    {editingSettingId ? "Update config" : "Save config"}
                  </button>
                </div>
              </div>

              {formError && (
                <div className="adash__notice adash__notice--error">
                  {formError}
                </div>
              )}

              <div className="adash__settings-shell">
                <div className="adash__settings-summary">
                  <div className="adash__settings-summary-item">
                    <span>Product</span>
                    <strong>{selectedSettings.product}</strong>
                  </div>
                  <div className="adash__settings-summary-item">
                    <span>Model</span>
                    <strong>{selectedSettings.model}</strong>
                  </div>
                  <div className="adash__settings-summary-item">
                    <span>Operator</span>
                    <strong>{selectedSettings.operator}</strong>
                  </div>
                  <div className="adash__settings-summary-item">
                    <span>Threshold</span>
                    <strong>{selectedSettings.threshold}</strong>
                  </div>
                </div>

                <div className="adash__form-grid adash__form-grid--settings">
                  <div className="adash__field">
                    <label>Product</label>
                    <select
                      value={form.product}
                      onChange={(e) => {
                        const nextProduct = e.target.value;
                        const nextCompatibleModels =
                          getCompatibleModelsForProduct(models, nextProduct);
                        setForm((current) => ({
                          ...current,
                          product: nextProduct,
                          model: nextCompatibleModels.some(
                            (model) =>
                              String(model.id) === String(current.model),
                          )
                            ? current.model
                            : String(nextCompatibleModels[0]?.id || ""),
                        }));
                      }}
                      disabled={components.length === 0}
                    >
                      <option value="" disabled>
                        Select a product
                      </option>
                      {components.map((component) => (
                        <option key={component.id} value={component.id}>
                          {component.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="adash__field">
                    <label>Model</label>
                    <select
                      value={form.model}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          model: e.target.value,
                        }))
                      }
                      disabled={compatibleModels.length === 0}
                    >
                      <option value="" disabled>
                        {selectedProduct
                          ? compatibleModels.length > 0
                            ? "Select a model"
                            : "No compatible models"
                          : "Choose a product first"}
                      </option>
                      {compatibleModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}{" "}
                          {model.version ? `(${model.version})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="adash__field">
                    <label>Operator</label>
                    <select
                      value={form.operator}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          operator: e.target.value,
                        }))
                      }
                      disabled={operators.length === 0}
                    >
                      <option value="" disabled>
                        Select an operator
                      </option>
                      {operators.map((operator) => (
                        <option key={operator.id} value={operator.id}>
                          {operator.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="adash__field adash__field--full">
                    <label>Threshold</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={form.threshold}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          threshold: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="adash__section-header adash__section-header--compact">
                <div>
                  <h3>Existing configurations</h3>
                  <div className="adash__section-subtitle">
                    Review, edit, or remove active routing rules.
                  </div>
                </div>
                <span className="adash__section-badge">
                  {settings.length} saved
                </span>
              </div>

              <div className="adash__table-wrap adash__table-wrap--settings">
                <table className="adash__table adash__table--settings">
                  <thead>
                    <tr>
                      <th>Operator</th>
                      <th>Product</th>
                      <th>Model</th>
                      <th>Threshold</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.map((setting) => (
                      <tr key={setting.id}>
                        <td style={{ fontWeight: 500 }}>
                          {setting.operator_name}
                        </td>
                        <td>
                          {setting.product_name || setting.component_name}
                        </td>
                        <td>{setting.model_name}</td>
                        <td
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "13px",
                          }}
                        >
                          {Number(
                            setting.threshold ?? setting.confidence_threshold,
                          ).toFixed(2)}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              className="adash__btn adash__btn--ghost"
                              onClick={() => handleEdit(setting)}
                              type="button"
                              style={{
                                height: "30px",
                                padding: "0 12px",
                                fontSize: "12px",
                              }}
                            >
                              <Icon.Edit />
                              Edit
                            </button>
                            <button
                              className="adash__btn adash__btn--danger"
                              onClick={() => handleDelete(setting.id)}
                              type="button"
                              style={{
                                height: "30px",
                                padding: "0 12px",
                                fontSize: "12px",
                              }}
                            >
                              <Icon.Trash />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {settings.length === 0 && (
                      <tr>
                        <td colSpan={5} className="adash__table-empty">
                          No configurations yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </motion.main>
    </motion.div>
  );
}

export default AdminDashboard;
