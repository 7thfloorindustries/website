import { GENRE_TAXONOMY } from './genre-constants';
import type { NeonQueryFunction } from '@neondatabase/serverless';

interface GenreResult {
  genre: string;
  confidence: string;
}

/**
 * Search for an artist's genre using the Brave Search API.
 * Free tier: 2K queries/month, so we use this sparingly.
 */
export async function searchGenreViaBrave(artistName: string): Promise<GenreResult | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  try {
    const query = `"${artistName}" music genre`;
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;

    const response = await fetch(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Brave Search API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const results = data?.web?.results;
    if (!results || results.length === 0) return null;

    // Collect all text from search result titles and descriptions
    const searchText = results
      .map((r: { title?: string; description?: string }) =>
        `${r.title || ''} ${r.description || ''}`
      )
      .join(' ')
      .toLowerCase();

    // Score each genre by how many times it appears in search results
    const genreScores: Record<string, number> = {};

    const genreSearchTerms: Record<string, string[]> = {
      'Hip-Hop/Rap': ['hip-hop', 'hip hop', 'rap', 'rapper', 'trap', 'drill'],
      'Pop': ['pop', 'pop music', 'pop singer', 'pop artist'],
      'R&B': ['r&b', 'rnb', 'r and b', 'rhythm and blues', 'soul', 'neo-soul'],
      'Country': ['country', 'country music', 'country singer', 'nashville'],
      'Rock': ['rock', 'rock music', 'metal', 'punk', 'alternative rock'],
      'Electronic/EDM': ['electronic', 'edm', 'house', 'techno', 'dubstep', 'dj', 'dance music'],
      'Latin': ['latin', 'reggaeton', 'latin pop', 'latin music', 'corrido', 'regional mexicano'],
      'K-Pop': ['k-pop', 'kpop', 'k pop', 'korean pop', 'korean'],
      'Alternative': ['alternative', 'alt-rock', 'indie rock', 'alternative rock'],
      'Indie': ['indie', 'indie pop', 'indie folk', 'indie rock', 'bedroom pop'],
      'Afrobeats': ['afrobeats', 'afrobeat', 'afropop', 'amapiano', 'nigerian'],
      'Reggaeton': ['reggaeton', 'reggaetón', 'perreo', 'dembow'],
      'Gospel': ['gospel', 'christian', 'worship', 'ccm', 'christian music'],
      'Folk': ['folk', 'folk music', 'acoustic', 'singer-songwriter', 'americana'],
    };

    for (const [genre, terms] of Object.entries(genreSearchTerms)) {
      for (const term of terms) {
        const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = searchText.match(regex);
        if (matches) {
          genreScores[genre] = (genreScores[genre] || 0) + matches.length;
        }
      }
    }

    // Find the genre with the highest score
    const sortedGenres = Object.entries(genreScores).sort((a, b) => b[1] - a[1]);
    if (sortedGenres.length === 0) return null;

    const [bestGenre, bestScore] = sortedGenres[0];
    const secondScore = sortedGenres.length > 1 ? sortedGenres[1][1] : 0;

    // Determine confidence based on score gap
    let confidence: string;
    if (bestScore >= 4 && bestScore >= secondScore * 2) {
      confidence = 'high';
    } else if (bestScore >= 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Validate that the genre is in our taxonomy
    if (!GENRE_TAXONOMY.includes(bestGenre as (typeof GENRE_TAXONOMY)[number])) {
      return null;
    }

    return { genre: bestGenre, confidence };
  } catch (error) {
    console.error('Brave Search error:', error);
    return null;
  }
}

/**
 * Get genre for an artist, checking cache first, then Brave Search.
 * Caches results in cc_genre_cache for future lookups.
 */
export async function getOrSearchGenre(
  artistName: string,
  sql: NeonQueryFunction<false, false>
): Promise<GenreResult | null> {
  const normalizedArtist = artistName.trim().toLowerCase();
  if (!normalizedArtist) return null;

  // 1. Check cache first
  try {
    const cached = await sql`
      SELECT genre, confidence FROM cc_genre_cache
      WHERE LOWER(artist_name) = ${normalizedArtist}
      LIMIT 1
    `;
    if (cached.length > 0 && cached[0].genre) {
      return {
        genre: cached[0].genre as string,
        confidence: (cached[0].confidence as string) || 'medium',
      };
    }
    // If cached with null genre, we already searched and found nothing
    if (cached.length > 0 && !cached[0].genre) {
      return null;
    }
  } catch {
    // Cache miss or error, continue to search
  }

  // 2. Search via Brave
  const result = await searchGenreViaBrave(artistName);

  // 3. Cache result (even null results to avoid re-searching)
  const trimmedArtist = artistName.trim();
  const genre = result?.genre || null;
  const confidence = result?.confidence || null;
  try {
    await sql`
      INSERT INTO cc_genre_cache (artist_name, genre, confidence)
      VALUES (${trimmedArtist}, ${genre}, ${confidence})
      ON CONFLICT (artist_name) DO UPDATE SET
        genre = EXCLUDED.genre,
        confidence = EXCLUDED.confidence,
        searched_at = NOW()
    `;
  } catch (error) {
    console.error('Failed to cache genre result:', error);
  }

  return result;
}
