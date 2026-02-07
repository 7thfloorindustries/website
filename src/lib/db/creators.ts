import { neon } from '@neondatabase/serverless';

function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return neon(connectionString);
}

export interface Creator {
  id: number;
  team_member: string;
  artist: string;
  ig_handle: string | null;
  twitter_handle: string | null;
  tiktok_handle: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreatorInsert {
  team_member: string;
  artist: string;
  ig_handle?: string | null;
  twitter_handle?: string | null;
  tiktok_handle?: string | null;
  active?: boolean;
}

export interface CreatorUpdate {
  team_member?: string;
  artist?: string;
  ig_handle?: string | null;
  twitter_handle?: string | null;
  tiktok_handle?: string | null;
  active?: boolean;
}

/**
 * Get all active creators (used by the scrape pipeline)
 */
export async function getActiveCreators(): Promise<Creator[]> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM creators
    WHERE active = TRUE
    ORDER BY artist ASC
  `;
  return result as Creator[];
}

/**
 * Get all creators (including inactive)
 */
export async function getAllCreators(): Promise<Creator[]> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM creators
    ORDER BY active DESC, artist ASC
  `;
  return result as Creator[];
}

/**
 * Add a new creator
 */
export async function addCreator(data: CreatorInsert): Promise<Creator> {
  const sql = getDb();
  const result = await sql`
    INSERT INTO creators (team_member, artist, ig_handle, twitter_handle, tiktok_handle, active)
    VALUES (
      ${data.team_member},
      ${data.artist},
      ${data.ig_handle || null},
      ${data.twitter_handle || null},
      ${data.tiktok_handle || null},
      ${data.active !== false}
    )
    RETURNING *
  `;
  return result[0] as Creator;
}

/**
 * Update a creator by ID
 */
export async function updateCreator(id: number, data: CreatorUpdate): Promise<Creator | null> {
  const sql = getDb();
  const result = await sql`
    UPDATE creators
    SET
      team_member = COALESCE(${data.team_member ?? null}, team_member),
      artist = COALESCE(${data.artist ?? null}, artist),
      ig_handle = CASE WHEN ${data.ig_handle !== undefined} THEN ${data.ig_handle ?? null} ELSE ig_handle END,
      twitter_handle = CASE WHEN ${data.twitter_handle !== undefined} THEN ${data.twitter_handle ?? null} ELSE twitter_handle END,
      tiktok_handle = CASE WHEN ${data.tiktok_handle !== undefined} THEN ${data.tiktok_handle ?? null} ELSE tiktok_handle END,
      active = COALESCE(${data.active ?? null}, active),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (result[0] as Creator) || null;
}

/**
 * Soft-delete: set active=false
 */
export async function deactivateCreator(id: number): Promise<Creator | null> {
  const sql = getDb();
  const result = await sql`
    UPDATE creators
    SET active = FALSE, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (result[0] as Creator) || null;
}
