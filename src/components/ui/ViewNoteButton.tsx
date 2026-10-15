import type {ButtonHTMLAttributes} from 'react';
import s from './ViewNoteButton.module.css';
import {cx} from './cx';

/** A note shows as this button, never as its text (plan U0): `table` in a table row, `card` on a board card. */
export function ViewNoteButton({variant='table',className,...rest}:{variant?:'table'|'card'}&Omit<ButtonHTMLAttributes<HTMLButtonElement>,'children'>){
  return <button type="button" data-ui="view-note" className={cx(s.button,s[variant],className)} {...rest}>View note</button>;
}
