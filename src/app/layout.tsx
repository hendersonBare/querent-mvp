import type {Metadata} from 'next';
import './globals.css';
import './persona.css';
import './customer.css';
export const metadata:Metadata={title:'Querent | Herrick Industrial Supply',description:'Customer data, finally customer-facing.',icons:{icon:'/querent-logo.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
