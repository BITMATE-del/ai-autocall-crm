import './globals.css'
import type { Metadata } from 'next'
export const metadata:Metadata={title:'AI AUTOCALL CRM',description:'Multi-tenant AutoCall CRM SaaS'}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
