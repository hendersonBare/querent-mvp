import {redirect} from 'next/navigation';

/** `/` opens the quote creation tool. */
export default function Home():never{redirect('/quote-tool');}
