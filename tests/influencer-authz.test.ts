import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, describe, test } from 'node:test';
import type { NeonQueryFunctionInTransaction } from '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { ensureCreatorCoreSchema } from '../src/lib/creatorcore/schema';
import { hashInfluencerPassword } from '../src/lib/influencer/password';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required for influencer authz tests');
}

const PORT = 4037;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_ID = `it${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
const ORG_A = `org_a_${RUN_ID.slice(-8)}`;
const ORG_B = `org_b_${RUN_ID.slice(-8)}`;
const VIEWER_EMAIL = `${RUN_ID}.viewer@example.com`;
const VIEWER_PASSWORD = `Viewer-${RUN_ID}-Pass!`;
const ADMIN_EMAIL = `${RUN_ID}.admin@example.com`;
const ADMIN_PASSWORD = `Admin-${RUN_ID}-Pass!`;
const VIEWER_USER_ID = `${RUN_ID}_viewer`;
const ADMIN_USER_ID = `${RUN_ID}_admin`;
const CAMPAIGN_A_ID = `${RUN_ID}_campaign_a`;
const CAMPAIGN_B_ID = `${RUN_ID}_campaign_b`;
const CAMPAIGN_PENDING_ID = `${RUN_ID}_cp`;
const CAMPAIGN_PLATFORM_ONLY_ID = `${RUN_ID}_cp2`;
const CAMPAIGN_GENRE_JAZZ_ID = `${RUN_ID}_gj`;
const CAMPAIGN_GENRE_POP_ID = `${RUN_ID}_gp`;
const CAMPAIGN_GENRE_ROCK_ID = `${RUN_ID}_gr`;
const CAMPAIGN_GENRE_UNKNOWN_ID = `${RUN_ID}_gu`;
const CAMPAIGN_A_SLUG = `${RUN_ID}-org-a`;
const CAMPAIGN_B_SLUG = `${RUN_ID}-org-b`;
const CAMPAIGN_PENDING_SLUG = `${RUN_ID}-pending`;
const CAMPAIGN_PLATFORM_ONLY_SLUG = `${RUN_ID}-platform-only`;
const CAMPAIGN_GENRE_JAZZ_SLUG = `${RUN_ID}-genre-jazz`;
const CAMPAIGN_GENRE_POP_SLUG = `${RUN_ID}-genre-pop`;
const CAMPAIGN_GENRE_ROCK_SLUG = `${RUN_ID}-genre-rock`;
const CAMPAIGN_GENRE_UNKNOWN_SLUG = `${RUN_ID}-genre-unknown`;
const PENDING_PROMOTION_POST_ID = `${RUN_ID}_pp`;
const PENDING_CREATOR = `${RUN_ID}_pc`;
const CREATOR_A = `${RUN_ID}_creator_a`;
const CREATOR_B = `${RUN_ID}_creator_b`;
const CREATOR_SHARED = `${RUN_ID}_creator_shared`;
const SHARED_POST_ID = `${RUN_ID}_post_shared`;
const SHARED_POST_A_ID = `${RUN_ID}_post_shared_a`;
const SOURCE_A = `${RUN_ID}_source_a`;
const SOURCE_B = `${RUN_ID}_source_b`;
const GENRE_POST_JAZZ_ID = `${RUN_ID}_gjp`;
const GENRE_POST_POP_ID = `${RUN_ID}_gpp`;
const GENRE_POST_ROCK_ID = `${RUN_ID}_grp`;
const GENRE_POST_UNKNOWN_ID = `${RUN_ID}_gup`;

const sql = neon(DATABASE_URL);
let devServer: ChildProcess | null = null;
let campaignPkA = 0;
let campaignPkB = 0;
let campaignPkPending = 0;
let viewerCookie = '';
let adminCookie = '';

type TxQuery = NeonQueryFunctionInTransaction<false, false>;

async function runSystemQueries(buildQueries: (tx: TxQuery) => ReturnType<TxQuery>[]) {
  const results = await sql.transaction((tx) => [
    tx`SELECT set_config('app.current_org_id', '', true)`,
    tx`SELECT set_config('app.current_role', 'system', true)`,
    ...buildQueries(tx),
  ]);
  return results.slice(2);
}

async function waitForServerReady() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/influencers/auth`, { cache: 'no-store' });
      if (res.ok) return;
    } catch {
      // Server not ready yet.
    }
    await delay(1000);
  }
  throw new Error('Dev server did not become ready in time');
}

