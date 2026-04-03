import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@mrd/ui/globals.css';
import '@mrd/ui/themes/medrecord.css';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'MEDrecord',
  description: 'Healthcare records management platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
