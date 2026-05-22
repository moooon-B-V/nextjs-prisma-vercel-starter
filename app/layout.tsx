import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Next.js + Prisma + Vercel + Neon starter',
  description:
    'Production-ready starter with the discovered gotchas baked in: postinstall prisma generate, DATABASE_URL_UNPOOLED for migrations, Prisma 7 conditional config, Node 22+.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
