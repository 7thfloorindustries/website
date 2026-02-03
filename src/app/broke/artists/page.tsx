import ArtistLink from '@/components/broke/ArtistLink';

export const metadata = {
  title: 'ARTISTS — BROKE',
  description: 'Artists signed to BROKE, an independent record label founded in New York City.',
};

// Placeholder artist data - edit this to add/remove artists
const artists = [
  { name: 'ARTIST ONE', href: 'https://instagram.com' },
  { name: 'ARTIST TWO', href: 'https://instagram.com' },
  { name: 'ARTIST THREE', href: 'https://instagram.com' },
  { name: 'ARTIST FOUR', href: 'https://instagram.com' },
  { name: 'ARTIST FIVE', href: 'https://instagram.com' },
];

export default function ArtistsPage() {
  return (
    <main className="broke-main broke-artists">
      <div className="broke-inner">
        {artists.map((artist) => (
          <ArtistLink key={artist.name} name={artist.name} href={artist.href} />
        ))}
      </div>
    </main>
  );
}
