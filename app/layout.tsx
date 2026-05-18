import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import Header from '@/components/Header';
import { TooltipProvider } from '@/components/ui/tooltip';

function resolveMetadataBase(): URL {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return new URL(configuredSiteUrl);
  }
  if (process.env.NODE_ENV === 'production') {
    return new URL('https://zinc-fusion-v16.vercel.app');
  }
  return new URL('http://localhost:4010');
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: 'ZINC Fusion V16',
  description: 'Institutional-Grade Commodity Intelligence',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <Suspense fallback={null}>
              <Header />
            </Suspense>
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
