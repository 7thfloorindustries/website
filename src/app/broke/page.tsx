import NeonWall from '@/components/broke/NeonWall';
import Footer from '@/components/broke/Footer';

export const metadata = {
  title: 'HOME — BROKE',
  description: 'BROKE is an independent record label founded in New York City, empowering culturally impactful artists through innovative marketing and storytelling.',
};

export default function BrokeHomePage() {
  return (
    <main className="broke-main">
      <NeonWall />
      <Footer />
    </main>
  );
}
