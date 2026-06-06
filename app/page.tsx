import { getTranslations } from 'next-intl/server';
import { LocaleToggle } from '@/components/LocaleToggle';

export default async function Home() {
  const t = await getTranslations('home');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-6xl font-semibold tracking-tight text-[var(--text)]">{t('title')}</h1>
      <p className="mt-4 text-sm text-[var(--muted)]">
        {t.rich('editHint', { code: (chunks) => <code>{chunks}</code> })}
      </p>
      <div className="mt-6">
        <LocaleToggle />
      </div>
    </main>
  );
}
