import { GENRE_KEYWORDS, BRAND_KEYWORDS, GENRE_TAXONOMY } from './genre-constants';

/**
 * Extract an artist name from a campaign title.
 * Common patterns:
 *   "Artist - Song Title"
 *   "Artist | Song Title"
 *   "Artist - \"Song Title\" Campaign"
 *   "Artist x Artist - Song"
 *   "Song Title - Artist" (less common, handled by keyword fallback)
 */
export function parseArtistFromTitle(title: string): string | null {
  if (!title) return null;

  let cleaned = title.trim();

  // Remove common suffixes: Campaign, Seeding, UGC, Targets template, etc.
  cleaned = cleaned
    .replace(/\s*(TikTok|IG|Instagram|Twitter|X|YouTube)\s*(Campaign|Seeding|Promo|Push)?/gi, '')
    .replace(/\s*(Campaign|Seeding|Promo|Push|Spike|Content|Tour|Event|Master|INTL|US|UK|MIX)\s*$/gi, '')
    .replace(/\s*Targets?\s*template\s*\d*/gi, '')
    .replace(/\s*\(?(January|February|March|April|May|June|July|August|September|October|November|December)\s*\/?\s*\d{0,4}\s*-?\s*\w*\)?\s*$/gi, '')
    .replace(/\s*\(?\d{1,2}\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}\)?/gi, '')
    .replace(/\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{0,4}/gi, '')
    .replace(/\s*\d{4}\s*$/g, '')
    .replace(/\s*-\s*$/g, '')
    .trim();

  // Remove trailing date ranges like "May 6-12 2024", "April-ongoing"
  cleaned = cleaned
    .replace(/\s+\w+\s+\d{1,2}\s*-\s*\d{1,2}\s*\d{0,4}\s*$/i, '')
    .replace(/\s+\w+-ongoing\s*$/i, '')
    .trim();

  // Try "Artist - Song" pattern (most common)
  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    let artist = dashMatch[1].trim();
    // Remove "feat." / "ft." / "featuring" from artist part
    artist = artist.replace(/\s*(feat\.?|ft\.?|featuring)\s+.+$/i, '').trim();
    // Remove content in brackets/parens from artist name
    artist = artist.replace(/\s*[\[\(].+?[\]\)]\s*/g, '').trim();
    if (artist.length >= 2 && artist.length <= 80) {
      return artist;
    }
  }

  // Try "Artist | Song" pattern
  const pipeMatch = cleaned.match(/^(.+?)\s*\|\s*(.+)$/);
  if (pipeMatch) {
    let artist = pipeMatch[1].trim();
    artist = artist.replace(/\s*(feat\.?|ft\.?|featuring)\s+.+$/i, '').trim();
    artist = artist.replace(/\s*[\[\(].+?[\]\)]\s*/g, '').trim();
    if (artist.length >= 2 && artist.length <= 80) {
      return artist;
    }
  }

  // Try "Artist \"Song\"" pattern (no separator, just quotes around song)
  const quoteMatch = cleaned.match(/^(.+?)\s+[""\u201C](.+?)[""\u201D]\s*.*$/);
  if (quoteMatch) {
    let artist = quoteMatch[1].trim();
    artist = artist.replace(/\s*(feat\.?|ft\.?|featuring)\s+.+$/i, '').trim();
    artist = artist.replace(/\s*[\[\(].+?[\]\)]\s*/g, '').trim();
    if (artist.length >= 2 && artist.length <= 80) {
      return artist;
    }
  }

  // Try "Artist X Brand/Artist" pattern (collab, uppercase X as separator)
  const xMatch = cleaned.match(/^(.+?)\s+[xX]\s+(.+)$/);
  if (xMatch) {
    let artist = xMatch[1].trim();
    artist = artist.replace(/\s*(feat\.?|ft\.?|featuring)\s+.+$/i, '').trim();
    artist = artist.replace(/\s*[\[\(].+?[\]\)]\s*/g, '').trim();
    if (artist.length >= 2 && artist.length <= 80) {
      return artist;
    }
  }

  // If the title is just a name-like string (1-4 words, no special chars)
  if (/^[A-Za-z0-9\s.'$&]+$/.test(cleaned) && cleaned.split(/\s+/).length <= 4) {
    return cleaned;
  }

  return null;
}

/**
 * Detect genre from a campaign title using keyword heuristics.
 * Returns null if no confident match is found (needs web search).
 */
export function detectGenreHeuristic(
  title: string
): { genre: string; confidence: 'high' | 'medium' | 'low' } | null {
  if (!title) return null;

  const titleLower = title.toLowerCase();
  const titleNormalized = titleLower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');

  // 1. Check for brand keywords first
  // Strip platform indicators so "TikTok Campaign" doesn't trigger brand detection
  const titleForBrands = title
    .replace(/\b(TikTok|Instagram|IG|Twitter|YouTube|Snapchat)\s*(Campaign|Seeding|Promo|Push|Content)?\b/gi, '')
    .trim();
  for (const brand of BRAND_KEYWORDS) {
    const brandLower = brand.toLowerCase();
    const brandRegex = new RegExp(`\\b${escapeRegex(brandLower)}\\b`, 'i');
    if (brandRegex.test(titleForBrands)) {
      return { genre: 'Brand', confidence: 'high' };
    }
  }

  // 2. Parse artist name and check against keyword maps
  const artist = parseArtistFromTitle(title);

  // Track matches: genre → score
  const scores: Record<string, number> = {};

  // 3. Check artist name against genre keyword maps
  if (artist) {
    const artistLower = artist.toLowerCase();
    for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
      for (const keyword of keywords) {
        const kwLower = keyword.toLowerCase();
        // Exact artist match (high confidence)
        if (artistLower === kwLower) {
          return { genre, confidence: 'high' };
        }
        // Artist contains keyword or keyword contains artist
        if (artistLower.includes(kwLower) || kwLower.includes(artistLower)) {
          scores[genre] = (scores[genre] || 0) + 3;
        }
      }
    }
  }

  // 4. Check full title against keyword maps
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    for (const keyword of keywords) {
      const kwLower = keyword.toLowerCase();
      // Only match keywords that are 3+ chars to avoid false positives
      if (kwLower.length < 3) continue;

      const kwRegex = new RegExp(`\\b${escapeRegex(kwLower)}\\b`, 'i');
      if (kwRegex.test(title)) {
        // Genre-descriptor keywords (like "Trap", "Rock", "EDM") get lower score
        // than artist-name matches
        const isGenreWord = kwLower.length <= 6 && !kwLower.includes(' ');
        scores[genre] = (scores[genre] || 0) + (isGenreWord ? 1 : 2);
      }
    }
  }

  // 5. Find best match
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  const [bestGenre, bestScore] = entries[0];
  const secondScore = entries.length > 1 ? entries[1][1] : 0;

  // Need clear winner
  if (bestScore >= 3 && bestScore > secondScore) {
    return { genre: bestGenre, confidence: 'high' };
  }
  if (bestScore >= 2 && bestScore > secondScore) {
    return { genre: bestGenre, confidence: 'medium' };
  }
  if (bestScore >= 1 && secondScore === 0) {
    return { genre: bestGenre, confidence: 'low' };
  }

  // Ambiguous — let search resolve it
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
