import type { Metadata } from 'next';
import { ThemeProvider } from '../components/theme-provider';
import type { ReactNode } from 'react';
import { AuthProvider } from '../components/auth-provider';
import { ToastProvider } from '../components/toast-provider';
import { companyName } from '../lib/app-config';
import './globals.css';

export const metadata: Metadata = {
  title: companyName,
  description: 'Open-source collaborative task and sprint management.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="system" disableTransitionOnChange>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
