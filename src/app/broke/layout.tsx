import '@/styles/broke.css';
import Nav from '@/components/broke/Nav';
import GradientOverlay from '@/components/broke/GradientOverlay';
import MoneyRain from '@/components/broke/MoneyRain';
import BrokeCursor from '@/components/broke/BrokeCursor';

export const metadata = {
  title: 'BROKE',
  description: 'BROKE is an independent record label founded in New York City, empowering culturally impactful artists through innovative marketing and storytelling.',
};

export default function BrokeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="broke-page cursor-cash no-select">
      <Nav />
      {children}
      <GradientOverlay />
      <MoneyRain />
      <BrokeCursor />
    </div>
  );
}
