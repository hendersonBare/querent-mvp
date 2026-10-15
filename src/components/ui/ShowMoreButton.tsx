import type {ButtonHTMLAttributes} from 'react';
import s from './ShowMoreButton.module.css';
import {cx} from './cx';

/** "Show N more" (plan U0): `table` under a table (C_QOTable), `lane` full width at a board lane's foot (C_QOBoard). */
export function ShowMoreButton({variant='table',className,...rest}:{variant?:'table'|'lane'}&ButtonHTMLAttributes<HTMLButtonElement>){
  return <button type="button" data-ui="more" className={cx(s.button,s[variant],className)} {...rest}/>;
}