function clearStaleNextDevLock() {
  const lockPath = join(process.cwd(), '.next', 'dev', 'lock');
  if (existsSync(lockPath)) {
    rmSync(lockPath, { force: true });
  }
}

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/influencers/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  assert.equal(response.status, 200, `Expected login to succeed for ${email}`);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'Expected auth cookie to be set');
  const value = cookie.split(';')[0];
  assert.ok(value.startsWith('influencer_session='), 'Expected influencer_session cookie');
  return value;
}

describe('Influencer tenant isolation and role-based fields', () => {
  before(async () => {
    await ensureCreatorCoreSchema(sql);

    await sql`
      INSERT INTO influencer_organizations (id, slug, name)
      VALUES
        (${ORG_A}, ${`org-${RUN_ID}-a`}, ${`Test Org A ${RUN_ID}`}),
        (${ORG_B}, ${`org-${RUN_ID}-b`}, ${`Test Org B ${RUN_ID}`})
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      INSERT INTO cc_agencies (key, name, base_url, active)
      VALUES
        (${SOURCE_A}, ${`Agency A ${RUN_ID}`}, 'https://strega.creatorcore.co/api/1.1/obj', TRUE),
        (${SOURCE_B}, ${`Agency B ${RUN_ID}`}, 'https://sparkhouse.creatorcore.co/api/1.1/obj', TRUE)
      ON CONFLICT (key) DO UPDATE
      SET
        name = EXCLUDED.name,
        base_url = EXCLUDED.base_url,
        active = TRUE,
        updated_at = NOW()
    `;

    await sql`
      INSERT INTO influencer_users (id, email, password_hash, display_name, is_active)
      VALUES
        (${VIEWER_USER_ID}, ${VIEWER_EMAIL}, ${hashInfluencerPassword(VIEWER_PASSWORD)}, 'Viewer User', TRUE),
        (${ADMIN_USER_ID}, ${ADMIN_EMAIL}, ${hashInfluencerPassword(ADMIN_PASSWORD)}, 'Admin User', TRUE)
      ON CONFLICT (email) DO UPDATE
      SET
        password_hash = EXCLUDED.password_hash,
        display_name = EXCLUDED.display_name,
        is_active = TRUE,
        updated_at = NOW()
    `;

    await sql`
      INSERT INTO influencer_memberships (user_id, org_id, role)
      VALUES
        (${VIEWER_USER_ID}, ${ORG_A}, 'viewer'),
        (${ADMIN_USER_ID}, ${ORG_A}, 'admin')
      ON CONFLICT (user_id, org_id) DO UPDATE
      SET role = EXCLUDED.role
    `;

    const [insertedA] = await runSystemQueries((tx) => [
      tx.query(
        `
        INSERT INTO cc_campaigns (
          source_key, campaign_id, title, slug, budget, currency, org_id, platforms, created_at,
          archived, creator_count, total_posts, genre, thumbnail, last_synced_at, first_seen_at, last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), FALSE, 1, 1, 'Pop', NULL, NOW(), NOW(), NOW())
        ON CONFLICT (source_key, campaign_id) DO UPDATE
        SET title = EXCLUDED.title
        RETURNING id
        `,
        [SOURCE_A, CAMPAIGN_A_ID, `Campaign A ${RUN_ID}`, CAMPAIGN_A_SLUG, 1000, 'USD', ORG_A, 'TikTok']
      ),
    ]) as [Array<{ id: number | string }>];
    campaignPkA = Number(insertedA[0].id);

    const [insertedB] = await runSystemQueries((tx) => [
      tx.query(
        `
        INSERT INTO cc_campaigns (
          source_key, campaign_id, title, slug, budget, currency, org_id, platforms, created_at,
          archived, creator_count, total_posts, genre, thumbnail, last_synced_at, first_seen_at, last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), FALSE, 1, 1, 'Pop', NULL, NOW(), NOW(), NOW())
        ON CONFLICT (source_key, campaign_id) DO UPDATE
        SET title = EXCLUDED.title
        RETURNING id
        `,
        [SOURCE_B, CAMPAIGN_B_ID, `Campaign B ${RUN_ID}`, CAMPAIGN_B_SLUG, 2000, 'USD', ORG_B, 'TikTok']
      ),
    ]) as [Array<{ id: number | string }>];
    campaignPkB = Number(insertedB[0].id);

    const [insertedPending] = await runSystemQueries((tx) => [
      tx.query(
        `
        INSERT INTO cc_campaigns (
          source_key, campaign_id, title, slug, budget, currency, org_id, platforms, created_at,
          archived, creator_count, total_posts, genre, thumbnail, last_synced_at, first_seen_at, last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), FALSE, 0, 0, NULL, NULL, NOW(), NOW(), NOW())
        ON CONFLICT (source_key, campaign_id) DO UPDATE
        SET title = EXCLUDED.title
        RETURNING id
        `,
        [SOURCE_A, CAMPAIGN_PENDING_ID, `Pending ${RUN_ID}`, CAMPAIGN_PENDING_SLUG, null, null, ORG_A, null]
      ),
    ]) as [Array<{ id: number | string }>];
    campaignPkPending = Number(insertedPending[0].id);

    await runSystemQueries((tx) => [
      tx.query(
        `
        INSERT INTO cc_campaigns (
          source_key, campaign_id, title, slug, budget, currency, org_id, platforms, created_at,
          archived, creator_count, total_posts, genre, thumbnail, last_synced_at, first_seen_at, last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), FALSE, 0, 0, NULL, NULL, NOW(), NOW(), NOW())
        ON CONFLICT (source_key, campaign_id) DO UPDATE
        SET title = EXCLUDED.title
        `,
        [SOURCE_A, CAMPAIGN_PLATFORM_ONLY_ID, `Platform Only ${RUN_ID}`, CAMPAIGN_PLATFORM_ONLY_SLUG, null, null, ORG_A, 'TikTok']
      ),
    ]);

    await runSystemQueries((tx) => [
      tx.query(
        `
        INSERT INTO cc_campaigns (
          source_key, campaign_id, title, slug, budget, currency, org_id, platforms, created_at,
          archived, creator_count, total_posts, genre, thumbnail, last_synced_at, first_seen_at, last_seen_at
        )
        VALUES
          ($1, $2, $3, $4, 100, 'USD', $5, 'TikTok', NOW(), FALSE, 1, 1, 'Jazz', NULL, NOW(), NOW(), NOW()),
          ($6, $7, $8, $9, 100, 'USD', $10, 'TikTok', NOW(), FALSE, 1, 1, 'Pop', NULL, NOW(), NOW(), NOW()),
          ($11, $12, $13, $14, 100, 'USD', $15, 'TikTok', NOW(), FALSE, 1, 1, 'Rock', NULL, NOW(), NOW(), NOW()),
          ($16, $17, $18, $19, 100, 'USD', $20, 'TikTok', NOW(), FALSE, 1, 1, NULL, NULL, NOW(), NOW(), NOW())
        ON CONFLICT (source_key, campaign_id) DO UPDATE
        SET title = EXCLUDED.title
        `,
        [
          SOURCE_A,
          CAMPAIGN_GENRE_JAZZ_ID,
          `Genre Sort ${RUN_ID} Jazz`,
          CAMPAIGN_GENRE_JAZZ_SLUG,
          ORG_A,
          SOURCE_A,
          CAMPAIGN_GENRE_POP_ID,
          `Genre Sort ${RUN_ID} Pop`,
          CAMPAIGN_GENRE_POP_SLUG,
          ORG_A,
          SOURCE_A,
          CAMPAIGN_GENRE_ROCK_ID,
          `Genre Sort ${RUN_ID} Rock`,
          CAMPAIGN_GENRE_ROCK_SLUG,
          ORG_A,
          SOURCE_A,
          CAMPAIGN_GENRE_UNKNOWN_ID,
          `Genre Sort ${RUN_ID} Unknown`,
          CAMPAIGN_GENRE_UNKNOWN_SLUG,
          ORG_A,
        ]
      ),
    ]);

    await runSystemQueries((tx) => [
      tx.query(
        `
        INSERT INTO cc_posts (
          source_key, post_id, campaign_pk, username, platform, post_url, views, post_date, post_status, created_date
        )
        VALUES
          ($1, $2, $3, $4, 'TikTok', $5, 100, NOW(), 'Success', NOW()),
          ($6, $7, $8, $9, 'TikTok', $10, 200, NOW(), 'Success', NOW()),
          ($11, $12, (SELECT id FROM cc_campaigns WHERE source_key = $11 AND campaign_id = $13), $14, 'TikTok', $15, 100, NOW(), 'Success', NOW()),
          ($16, $17, (SELECT id FROM cc_campaigns WHERE source_key = $16 AND campaign_id = $18), $19, 'TikTok', $20, 200, NOW(), 'Success', NOW()),
          ($21, $22, (SELECT id FROM cc_campaigns WHERE source_key = $21 AND campaign_id = $23), $24, 'TikTok', $25, 300, NOW(), 'Success', NOW()),
          ($26, $27, (SELECT id FROM cc_campaigns WHERE source_key = $26 AND campaign_id = $28), $29, 'TikTok', $30, 50, NOW(), 'Success', NOW()),
          ($31, $32, $33, $34, 'TikTok', $35, 120, NOW(), 'Success', NOW()),
          ($36, $37, $38, $39, 'TikTok', $40, 140, NOW(), 'Success', NOW())
        ON CONFLICT (source_key, post_id) DO UPDATE
        SET views = EXCLUDED.views
        `,
        [
          SOURCE_A,
          `${RUN_ID}_post_a`,
          campaignPkA,
          CREATOR_A,
          `https://example.com/${RUN_ID}/a`,
          SOURCE_B,
          `${RUN_ID}_post_b`,
          campaignPkB,
          CREATOR_B,
          `https://example.com/${RUN_ID}/b`,
          SOURCE_A,
          GENRE_POST_JAZZ_ID,
          CAMPAIGN_GENRE_JAZZ_ID,
          `${RUN_ID}_creator_gj`,
          `https://example.com/${RUN_ID}/gj`,
          SOURCE_A,
          GENRE_POST_POP_ID,
          CAMPAIGN_GENRE_POP_ID,
          `${RUN_ID}_creator_gp`,
          `https://example.com/${RUN_ID}/gp`,
          SOURCE_A,
          GENRE_POST_ROCK_ID,
          CAMPAIGN_GENRE_ROCK_ID,
          `${RUN_ID}_creator_gr`,
          `https://example.com/${RUN_ID}/gr`,
          SOURCE_A,
          GENRE_POST_UNKNOWN_ID,
          CAMPAIGN_GENRE_UNKNOWN_ID,
          `${RUN_ID}_creator_gu`,
          `https://example.com/${RUN_ID}/gu`,
          SOURCE_B,
          SHARED_POST_ID,
          campaignPkB,
          CREATOR_SHARED,
          `https://example.com/${RUN_ID}/shared`,
          SOURCE_A,
          SHARED_POST_A_ID,
          campaignPkA,
          CREATOR_SHARED,
          `https://example.com/${RUN_ID}/shared-a`,
        ]
      ),
    ]);

    clearStaleNextDevLock();
    devServer = spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'ignore',
    });

    await waitForServerReady();
    viewerCookie = await login(VIEWER_EMAIL, VIEWER_PASSWORD);
    adminCookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  after(async () => {
    if (devServer) {
      devServer.kill('SIGTERM');
      devServer = null;
    }

    await runSystemQueries((tx) => [
      tx.query(
        'DELETE FROM cc_posts WHERE post_id = ANY($1)',
        [[
          `${RUN_ID}_post_a`,
          `${RUN_ID}_post_b`,
          SHARED_POST_ID,
          SHARED_POST_A_ID,
          PENDING_PROMOTION_POST_ID,
          GENRE_POST_JAZZ_ID,
          GENRE_POST_POP_ID,
          GENRE_POST_ROCK_ID,
          GENRE_POST_UNKNOWN_ID,
        ]]
      ),
      tx.query(
        'DELETE FROM cc_campaigns WHERE campaign_id = ANY($1)',
        [[
          CAMPAIGN_A_ID,
          CAMPAIGN_B_ID,
          CAMPAIGN_PENDING_ID,
          CAMPAIGN_PLATFORM_ONLY_ID,
          CAMPAIGN_GENRE_JAZZ_ID,
          CAMPAIGN_GENRE_POP_ID,
          CAMPAIGN_GENRE_ROCK_ID,
          CAMPAIGN_GENRE_UNKNOWN_ID,
        ]]
      ),
      tx.query(
        'DELETE FROM cc_creator_review_state WHERE username = ANY($1)',
        [[CREATOR_A.toLowerCase(), CREATOR_B.toLowerCase(), CREATOR_SHARED.toLowerCase(), PENDING_CREATOR.toLowerCase()]]
      ),
      tx.query(
        'DELETE FROM cc_creators WHERE username = ANY($1)',
        [[CREATOR_A.toLowerCase(), CREATOR_B.toLowerCase(), CREATOR_SHARED.toLowerCase(), PENDING_CREATOR.toLowerCase()]]
      ),
    ]);

    await sql`
      DELETE FROM influencer_memberships
      WHERE user_id = ${VIEWER_USER_ID}
         OR user_id = ${ADMIN_USER_ID}
    `;
    await sql`
      DELETE FROM influencer_users
      WHERE id = ${VIEWER_USER_ID}
         OR id = ${ADMIN_USER_ID}
    `;
    await sql`
      DELETE FROM influencer_organizations
      WHERE id = ${ORG_A}
         OR id = ${ORG_B}
    `;
    await sql`
      DELETE FROM cc_agency_platform_rates
      WHERE agency_key = ${SOURCE_A}
         OR agency_key = ${SOURCE_B}
    `;
    await sql`
      DELETE FROM cc_agencies
      WHERE key = ${SOURCE_A}
         OR key = ${SOURCE_B}
    `;
  });

  test('viewer cannot fetch another org campaign by slug tampering', async () => {
    const response = await fetch(`${BASE_URL}/api/influencers/campaign/${CAMPAIGN_B_SLUG}`, {
      headers: { Cookie: viewerCookie },
    });

    assert.equal(response.status, 404);
  });

  test('admin can fetch another org campaign', async () => {
    const response = await fetch(`${BASE_URL}/api/influencers/campaign/${CAMPAIGN_B_SLUG}`, {
      headers: { Cookie: adminCookie },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.campaign.slug, CAMPAIGN_B_SLUG);
    assert.equal(data.campaign.org_id, ORG_B);
  });

  test('viewer response omits admin-only fields, admin receives them', async () => {
    const viewerResponse = await fetch(`${BASE_URL}/api/influencers/campaign/${CAMPAIGN_A_SLUG}`, {
      headers: { Cookie: viewerCookie },
    });
    assert.equal(viewerResponse.status, 200);
    const viewerData = await viewerResponse.json();

    assert.equal(viewerData.campaign.org_id, undefined);
    assert.equal(viewerData.campaign.archived, undefined);
    assert.equal(viewerData.campaign.budget, undefined);
    assert.equal(viewerData.campaign.currency, undefined);

    const adminResponse = await fetch(`${BASE_URL}/api/influencers/campaign/${CAMPAIGN_A_SLUG}`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminResponse.status, 200);
    const adminData = await adminResponse.json();

    assert.equal(adminData.campaign.org_id, ORG_A);
    assert.equal(typeof adminData.campaign.archived, 'boolean');
    assert.equal(Number(adminData.campaign.budget), 1000);
    assert.equal(adminData.campaign.currency, 'USD');
  });

  test('pending intake campaigns stay out of main hub and auto-promote after hydration', async () => {
    const pendingSearch = encodeURIComponent(`Pending ${RUN_ID}`);
    const hydratedSearch = encodeURIComponent(`Hydrated ${RUN_ID}`);

    const mainBeforeResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${pendingSearch}&intake=main&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(mainBeforeResponse.status, 200);
    const mainBeforeData = await mainBeforeResponse.json() as { campaigns: Array<{ slug: string }> };
    assert.equal(mainBeforeData.campaigns.some((campaign) => campaign.slug === CAMPAIGN_PENDING_SLUG), false);

    const pendingBeforeResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${pendingSearch}&intake=pending&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(pendingBeforeResponse.status, 200);
    const pendingBeforeData = await pendingBeforeResponse.json() as { campaigns: Array<{ slug: string }> };
    assert.equal(pendingBeforeData.campaigns.some((campaign) => campaign.slug === CAMPAIGN_PENDING_SLUG), true);

    await runSystemQueries((tx) => [
      tx.query(
        `
        UPDATE cc_campaigns
        SET title = $2, platforms = $3, creator_count = 1, total_posts = 1, last_seen_at = NOW()
        WHERE campaign_id = $1 AND source_key = $4
        `,
        [CAMPAIGN_PENDING_ID, `Hydrated ${RUN_ID}`, 'TikTok', SOURCE_A]
      ),
      tx.query(
        `
        INSERT INTO cc_posts (
          source_key, post_id, campaign_pk, username, platform, post_url, views, post_date, post_status, created_date
        )
        VALUES ($1, $2, $3, $4, 'TikTok', $5, 999, NOW(), 'Success', NOW())
        ON CONFLICT (source_key, post_id) DO UPDATE
        SET views = EXCLUDED.views
        `,
        [
          SOURCE_A,
          PENDING_PROMOTION_POST_ID,
          campaignPkPending,
          PENDING_CREATOR,
          `https://example.com/${RUN_ID}/pending`,
        ]
      ),
    ]);

    const pendingAfterResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${hydratedSearch}&intake=pending&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(pendingAfterResponse.status, 200);
    const pendingAfterData = await pendingAfterResponse.json() as { campaigns: Array<{ slug: string }> };
    assert.equal(pendingAfterData.campaigns.some((campaign) => campaign.slug === CAMPAIGN_PENDING_SLUG), false);

    const mainAfterResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${hydratedSearch}&intake=main&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(mainAfterResponse.status, 200);
    const mainAfterData = await mainAfterResponse.json() as { campaigns: Array<{ slug: string }> };
    assert.equal(mainAfterData.campaigns.some((campaign) => campaign.slug === CAMPAIGN_PENDING_SLUG), true);
  });

  test('campaign with platform but zero posts is still classified as pending', async () => {
    const search = encodeURIComponent(`Platform Only ${RUN_ID}`);

    const mainResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${search}&intake=main&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(mainResponse.status, 200);
    const mainData = await mainResponse.json() as { campaigns: Array<{ slug: string }> };
    assert.equal(mainData.campaigns.some((campaign) => campaign.slug === CAMPAIGN_PLATFORM_ONLY_SLUG), false);

    const pendingResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${search}&intake=pending&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(pendingResponse.status, 200);
    const pendingData = await pendingResponse.json() as {
      campaigns: Array<{ slug: string; is_pending_intake?: boolean }>;
    };
    const row = pendingData.campaigns.find((campaign) => campaign.slug === CAMPAIGN_PLATFORM_ONLY_SLUG);
    assert.ok(row, 'Expected platform-only campaign in pending intake');
    assert.equal(Boolean(row?.is_pending_intake), true);
  });

  test('campaign API supports genre sorting with null genres last and preserves existing sort keys', async () => {
    const search = encodeURIComponent(`Genre Sort ${RUN_ID}`);

    const ascResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${search}&intake=all&sort=genre_asc&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(ascResponse.status, 200);
    const ascData = await ascResponse.json() as {
      campaigns: Array<{ title: string; genre: string | null }>;
    };
    const ascRows = ascData.campaigns.filter((campaign) => campaign.title.includes(`Genre Sort ${RUN_ID}`));
    assert.deepEqual(
      ascRows.map((campaign) => campaign.genre),
      ['Jazz', 'Pop', 'Rock', 'Unclassified']
    );

    const descResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${search}&intake=all&sort=genre_desc&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(descResponse.status, 200);
    const descData = await descResponse.json() as {
      campaigns: Array<{ title: string; genre: string | null }>;
    };
    const descRows = descData.campaigns.filter((campaign) => campaign.title.includes(`Genre Sort ${RUN_ID}`));
    assert.deepEqual(
      descRows.map((campaign) => campaign.genre),
      ['Rock', 'Pop', 'Jazz', 'Unclassified']
    );

    const viewsResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${search}&intake=all&sort=views_desc&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(viewsResponse.status, 200);
    const viewsData = await viewsResponse.json() as {
      campaigns: Array<{ title: string; total_views: string | number }>;
    };
    const viewRows = viewsData.campaigns.filter((campaign) => campaign.title.includes(`Genre Sort ${RUN_ID}`));
    assert.equal(viewRows[0]?.title, `Genre Sort ${RUN_ID} Rock`);
    assert.equal(viewRows[1]?.title, `Genre Sort ${RUN_ID} Pop`);
    assert.equal(viewRows[2]?.title, `Genre Sort ${RUN_ID} Jazz`);
  });

  test('opening campaign detail marks it reviewed and removes it from needs-review queue', async () => {
    const search = encodeURIComponent(`Campaign A ${RUN_ID}`);

    await runSystemQueries((tx) => [
      tx.query('DELETE FROM cc_campaign_review_state WHERE campaign_pk = $1', [campaignPkA]),
    ]);

    const beforeResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${search}&review=needs_review&intake=all&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(beforeResponse.status, 200);
    const beforeData = await beforeResponse.json() as { campaigns: Array<{ slug: string }> };
    assert.equal(beforeData.campaigns.some((campaign) => campaign.slug === CAMPAIGN_A_SLUG), true);

    const detailResponse = await fetch(`${BASE_URL}/api/influencers/campaign/${CAMPAIGN_A_SLUG}`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(detailResponse.status, 200);

    const afterResponse = await fetch(
      `${BASE_URL}/api/influencers/campaigns?search=${search}&review=needs_review&intake=all&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(afterResponse.status, 200);
    const afterData = await afterResponse.json() as { campaigns: Array<{ slug: string }> };
    assert.equal(afterData.campaigns.some((campaign) => campaign.slug === CAMPAIGN_A_SLUG), false);
  });

  test('opening creator detail marks it reviewed even if cc_creators row is missing', async () => {
    await runSystemQueries((tx) => [
      tx.query('DELETE FROM cc_creator_review_state WHERE username = $1', [CREATOR_A.toLowerCase()]),
      tx.query('DELETE FROM cc_creators WHERE username = $1', [CREATOR_A.toLowerCase()]),
    ]);

    const beforeResponse = await fetch(
      `${BASE_URL}/api/influencers/creators?search=${encodeURIComponent(CREATOR_A)}&review=needs_review&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(beforeResponse.status, 200);
    const beforeData = await beforeResponse.json() as { creators: Array<{ username: string }> };
    assert.equal(beforeData.creators.some((creator) => creator.username === CREATOR_A), true);

    const detailResponse = await fetch(`${BASE_URL}/api/influencers/creator/${CREATOR_A}`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(detailResponse.status, 200);

    const afterResponse = await fetch(
      `${BASE_URL}/api/influencers/creators?search=${encodeURIComponent(CREATOR_A)}&review=needs_review&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(afterResponse.status, 200);
    const afterData = await afterResponse.json() as { creators: Array<{ username: string }> };
    assert.equal(afterData.creators.some((creator) => creator.username === CREATOR_A), false);
  });

  test('creators endpoint supports agency filtering and multi-agency tags', async () => {
    const adminResponse = await fetch(
      `${BASE_URL}/api/influencers/creators?search=${encodeURIComponent(CREATOR_SHARED)}&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(adminResponse.status, 200);
    const adminData = await adminResponse.json() as {
      creators: Array<{ username: string; agencies?: Array<{ key: string; name: string }> }>;
    };
    const sharedCreator = adminData.creators.find((creator) => creator.username === CREATOR_SHARED);
    assert.ok(sharedCreator, 'Expected shared creator in admin view');
    const agencyKeys = (sharedCreator?.agencies || []).map((agency) => agency.key).sort();
    assert.deepEqual(agencyKeys, [SOURCE_A, SOURCE_B].sort());

    const filteredAResponse = await fetch(
      `${BASE_URL}/api/influencers/creators?agency=${encodeURIComponent(SOURCE_A)}&search=${encodeURIComponent(CREATOR_SHARED)}&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(filteredAResponse.status, 200);
    const filteredAData = await filteredAResponse.json() as { creators: Array<{ username: string }> };
    assert.equal(filteredAData.creators.some((creator) => creator.username === CREATOR_SHARED), true);

    const filteredBResponse = await fetch(
      `${BASE_URL}/api/influencers/creators?agency=${encodeURIComponent(SOURCE_B)}&search=${encodeURIComponent(CREATOR_SHARED)}&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(filteredBResponse.status, 200);
    const filteredBData = await filteredBResponse.json() as { creators: Array<{ username: string }> };
    assert.equal(filteredBData.creators.some((creator) => creator.username === CREATOR_SHARED), true);

    const viewerFilteredBResponse = await fetch(
      `${BASE_URL}/api/influencers/creators?agency=${encodeURIComponent(SOURCE_B)}&search=${encodeURIComponent(CREATOR_SHARED)}&limit=200`,
      { headers: { Cookie: viewerCookie } }
    );
    assert.equal(viewerFilteredBResponse.status, 200);
    const viewerFilteredBData = await viewerFilteredBResponse.json() as { creators: Array<{ username: string }> };
    assert.equal(viewerFilteredBData.creators.some((creator) => creator.username === CREATOR_SHARED), false);
  });

  test('creator cost uses API + rate overrides for admin and redacts totals for viewer role', async () => {
    await runSystemQueries((tx) => [
      tx.query(
        `
        UPDATE cc_posts
        SET api_cost_usd = NULL
        WHERE source_key IN ($1, $2)
          AND post_id IN ($3, $4)
        `,
        [SOURCE_A, SOURCE_B, SHARED_POST_A_ID, SHARED_POST_ID]
      ),
      tx.query(
        `
        UPDATE cc_posts
        SET api_cost_usd = 50
        WHERE source_key = $1 AND post_id = $2
        `,
        [SOURCE_B, SHARED_POST_ID]
      ),
      tx.query(
        `
        INSERT INTO cc_agency_platform_rates (agency_key, platform, rate_per_post_usd, currency, updated_at)
        VALUES ($1, $2, $3, 'USD', NOW())
        ON CONFLICT (agency_key, platform) DO UPDATE
        SET rate_per_post_usd = EXCLUDED.rate_per_post_usd, updated_at = NOW()
        `,
        [SOURCE_A, 'tiktok', 25]
      ),
    ]);

    const adminResponse = await fetch(
      `${BASE_URL}/api/influencers/creators?search=${encodeURIComponent(CREATOR_SHARED)}&limit=200`,
      { headers: { Cookie: adminCookie } }
    );
    assert.equal(adminResponse.status, 200);
    const adminData = await adminResponse.json() as {
      creators: Array<{ username: string; cost_total_usd?: number; cost_source?: string }>;
    };
    const sharedCreator = adminData.creators.find((creator) => creator.username === CREATOR_SHARED);
    assert.ok(sharedCreator, 'Expected shared creator for cost validation');
    assert.equal(Number(sharedCreator?.cost_total_usd || 0), 75);
    assert.equal(sharedCreator?.cost_source, 'mixed');

    const viewerResponse = await fetch(
      `${BASE_URL}/api/influencers/creators?search=${encodeURIComponent(CREATOR_SHARED)}&limit=200`,
      { headers: { Cookie: viewerCookie } }
    );
    assert.equal(viewerResponse.status, 200);
    const viewerData = await viewerResponse.json() as {
      creators: Array<{ username: string; cost_total_usd?: number }>;
    };
    const viewerSharedCreator = viewerData.creators.find((creator) => creator.username === CREATOR_SHARED);
    assert.ok(viewerSharedCreator, 'Expected shared creator in viewer scope');
    assert.equal(viewerSharedCreator?.cost_total_usd, undefined);
  });
});
