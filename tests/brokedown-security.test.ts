import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE as deleteDashboardAuth, GET as getDashboardAuth, POST as postDashboardAuth } from '../src/app/api/dashboard-auth/route';
import { GET as getScrapeHealth } from '../src/app/api/admin/scrape-health/route';
import { POST as postScrape } from '../src/app/api/scrape/route';
import { isValidOrigin } from '../src/lib/security';
import { proxy } from '../src/proxy';

const ENV_KEYS = [
  'NODE_ENV',
  'BROKE_AUTH_ENFORCED',
  'BROKE_SESSION_SECRET',
  'DASHBOARD_PASSWORD',
  'CRON_SECRET',
  'CSRF_SECRET',
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]])
);
const mutableEnv = process.env as Record<string, string | undefined>;

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      mutableEnv[key] = value;
    }
  }
}

afterEach(() => {
  restoreEnv();
});

describe('Brokedown security controls', () => {
  test('dashboard auth fails closed when DASHBOARD_PASSWORD is missing', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.BROKE_SESSION_SECRET = 'test-session-secret';
    mutableEnv.CSRF_SECRET = 'test-csrf-secret';
    delete process.env.DASHBOARD_PASSWORD;

    // Get a valid CSRF token first
    const csrfRequest = new NextRequest('http://localhost/api/dashboard-auth', { method: 'GET' });
    const csrfResponse = await getDashboardAuth(csrfRequest);
    const { csrfToken } = await csrfResponse.json();

    const request = new NextRequest('http://localhost/api/dashboard-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'irrelevant', csrfToken }),
    });

    const response = await postDashboardAuth(request);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.success, false);
  });

  test('dashboard auth sets session cookie and GET validates it', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.DASHBOARD_PASSWORD = 'super-secret-password';
    mutableEnv.BROKE_SESSION_SECRET = 'test-session-secret';
    mutableEnv.CSRF_SECRET = 'test-csrf-secret';

    // First GET a CSRF token
    const csrfRequest = new NextRequest('http://localhost/api/dashboard-auth', {
      method: 'GET',
    });
    const csrfResponse = await getDashboardAuth(csrfRequest);
    const { csrfToken } = await csrfResponse.json();
    assert.ok(csrfToken, 'CSRF token should be returned from GET');

    const loginRequest = new NextRequest('http://localhost/api/dashboard-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'super-secret-password', csrfToken }),
    });

    const loginResponse = await postDashboardAuth(loginRequest);
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    assert.equal(loginBody.success, true);

    const setCookie = loginResponse.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /broke_session=/);

    const cookieHeader = setCookie.split(';')[0];
    const statusRequest = new NextRequest('http://localhost/api/dashboard-auth', {
      method: 'GET',
      headers: { cookie: cookieHeader },
    });

    const statusResponse = await getDashboardAuth(statusRequest);
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.authenticated, true);

    const logoutRequest = new NextRequest('http://localhost/api/dashboard-auth', {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    });
    const logoutResponse = await deleteDashboardAuth(logoutRequest);
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get('set-cookie') || '', /broke_session=;/);
  });

  test('proxy blocks unauthenticated /api/metrics requests', async () => {
    mutableEnv.BROKE_AUTH_ENFORCED = 'true';
    mutableEnv.BROKE_SESSION_SECRET = 'test-session-secret';
    mutableEnv.DASHBOARD_PASSWORD = 'super-secret-password';

    const request = new NextRequest('https://brokedown.app/api/metrics', {
      headers: { host: 'brokedown.app' },
    });

    const response = await proxy(request);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('proxy rewrites requests for www.brokedown.app', async () => {
    const request = new NextRequest('https://www.brokedown.app/about', {
      headers: { host: 'www.brokedown.app' },
    });

    const response = await proxy(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-middleware-rewrite'), 'https://www.brokedown.app/broke/about');
  });

  test('origin validation allows brokedown domains', () => {
    const apexRequest = new Request('https://brokedown.app/api/contact', {
      headers: { origin: 'https://brokedown.app' },
    });
    const wwwRequest = new Request('https://www.brokedown.app/api/contact', {
      headers: { origin: 'https://www.brokedown.app' },
    });

    assert.equal(isValidOrigin(apexRequest), true);
    assert.equal(isValidOrigin(wwwRequest), true);
  });

  test('proxy redirects unauthenticated dashboard requests to auth route', async () => {
    mutableEnv.BROKE_AUTH_ENFORCED = 'true';
    mutableEnv.BROKE_SESSION_SECRET = 'test-session-secret';
    mutableEnv.DASHBOARD_PASSWORD = 'super-secret-password';

    const request = new NextRequest('https://brokedown.app/broke/dashboard', {
      headers: { host: 'brokedown.app' },
    });

    const response = await proxy(request);
    assert.equal(response.status, 307);
    const location = response.headers.get('location') || '';
    assert.ok(location.includes('/broke/dashboard/auth'));
  });

  test('scrape endpoint fails closed when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET;

    const request = new NextRequest('http://localhost/api/scrape', {
      method: 'POST',
    });

    const response = await postScrape(request);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'CRON_SECRET is not configured');
  });

  test('scrape health endpoint requires auth', async () => {
    const request = new NextRequest('http://localhost/api/admin/scrape-health');
    const response = await getScrapeHealth(request);
    assert.equal(response.status, 401);
  });
});
