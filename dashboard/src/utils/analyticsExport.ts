/**
 * Phase 7 Plan 03 Task 2: Analytics export utilities.
 *
 * Handles CSV/JSON export download via Blob API (RESEARCH pitfall-5-safe pattern).
 */

// Construct API base URL inline to avoid import issues in node --test
const API_ORIGIN = (import.meta?.env?.VITE_API_URL ?? '').replace(/\/+$/, '');
const API_BASE_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

interface ExportParams {
  format: 'csv' | 'json';
  startDate?: Date;
  endDate?: Date;
  sessionId?: string;
}

/**
 * Build export URL with query parameters.
 */
export function buildExportUrl(params: ExportParams): string {
  const query = new URLSearchParams();
  query.set('format', params.format);

  if (params.startDate) {
    query.set('startDate', params.startDate.toISOString());
  }
  if (params.endDate) {
    query.set('endDate', params.endDate.toISOString());
  }
  if (params.sessionId) {
    query.set('sessionId', params.sessionId);
  }

  return `${API_BASE_URL}/analytics/export?${query}`;
}

/**
 * Trigger browser download of a Blob.
 *
 * Implements RESEARCH pitfall-5-safe pattern:
 * 1. createObjectURL
 * 2. Create temp anchor
 * 3. Click anchor
 * 4. revokeObjectURL
 * 5. Remove anchor
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();

  // Clean up
  URL.revokeObjectURL(url);
  document.body.removeChild(anchor);
}
