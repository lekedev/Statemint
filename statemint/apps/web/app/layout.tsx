import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Statemint — AI Bank Statement Analyzer',
  description:
    'Upload your bank statement. Get instant spending insights, tax calculations, and financial clarity.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}