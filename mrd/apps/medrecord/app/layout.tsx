import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@mrd/ui/globals.css';
import '@mrd/ui/themes/medrecord.css';
import { BrandedHeader } from '@/components/branded-header';
import { Sidebar } from '@/components/sidebar';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'MEDrecord',
  description: 'FHIR Repository and Healthcare Records Management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <div className="flex min-h-screen flex-col">
          <BrandedHeader 
            user={{ 
              name: 'Jan-Marc Verlinden', 
              initials: 'JV' 
            }} 
          />
          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-muted/30">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
