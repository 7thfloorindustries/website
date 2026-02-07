import type { InfluencerRole } from '@/lib/influencer/auth';

function isAdmin(role: InfluencerRole): boolean {
  return role === 'admin';
}

function canViewFinancials(role: InfluencerRole): boolean {
  return role === 'admin' || role === 'analyst';
}

export function shapeCampaignSummaryForRole<T extends Record<string, unknown>>(campaign: T, role: InfluencerRole): T {
  const output = { ...campaign };

  if (!isAdmin(role)) {
    delete output.org_id;
  }

  if (!canViewFinancials(role)) {
    delete output.budget;
    delete output.currency;
  }

  return output as T;
}

export function shapeCampaignDetailForRole<T extends Record<string, unknown>>(campaign: T, role: InfluencerRole): T {
  const output = { ...campaign };

  if (!isAdmin(role)) {
    delete output.org_id;
    delete output.archived;
  }

  if (!canViewFinancials(role)) {
    delete output.budget;
    delete output.currency;
  }

  return output as T;
}

export function shapeCreatorCampaignsForRole<T extends Record<string, unknown>>(campaigns: T[], role: InfluencerRole): T[] {
  if (canViewFinancials(role)) return campaigns;
  return campaigns.map((campaign) => {
    const output = { ...campaign };
    delete output.budget;
    return output;
  });
}

export function shapeStatsForRole<T extends Record<string, unknown>>(stats: T, role: InfluencerRole): T {
  if (canViewFinancials(role)) return stats;

  const output = { ...stats } as Record<string, unknown>;
  delete output.total_budget;

  const topGenres = output.top_genres;
  if (Array.isArray(topGenres)) {
    output.top_genres = topGenres.map((genre) => {
      if (!genre || typeof genre !== 'object') return genre;
      const genreRow = { ...genre } as Record<string, unknown>;
      delete genreRow.total_budget;
      return genreRow;
    });
  }

  return output as T;
}

export function shapeCreatorSummaryForRole<T extends Record<string, unknown>>(creator: T, role: InfluencerRole): T {
  if (canViewFinancials(role)) return creator;
  const output = { ...creator };
  delete output.cost_total_usd;
  return output as T;
}

export function shapeCreatorDetailForRole<T extends Record<string, unknown>>(creator: T, role: InfluencerRole): T {
  if (canViewFinancials(role)) return creator;
  const output = { ...creator };
  delete output.cost_total_usd;
  return output as T;
}
