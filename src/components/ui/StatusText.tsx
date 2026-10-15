import s from './StatusText.module.css';
import {cx} from './cx';

/**
 * A row's status (plan U0; C_QOTable): the status in plain text and, only when something is wrong, one
 * red line under it ("Overdue", "Aging", "1 line below floor"). `positive` is the green word some lists
 * use for a finished state (C_ORBase "Shipped"). The words sit in an inline span inside each line, as the
 * frames' runtime draws a filled-in value (so a page-level frame diff pairs them, plan U3).
 */
export function StatusText({status,flag,tone='plain'}:{status:string;flag?:string|null;tone?:'plain'|'positive'}){
  return <>
    <div data-ui="status" className={cx(s.status,tone==='positive'&&s.positive)}><span>{status}</span></div>
    {flag&&<div data-ui="flag" className={s.flag}><span>{flag}</span></div>}
  </>;
}
