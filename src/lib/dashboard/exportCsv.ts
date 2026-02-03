import type { LeaderboardEntry } from './types';

export function exportToCsv(data: LeaderboardEntry[], filename: string): void {
  const headers = [
    'Rank',
    'Handle',
    'Platform',
    'Followers',
    'Growth (7d)',
    'Growth %',
    'Posts (7d)',
    'Delta Posts',
    'Engagement Rate',
    'Delta Likes',
  ];

  const rows = data.map((entry) => [
    entry.rank.toString(),
    entry.handle,
    entry.platform,
    entry.followers.toString(),
    entry.deltaFollowers.toString(),
    entry.growthPercent.toFixed(2) + '%',
    entry.postsLast7d.toString(),
    entry.deltaPosts.toString(),
    entry.engagementRate !== undefined ? entry.engagementRate.toFixed(2) + '%' : 'N/A',
    entry.deltaLikes !== undefined ? entry.deltaLikes.toString() : 'N/A',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
