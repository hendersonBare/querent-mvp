import {Mail,Phone} from 'lucide-react';

// A phone number and an email address as links, for the rep under the chat's clarifying reply
// (spec §3, task 2.2). They lived in the old contacts sidebar, which the customer site removed (plan U10).

const tel=(phone:string)=>`tel:${phone.replace(/[^+\d]/g,'')}`;
export const PhoneLink=({phone}:{phone:string})=><a className="cx-link" href={tel(phone)}><Phone size={14} aria-hidden="true"/>{phone}</a>;
/**
 * A long address wraps after the @ rather than mid-word. The label keeps the link's accessible name
 * the plain address (some engines read <wbr> as a space).
 */
export function MailLink({email}:{email:string}){
  const at=email.indexOf('@');
  return <a className="cx-link" href={`mailto:${email}`} aria-label={email}><Mail size={14} aria-hidden="true"/><span>{at<0?email:<>{email.slice(0,at+1)}<wbr/>{email.slice(at+1)}</>}</span></a>;
}
