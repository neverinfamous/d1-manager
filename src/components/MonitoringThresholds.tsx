import React, { useState, useEffect } from "react";
import {
  getMonitoringThresholds,
  createDefaultThresholds,
  deleteMonitoringThreshold,
  updateMonitoringThreshold,
} from "../services/monitoringApi";
import { getDatabases } from "../services/databaseApi";
import type { MonitoringThreshold } from "../types/monitoring";
import type { D1Database } from "../types";
import { MONITORING_METRIC_LABELS, MONITORING_COMPARISON_LABELS } from "../types/monitoring";
import { Trash2, Plus, Edit2, Play, Check, X, AlertCircle } from "lucide-react";

export function MonitoringThresholds() {
  const [thresholds, setThresholds] = useState<MonitoringThreshold[]>([]);
  const [databases, setDatabases] = useState<D1Database[]>([]);
  const [selectedDbId, setSelectedDbId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [thData, dbData] = await Promise.all([
        getMonitoringThresholds(),
        getDatabases(),
      ]);
      setThresholds(thData);
      setDatabases(dbData);
      if (dbData.length > 0 && !selectedDbId) {
        setSelectedDbId(dbData[0].uuid);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load monitoring data");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSetup = async () => {
    if (!selectedDbId) return;
    const db = databases.find(d => d.uuid === selectedDbId);
    if (!db) return;
    try {
      setLoading(true);
      await createDefaultThresholds(db.uuid, db.name, 5 * 1024 * 1024 * 1024); // default 5GB
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to create default thresholds");
      setLoading(false);
    }
  };

  const handleToggle = async (t: MonitoringThreshold) => {
    try {
      await updateMonitoringThreshold(t.id, { enabled: !t.enabled });
      setThresholds((prev) => prev.map((th) => th.id === t.id ? { ...th, enabled: !th.enabled } : th));
    } catch (err: any) {
      setError(err.message || "Failed to update threshold");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this threshold?")) return;
    try {
      await deleteMonitoringThreshold(id);
      setThresholds((prev) => prev.filter((th) => th.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to delete threshold");
    }
  };

  if (loading && thresholds.length === 0) {
    return <div className="text-gray-400">Loading monitoring...</div>;
  }

  return (
    <div className="bg-card rounded-lg border shadow-sm p-6 mt-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-indigo-500" />
            Monitoring Alerts
          </h3>
          <p className="text-muted-foreground text-sm mt-1">Configure threshold webhooks for metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedDbId} 
            onChange={(e) => setSelectedDbId(e.target.value)}
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {databases.map(db => (
              <option key={db.uuid} value={db.uuid}>{db.name}</option>
            ))}
          </select>
          <button
            onClick={handleQuickSetup}
            disabled={loading || !selectedDbId}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Quick Setup
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-sm">
          {error}
        </div>
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
                    {MONITORING_METRIC_LABELS[t.metric_type] || t.metric_type}
                  </span>
                  <span className="text-muted-foreground text-sm bg-muted px-2 py-0.5 rounded-full">
                    {t.database_name}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1.5 flex items-center gap-3">
                  <span>Trigger when: {MONITORING_COMPARISON_LABELS[t.comparison]} {t.threshold_value}{t.metric_type === "storage_usage" ? "%" : t.metric_type === "query_latency" ? "ms" : ""}</span>
                  <span className="w-1 h-1 rounded-full bg-border"></span>
                  <span>Last value: {t.last_value !== null ? Number(t.last_value).toFixed(1) : "Unknown"}</span>
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
