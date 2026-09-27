'use client';
import {forwardRef,useEffect,useRef,useState,type InputHTMLAttributes} from 'react';

// A number input for the line grid (task 3.3). While the rep types, each keystroke is a draft
// (the line's total, margin and floor warning follow it live); the value is saved on blur, on
// Enter, or after a short pause. Escape puts back the saved value. Out of focus it shows the
// line's current value, formatted.

/** How long a pause in typing is before the value saves on its own. */
export const AUTOSAVE_PAUSE_MS=1200;

export interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'defaultValue'> {
  /** The saved value, formatted for the input ("31.50", "12"). */
  value:string;
  /** Text -> value, or null when it isn't a valid entry yet. */
  parse:(text:string)=>number|null;
  /** Each keystroke: the parsed value, or null to drop the draft. */
  onDraft:(value:number|null)=>void;
  /** Saves a value. `session` is the same for every save while the field keeps focus. */
  onCommit:(value:number,session:string)=>void;
}

let sessions=0;

export const NumberField=forwardRef<HTMLInputElement,NumberFieldProps>(function NumberField({value,parse,onDraft,onCommit,onBlur,onFocus,onKeyDown,...rest},ref){
  const [text,setText]=useState<string|null>(null);
  const session=useRef('');
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const latest=useRef({text,parse,onCommit,onDraft});
  latest.current={text,parse,onCommit,onDraft};

  /**
   * Saves what is typed, if it is valid. `value` can't tell whether it changed (it already shows
   * the draft), so onCommit decides that against the saved line.
   */
  function commit(){
    clearTimeout(timer.current);
    const {text:typed,parse:toValue,onCommit:save,onDraft:drop}=latest.current;
    if(typed===null)return;
    const parsed=toValue(typed);
    if(parsed===null){drop(null);return;}
    save(parsed,session.current);
  }
  useEffect(()=>()=>clearTimeout(timer.current),[]);

  return <input ref={ref} {...rest} inputMode="decimal" autoComplete="off" value={text??value}
    onFocus={event=>{session.current=`s${++sessions}`;onFocus?.(event);}}
    onChange={event=>{
      const next=event.target.value;
      setText(next);
      onDraft(parse(next));
      clearTimeout(timer.current);
      timer.current=setTimeout(commit,AUTOSAVE_PAUSE_MS);
    }}
    onBlur={event=>{commit();setText(null);onBlur?.(event);}}
    onKeyDown={event=>{
      if(event.key==='Enter'){event.preventDefault();commit();setText(null);}
      else if(event.key==='Escape'){clearTimeout(timer.current);setText(null);onDraft(null);}
      onKeyDown?.(event);
    }}/>;
});
