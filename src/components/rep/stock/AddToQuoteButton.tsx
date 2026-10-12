'use client';
import {useState} from 'react';
import type {AddToQuoteTarget} from '@/server/rep/add-to-quote';
import type {ItemRow} from '@/server/rep/reference';
import s from '../reference/Records.module.css';
import {AddToQuoteDialog} from './AddToQuote';

/** The item page's green "Add to quote" (C_ST2), which opens the dialog (C_ST3). */
export function AddToQuoteButton({item,targets}:{item:ItemRow;targets:AddToQuoteTarget[]}){
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className={s.primaryButton} onClick={()=>setOpen(true)}>Add to quote</button>
    {open&&<AddToQuoteDialog item={item} targets={targets} onClose={()=>setOpen(false)}/>}
  </>;
}
