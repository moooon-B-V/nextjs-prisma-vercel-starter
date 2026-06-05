import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { localeDir, type Locale } from '@/lib/i18n/locales';
import './globals.css';

export const metadata: Metadata = {
  title: 'Next.js + Prisma + Vercel + Neon starter',
  description:
    'Production-ready starter with the discovered gotchas baked in: postinstall prisma generate, DATABASE_URL_UNPOOLED for migrations, Prisma 7 conditional config, Node 22+.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale comes from the NEXT_LOCALE cookie (resolved in i18n/request.ts), so
  // <html lang/dir> is correct on the first byte — no client flash. Messages are
  // passed to the provider explicitly because cookie/no-routing mode does not
  // auto-supply them to client components.
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();

  return (
    <html lang={locale} dir={localeDir[locale]} className="h-full antialiased">
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
