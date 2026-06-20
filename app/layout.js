import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  title: 'NexTurf ERP — Athletixcel Sports',
  description: 'Complete turf management, booking, billing, accounting & operations platform.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
