/**
 * Google Sheets Integration for Campaign Dashboard
 * Fetches live campaign data via Google Sheets API
 */

import { google } from 'googleapis';

// Cache for sheet data
const dataCache = new Map<string, { data: string[][]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function createOAuthClient() {
  const credentials = process.env.GOOGLE_OAUTH_CREDENTIALS;
  const tokens = process.env.GOOGLE_OAUTH_TOKENS;

  if (!credentials || !tokens) {
    throw new Error('Google OAuth credentials not configured');
  }

  const parsedCredentials = JSON.parse(credentials);
  const parsedTokens = JSON.parse(tokens);

  const { client_secret, client_id } = parsedCredentials.installed || parsedCredentials.web || parsedCredentials;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:8080');
  oAuth2Client.setCredentials(parsedTokens);

  return oAuth2Client;
}

export async function fetchSheetData(spreadsheetId: string, forceRefresh = false): Promise<string[][]> {
  // Check cache first
  const cached = dataCache.get(spreadsheetId);
  if (!forceRefresh && cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const auth = await createOAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Try different sheet names
    const sheetNames = ['Campaign Data', 'Sheet1', 'Data'];
    let response = null;

    for (const sheetName of sheetNames) {
      try {
        response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:F`,
        });
        if (response.data.values && response.data.values.length > 0) {
          break;
        }
      } catch {
        // Try next sheet name
      }
    }

    if (!response || !response.data.values) {
      console.warn(`No data found in sheet ${spreadsheetId}`);
      return [];
    }

    const data = response.data.values as string[][];

    // Cache the result
    dataCache.set(spreadsheetId, {
      data,
      timestamp: Date.now()
    });

    return data;
  } catch (error) {
    console.error('Failed to fetch sheet data:', error);
    // Return cached data if available, even if stale
    if (cached) {
      console.log('Returning stale cached data');
      return cached.data;
    }
    return [];
  }
}

export function clearCache(spreadsheetId?: string) {
  if (spreadsheetId) {
    dataCache.delete(spreadsheetId);
  } else {
    dataCache.clear();
  }
}
