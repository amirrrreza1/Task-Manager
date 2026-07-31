import type { Metadata } from 'next';
import { ThemeProvider } from '@appica/ui-react/providers/theme-provider';
import type { ReactNode } from 'react';
import { AuthProvider } from '../components/auth-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Task Manager',
  description: 'Open-source collaborative task and sprint management.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="system" disableTransitionOnChange>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
