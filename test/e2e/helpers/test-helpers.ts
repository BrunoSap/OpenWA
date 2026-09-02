/**
 * E2E Test Helpers - Utilities for implementing E2E tests
 *
 * Usage:
 * import { createTestApp, createTestApiKey, waitForCondition } from './helpers/test-helpers';
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { applyGlobalValidation } from '../../../src/config/app-validation';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { ApiKeyRole } from '../../../src/modules/auth/entities/api-key.entity';
import { DataSource } from 'typeorm';

/**
 * Create and initialize test NestJS application
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  applyGlobalValidation(app);
  await app.init();
  return app;
}

/**
 * Create test API key for authentication
 */
export async function createTestApiKey(
  app: INestApplication,
  options: { name?: string; role?: ApiKeyRole } = {}
): Promise<{ key: string; keyId: string }> {
  const authService = app.get(AuthService);
  const { key, keyId } = await authService.createKey({
    name: options.name || 'e2e-test',
    role: options.role || ApiKeyRole.OPERATOR,
  });
  return { key, keyId };
}

/**
 * Wait for async condition with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; timeoutMessage?: string } = {}
): Promise<void> {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 100;
  const timeoutMessage = options.timeoutMessage || 'Condition timeout';

  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(timeoutMessage);
}

/**
 * Clean database tables for test isolation
 */
export async function cleanDatabase(
  app: INestApplication,
  connectionName: 'main' | 'data' = 'data'
): Promise<void> {
  const dataSource = app.get(DataSource, { strict: false });

  // Get all tables except migrations
  const tables = await dataSource.query(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name NOT LIKE 'sqlite_%'
    AND name != 'migrations'
  `);

  // Disable foreign keys temporarily
  await dataSource.query('PRAGMA foreign_keys = OFF');

  // Delete all data
  for (const { name } of tables) {
    await dataSource.query(`DELETE FROM ${name}`);
  }

  // Re-enable foreign keys
  await dataSource.query('PRAGMA foreign_keys = ON');
}

/**
 * Create test webhook endpoint (mock HTTP server)
 */
export class TestWebhookServer {
  private receivedPayloads: any[] = [];
  private server: any;
  public url: string = '';

  async start(port: number = 0): Promise<void> {
    const express = require('express');
    const app = express();
    app.use(express.json());

    app.post('/webhook', (req: any, res: any) => {
      this.receivedPayloads.push({
        body: req.body,
        headers: req.headers,
        timestamp: new Date(),
      });
      res.status(200).json({ received: true });
    });

    return new Promise((resolve) => {
      this.server = app.listen(port, () => {
        const address = this.server.address();
        this.url = `http://localhost:${address.port}/webhook`;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
    }
  }

  getReceivedPayloads(): any[] {
    return this.receivedPayloads;
  }

  clearPayloads(): void {
    this.receivedPayloads = [];
  }

  async waitForWebhook(
    timeout: number = 5000,
    expectedCount: number = 1
  ): Promise<any[]> {
    await waitForCondition(
      () => this.receivedPayloads.length >= expectedCount,
      { timeout, timeoutMessage: `Expected ${expectedCount} webhooks, got ${this.receivedPayloads.length}` }
    );
    return this.receivedPayloads;
  }
}

/**
 * Measure execution time
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

/**
 * Create test tenant
 */
export async function createTestTenant(
  app: INestApplication,
  options: { name?: string; email?: string } = {}
): Promise<string> {
  const dataSource = app.get(DataSource, { strict: false });
  const tenantId = `test-tenant-${Date.now()}`;

  await dataSource.query(`
    INSERT INTO tenants (id, name, email, status, createdAt, updatedAt)
    VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
  `, [tenantId, options.name || 'Test Tenant', options.email || 'test@example.com']);

  return tenantId;
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; initialDelay?: number; maxDelay?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 100;
  const maxDelay = options.maxDelay || 5000;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Assert webhook was called with expected payload
 */
export function assertWebhookCalled(
  webhookServer: TestWebhookServer,
  expectedPayload: Partial<any>
): void {
  const payloads = webhookServer.getReceivedPayloads();
  const found = payloads.some(payload =>
    Object.keys(expectedPayload).every(key =>
      JSON.stringify(payload.body[key]) === JSON.stringify(expectedPayload[key])
    )
  );

  if (!found) {
    throw new Error(
      `Expected webhook with payload ${JSON.stringify(expectedPayload)}, ` +
      `but received: ${JSON.stringify(payloads.map(p => p.body))}`
    );
  }
}

/**
 * Generate random test data
 */
export const testData = {
  phoneNumber: () => `5511${Math.floor(100000000 + Math.random() * 900000000)}`,
  email: () => `test-${Date.now()}@example.com`,
  sessionName: () => `test-session-${Date.now()}`,
  message: () => `Test message ${Date.now()}`,
  tenantName: () => `Test Tenant ${Date.now()}`,
};

/**
 * Wait for event to be emitted
 */
export async function waitForEvent(
  app: INestApplication,
  eventName: string,
  timeout: number = 5000
): Promise<any> {
  const EventEmitter2 = require('eventemitter2');
  const eventEmitter = app.get(EventEmitter2.EventEmitter2);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event ${eventName} not emitted within ${timeout}ms`));
    }, timeout);

    eventEmitter.once(eventName, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
