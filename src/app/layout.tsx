import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Box } from '@mui/material';
import Navigation from '@/components/Navigation';
import ThemeProvider from '@/components/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'EdgeIQ Bets - Betting Leaderboards',
  description: 'Track your bets and compete on the leaderboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          <Navigation />
          <Box component="main">
            {children}
          </Box>
        </ThemeProvider>
      </body>
    </html>
  );
}

