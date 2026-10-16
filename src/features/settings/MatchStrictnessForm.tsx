'use client';
import {useId,useState} from 'react';
import {SETTINGS_COPY} from './copy';
import {DEFAULT_LEVEL,LEVELS,STRICTNESS_LEVELS,type StrictnessLevel} from './strictness';
import s from './Settings.module.css';

// The Match strictness card on /settings (docs/boxt/plan.md B7, product rule 1): the levels from
// ./strictness.ts as a radio group, each with its one-line description, the default one marked
// with one "Default (recommended)" badge; what strictness does and who it applies to; Save, disabled until the
// choice differs from the saved level, which sends PUT /api/settings. The result is one plain line:
// role=status when saved, role=alert when not.

type Message={kind:'saved'|'error';text:string}|null;

async function readError(response:Response):Promise<string>{
  try{
    const body=await response.json() as {error?:unknown};
    return typeof body.error==='string'&&body.error?body.error:SETTINGS_COPY.saveFailed;
  }catch{
    return SETTINGS_COPY.saveFailed;
  }
}

export function MatchStrictnessForm({initial}:{initial:StrictnessLevel}){
  const [saved,setSaved]=useState(initial);
  const [choice,setChoice]=useState(initial);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<Message>(null);
  const id=useId();
  const titleId=`${id}-title`;

  const choose=(level:StrictnessLevel)=>{setChoice(level);setMessage(null);};

  async function save(){
    if(choice===saved)return;
    setSaving(true);
    setMessage(null);
    try{
      const response=await fetch('/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({matchStrictness:choice})});
      if(!response.ok){setMessage({kind:'error',text:await readError(response)});return;}
      const body=await response.json() as {matchStrictness:StrictnessLevel};
      const level=STRICTNESS_LEVELS.includes(body.matchStrictness)?body.matchStrictness:choice;
      setSaved(level);
      setChoice(level);
      setMessage({kind:'saved',text:SETTINGS_COPY.saved(LEVELS[level].label)});
    }catch{
      setMessage({kind:'error',text:SETTINGS_COPY.saveFailed});
    }finally{
      setSaving(false);
    }
  }

  return <form className={s.card} aria-labelledby={titleId} onSubmit={event=>{event.preventDefault();void save();}}>
    <div className={s.cardHead}>
      <h2 id={titleId} className={s.cardTitle}>{SETTINGS_COPY.cardTitle}</h2>
      <p className={s.explain}>{SETTINGS_COPY.explanation}</p>
      <p className={s.explain}>{SETTINGS_COPY.scope}</p>
    </div>

    <div role="radiogroup" aria-labelledby={titleId} className={s.options}>
      {STRICTNESS_LEVELS.map(level=>{
        const {label,description}=LEVELS[level];
        const descriptionId=`${id}-${level}`;
        const isDefault=level===DEFAULT_LEVEL;
        return <label key={level} className={s.option} data-checked={choice===level||undefined}>
          <input type="radio" name={`${id}-level`} value={level} className={s.radio}
            checked={choice===level} onChange={()=>choose(level)} disabled={saving} aria-describedby={descriptionId}/>
          <span className={s.optionText}>
            <span className={s.optionHead}>
              <span className={s.optionLabel}>{label}</span>
              {isDefault&&<span className={s.tag}>{SETTINGS_COPY.defaultTag}</span>}
            </span>
            <span id={descriptionId} className={s.optionDescription}>{description}</span>
          </span>
        </label>;
      })}
    </div>

    <div className={s.footer}>
      <p className={s.message} aria-live="polite">
        {message?.kind==='saved'&&<span role="status" className={s.saved}>{message.text}</span>}
        {message?.kind==='error'&&<span role="alert" className={s.error}>{message.text}</span>}
      </p>
      <button type="submit" className={s.primaryButton} disabled={saving||choice===saved}>{saving?SETTINGS_COPY.saving:SETTINGS_COPY.save}</button>
    </div>
  </form>;
}
