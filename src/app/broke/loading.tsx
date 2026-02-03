import BrokeLoading from '@/components/broke/BrokeLoading';

export default function Loading() {
  return (
    <main className="broke-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <BrokeLoading size="lg" />
    </main>
  );
}
