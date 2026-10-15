import type {Metadata} from 'next';
import {Albert_Sans,Geist_Mono} from 'next/font/google';
import './globals.css';
import './tokens.css';

// The new UI's type (plan U0; docs/design/new-ui-style-guide.md "Type"): Albert Sans 400 to 800 for
// the UI, Geist Mono 400 and 500 for numbers and codes, self-hosted by next/font. Their variables sit
// on <html> so the tokens in tokens.css (--q-font-sans, --q-font-mono) resolve on every page. The
// fallback is the frames' own generic family, with no metric-adjusted fallback face, so the computed
// font-family reads exactly as in the frames ("Albert Sans", sans-serif).
const albertSans=Albert_Sans({subsets:['latin'],weight:['400','500','600','700','800'],variable:'--font-albert-sans',fallback:['sans-serif'],adjustFontFallback:false});
const geistMono=Geist_Mono({subsets:['latin'],weight:['400','500'],variable:'--font-geist-mono',fallback:['monospace'],adjustFontFallback:false});

export const metadata:Metadata={title:{default:'Querent | BOXT Packaging',template:'%s | Querent | BOXT Packaging'},description:'Match a customer\'s list to BOXT items and build the quote.',icons:{icon:'/querent-logo.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={`${albertSans.variable} ${geistMono.variable}`}><body>{children}</body></html>;}
