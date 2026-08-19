import type { ReactElement, FormEvent } from "react";
import { useState, useEffect } from "react";
import {
  getMonitoringThresholds,
  createDefaultThresholds,
  deleteMonitoringThreshold,
  updateMonitoringThreshold,
  createMonitoringThreshold,
} from "../services/monitoringApi";
import { api } from "../services/api";
import type { MonitoringThreshold } from "../types/monitoring";
import type { D1Database } from "../services/api";
import { METRIC_TYPE_LABELS } from "../types/monitoring";
import { Trash2, Plus, AlertCircle, Save, X } from "lucide-react";

const COMPARISON_LABELS: Record<string, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

export function MonitoringThresholds(): ReactElement {
  const [thresholds, setThresholds] = useState<MonitoringThreshold[]>([]);
  const [databases, setDatabases] = useState<D1Database[]>([]);
  const [selectedDbId, setSelectedDbId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newThreshold, setNewThreshold] = useState({
    metric_type: "storage_usage",
    comparison: "gt",
    threshold_value: 0,
    cooldown_hours: 6
  });

  const fetchData = async (): Promise<void> => {
    try {
      setLoading(true);
      const [thData, dbData] = await Promise.all([
        getMonitoringThresholds(),
        api.listDatabases(),
      ]);
      setThresholds(thData);
      setDatabases(dbData);
      if (dbData.length > 0 && !selectedDbId) {
        setSelectedDbId(dbData[0]?.uuid || "");
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load monitoring data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQuickSetup = async (): Promise<void> => {
    if (!selectedDbId) return;
    const db = databases.find(d => d.uuid === selectedDbId);
    if (!db) return;
    try {
      setLoading(true);
      await createDefaultThresholds(db.uuid, db.name, 5 * 1024 * 1024 * 1024); // default 5GB
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create default thresholds");
      setLoading(false);
    }
  };

  const handleAddCustom = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedDbId) return;
    const db = databases.find(d => d.uuid === selectedDbId);
    if (!db) return;
    
    try {
      setLoading(true);
      await createMonitoringThreshold({
        database_id: db.uuid,
        database_name: db.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metric_type: newThreshold.metric_type as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        comparison: newThreshold.comparison as any,
        threshold_value: Number(newThreshold.threshold_value),
        cooldown_hours: Number(newThreshold.cooldown_hours),
        enabled: true
      });
      setShowAddForm(false);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create threshold");
      setLoading(false);
    }
  };

  const handleToggle = async (t: MonitoringThreshold): Promise<void> => {
    try {
      const newEnabled = t.enabled ? 0 : 1;
      await updateMonitoringThreshold(t.id, { enabled: newEnabled === 1 });
      setThresholds((prev) => prev.map((th) => th.id === t.id ? { ...th, enabled: newEnabled } : th));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update threshold");
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm("Delete this threshold?")) return;
    try {
      await deleteMonitoringThreshold(id);
      setThresholds((prev) => prev.filter((th) => th.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete threshold");
    }
  };

  if (loading && thresholds.length === 0) {
    return <div className="text-gray-400">Loading monitoring...</div>;
  }

  return (
    <div className="bg-card rounded-lg border shadow-sm p-6 mt-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-6 gap-4">
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-indigo-500" />
            Monitoring Alerts
          </h3>
          <p className="text-muted-foreground text-sm mt-1">Configure threshold webhooks for metrics.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select 
              value={selectedDbId} 
              onChange={(e) => setSelectedDbId(e.target.value)}
              className="flex h-9 w-full sm:w-[200px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {databases.map(db => (
                <option key={db.uuid} value={db.uuid}>{db.name}</option>
              ))}
            </select>
            <button
              onClick={handleQuickSetup}
              disabled={loading || !selectedDbId}
              className="inline-flex h-9 items-center justify-center rounded-md border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition-colors gap-2 whitespace-nowrap"
            >
              Quick Setup
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              disabled={loading || !selectedDbId}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddCustom} className="mb-6 p-4 border rounded-md bg-muted/20 flex flex-col gap-4">
          <h4 className="font-medium text-sm">Create Custom Threshold</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Metric</label>
              <select
                value={newThreshold.metric_type}
                onChange={(e) => setNewThreshold({...newThreshold, metric_type: e.target.value})}
                className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Object.entries(METRIC_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Comparison</label>
              <select
                value={newThreshold.comparison}
                onChange={(e) => setNewThreshold({...newThreshold, comparison: e.target.value})}
                className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Object.entries(COMPARISON_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Value</label>
              <input
                type="number"
                required
                value={newThreshold.threshold_value}
                onChange={(e) => setNewThreshold({...newThreshold, threshold_value: Number(e.target.value)})}
                className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Cooldown (Hours)</label>
              <input
                type="number"
                required
                min="0"
                value={newThreshold.cooldown_hours}
                onChange={(e) => setNewThreshold({...newThreshold, cooldown_hours: Number(e.target.value)})}
                className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Save className="w-3 h-3 mr-2" /> Save
            </button>
          </div>
        </form>
      )}

      {thresholds.length === 0 && !loading ? (
        <div className="text-muted-foreground text-sm text-center py-8 border rounded-lg bg-muted/20">
          No monitoring thresholds configured. Select a database and click Quick Setup to add defaults.
        </div>
      ) : (
        <div className="space-y-4">
          {thresholds.map((t) => (
            <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted/30 rounded-lg border gap-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {METRIC_TYPE_LABELS[t.metric_type] || t.metric_type}
                  </span>
                  <span className="text-muted-foreground text-sm bg-muted px-2 py-0.5 rounded-full">
                    {t.database_name}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1.5 flex items-center gap-3">
                  <span>Trigger when: {COMPARISON_LABELS[t.comparison]} {t.threshold_value}{t.metric_type === "storage_usage" ? "%" : t.metric_type === "query_latency" ? "ms" : ""}</span>
                  <span className="w-1 h-1 rounded-full bg-border"></span>
                  <span>Last value: {t.last_value !== null ? t.last_value.toFixed(1) : "Unknown"}</span>
                  <span className="w-1 h-1 rounded-full bg-border"></span>
                  <span>Cooldown: {t.cooldown_hours}h</span>
                </div>
              </div>
              <div className="flex items-center gap-4 sm:ml-auto">
                <button
                  onClick={() => handleToggle(t)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    t.enabled ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                      t.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  title="Delete threshold"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
