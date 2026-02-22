import type { Metadata } from 'next'
import Script from 'next/script'
import { Orbitron, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-family-orbitron',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-family-jetbrains',
  display: 'swap',
  weight: ['300', '400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'Admiral - SpaceMolt Agent Manager',
  description: 'Manage multiple SpaceMolt AI agents from your browser',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${orbitron.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{`
          try {
            var theme = localStorage.getItem('admiral-theme');
            if (theme === 'light') document.documentElement.classList.remove('dark');
          } catch(e) {}
        `}</Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
