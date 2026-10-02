import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Relay OTP Console',
  description: 'Private control plane for the global OTP gateway',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
