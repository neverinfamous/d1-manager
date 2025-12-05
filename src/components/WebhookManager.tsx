/**
 * WebhookManager Component
 * 
 * Provides a UI for managing webhook configurations.
 * Supports creating, editing, deleting, and testing webhooks.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { webhookApi } from '../services/webhookApi';
import type { Webhook, WebhookEventType, WebhookInput } from '../types/webhook';
import { ALL_WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENT_DESCRIPTIONS } from '../types/webhook';
import { ErrorMessage } from '@/components/ui/error-message';

// Icons as inline SVGs for accessibility
const RefreshIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const EditIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const PlayIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
);

const BellIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const ShieldIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);

const LinkIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const CheckCircleIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const XCircleIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  </svg>
);

const LoaderIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export function WebhookManager(): React.ReactElement {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<Webhook | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [formEvents, setFormEvents] = useState<WebhookEventType[]>([]);
  const [formEnabled, setFormEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadWebhooks = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError('');
      const data = await webhookApi.list();
      setWebhooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWebhooks();
  }, [loadWebhooks]);

  const resetForm = (): void => {
    setFormName('');
    setFormUrl('');
    setFormSecret('');
    setFormEvents([]);
    setFormEnabled(true);
  };

  const openCreateDialog = (): void => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEditDialog = (webhook: Webhook): void => {
    setFormName(webhook.name);
    setFormUrl(webhook.url);
    setFormSecret(webhook.secret ?? '');
    try {
      setFormEvents(JSON.parse(webhook.events) as WebhookEventType[]);
    } catch {
      setFormEvents([]);
    }
    setFormEnabled(webhook.enabled === 1);
    setEditingWebhook(webhook);
  };

  const handleCreateWebhook = async (): Promise<void> => {
    if (!formName.trim() || !formUrl.trim() || formEvents.length === 0) {
      return;
    }

    setSubmitting(true);
    try {
      const input: WebhookInput = {
        name: formName.trim(),
        url: formUrl.trim(),
        secret: formSecret.trim() || null,
        events: formEvents,
        enabled: formEnabled,
      };
      await webhookApi.create(input);
      setShowCreateDialog(false);
      resetForm();
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create webhook');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateWebhook = async (): Promise<void> => {
    if (!editingWebhook || !formName.trim() || !formUrl.trim() || formEvents.length === 0) {
      return;
    }

    setSubmitting(true);
    try {
      const input: Partial<WebhookInput> = {
        name: formName.trim(),
        url: formUrl.trim(),
        secret: formSecret.trim() || null,
        events: formEvents,
        enabled: formEnabled,
      };
      await webhookApi.update(editingWebhook.id, input);
      setEditingWebhook(null);
      resetForm();
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update webhook');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWebhook = async (): Promise<void> => {
    if (!deletingWebhook) return;

    setSubmitting(true);
    try {
      await webhookApi.delete(deletingWebhook.id);
      setDeletingWebhook(null);
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete webhook');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestWebhook = async (webhookId: string): Promise<void> => {
    setTestingWebhook(webhookId);
    setTestResult(null);
    try {
      const result = await webhookApi.test(webhookId);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setTestingWebhook(null);
    }
  };

  const handleToggleEnabled = async (webhook: Webhook): Promise<void> => {
    try {
      await webhookApi.update(webhook.id, { enabled: webhook.enabled !== 1 });
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle webhook');
    }
  };

  const toggleEvent = (event: WebhookEventType): void => {
    setFormEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  };

  const parseEvents = (eventsJson: string): WebhookEventType[] => {
    try {
      return JSON.parse(eventsJson) as WebhookEventType[];
    } catch {
      return [];
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold">Webhooks</h2>
          <p className="text-muted-foreground mt-1">
            Configure HTTP notifications for database events
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void loadWebhooks()}
            disabled={loading}
            aria-label="Refresh webhooks"
          >
            <RefreshIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openCreateDialog} aria-label="Add new webhook">
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Webhook
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6">
          <ErrorMessage error={error} showTitle />
          {error.includes('migration') && (
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono">
              npx wrangler d1 execute d1-manager-metadata --remote --file=worker/migrations/004_add_webhooks.sql
            </div>
          )}
          <button
            type="button"
            onClick={() => setError('')}
            className="mt-2 underline text-sm text-destructive"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Test Result Toast */}
      {testResult && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg flex items-center gap-2 ${
            testResult.success
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
          role="status"
          aria-live="polite"
        >
          {testResult.success ? (
            <CheckCircleIcon className="h-5 w-5" />
          ) : (
            <XCircleIcon className="h-5 w-5" />
          )}
          {testResult.message}
          <button
            type="button"
            onClick={() => setTestResult(null)}
            className="ml-auto underline"
            aria-label="Dismiss test result"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12" role="status" aria-label="Loading webhooks">
          <LoaderIcon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && webhooks.length === 0 && (
        <div className="text-center py-12">
          <BellIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No webhooks configured</h3>
          <p className="text-muted-foreground mb-4">
            Add a webhook to receive notifications when database events occur
          </p>
          <Button onClick={openCreateDialog}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Your First Webhook
          </Button>
        </div>
      )}

      {/* Webhook List */}
      {!loading && webhooks.length > 0 && (
        <div className="space-y-4" role="list" aria-label="Webhooks">
          {webhooks.map((webhook) => {
            const events = parseEvents(webhook.events);
            return (
              <Card 
                key={webhook.id} 
                className={webhook.enabled === 0 ? 'opacity-60' : ''}
                role="listitem"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BellIcon className={`h-5 w-5 ${webhook.enabled === 1 ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {webhook.name}
                          {webhook.secret && (
                            <span title="HMAC signature enabled">
                              <ShieldIcon className="h-4 w-4 text-green-500" />
                              <span className="sr-only">HMAC signature enabled</span>
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <LinkIcon className="h-3 w-3" />
                          <span className="font-mono text-xs truncate max-w-[300px]">
                            {webhook.url}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          webhook.enabled === 1
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {webhook.enabled === 1 ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {events.map((event) => (
                      <span
                        key={event}
                        className="text-xs px-2 py-1 rounded bg-muted"
                        title={WEBHOOK_EVENT_DESCRIPTIONS[event]}
                      >
                        {WEBHOOK_EVENT_LABELS[event]}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Updated: {formatDate(webhook.updated_at)}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleTestWebhook(webhook.id)}
                        disabled={testingWebhook === webhook.id}
                        aria-label={`Test ${webhook.name} webhook`}
                      >
                        {testingWebhook === webhook.id ? (
                          <LoaderIcon className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <PlayIcon className="h-4 w-4 mr-1" />
                        )}
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleToggleEnabled(webhook)}
                        aria-label={`${webhook.enabled === 1 ? 'Disable' : 'Enable'} ${webhook.name}`}
                      >
                        {webhook.enabled === 1 ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(webhook)}
                        aria-label={`Edit ${webhook.name}`}
                      >
                        <EditIcon className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeletingWebhook(webhook)}
                        aria-label={`Delete ${webhook.name}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog || editingWebhook !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingWebhook(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
            </DialogTitle>
            <DialogDescription>
              Configure a webhook endpoint to receive event notifications
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Name</Label>
              <Input
                id="webhook-name"
                name="webhook-name"
                placeholder="My Webhook"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                aria-describedby="webhook-name-description"
              />
              <p id="webhook-name-description" className="text-xs text-muted-foreground">
                A descriptive name for this webhook
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL</Label>
              <Input
                id="webhook-url"
                name="webhook-url"
                type="url"
                placeholder="https://example.com/webhook"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                aria-describedby="webhook-url-description"
              />
              <p id="webhook-url-description" className="text-xs text-muted-foreground">
                The endpoint that will receive webhook POST requests
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-secret">Secret (optional)</Label>
              <Input
                id="webhook-secret"
                name="webhook-secret"
                type="password"
                placeholder="For HMAC signature verification"
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
                aria-describedby="webhook-secret-description"
              />
              <p id="webhook-secret-description" className="text-xs text-muted-foreground">
                If set, requests will include an X-Webhook-Signature header for verification
              </p>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Events</legend>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Select webhook events">
                {ALL_WEBHOOK_EVENTS.map((event) => (
                  <div key={event} className="flex items-center space-x-2">
                    <Checkbox
                      id={`event-${event}`}
                      checked={formEvents.includes(event)}
                      onCheckedChange={() => toggleEvent(event)}
                      aria-describedby={`event-${event}-description`}
                    />
                    <Label
                      htmlFor={`event-${event}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {WEBHOOK_EVENT_LABELS[event]}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="webhook-enabled"
                checked={formEnabled}
                onCheckedChange={(checked) => setFormEnabled(checked === true)}
              />
              <Label htmlFor="webhook-enabled" className="cursor-pointer">
                Enabled
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingWebhook(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void (editingWebhook ? handleUpdateWebhook() : handleCreateWebhook())}
              disabled={submitting || !formName.trim() || !formUrl.trim() || formEvents.length === 0}
            >
              {submitting && <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />}
              {editingWebhook ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deletingWebhook !== null} onOpenChange={() => setDeletingWebhook(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Webhook</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingWebhook?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingWebhook(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteWebhook()}
              disabled={submitting}
            >
              {submitting && <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

