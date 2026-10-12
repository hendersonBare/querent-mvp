'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import type {RepProfileView} from '@/server/rep/profile';
import {RequestError,deletePicture,saveProfile,uploadPicture} from './api';
import {Card,Problem,SaveButton,SettingsFrame} from './parts';
import s from './Settings.module.css';

// Settings > Profile, a rep's (plan U9; C_RS2): their picture, name, phone and email, which customers see in
// the My rep sheet and on quotes. Upload picture picks a PNG, JPEG or WebP of 2 MB or less (the server checks
// the bytes again) and shows it at once; Remove goes back to the initials; Save profile stores the picture
// change and the fields (PUT or DELETE /api/rep/profile/picture, then PUT /api/rep/profile) and refreshes the
// page, so the rail shows the new name. No frame: the "Saved" line, one red line for a refused field or
// picture, and Remove doing nothing while there is no picture (decision 52).

const PICTURE_TYPES=['image/png','image/jpeg','image/webp'];
const PICTURE_MAX_BYTES=2*1024*1024;
type Field='name'|'phone'|'email';
const FIELDS:readonly {key:Field;label:string}[]=[{key:'name',label:'Name'},{key:'phone',label:'Phone'},{key:'email',label:'Email'}];
type Pending={kind:'upload';file:File;preview:string}|{kind:'remove'}|null;

export function RepProfile({initial,tabs}:{initial:RepProfileView;tabs:ReactNode}){
  const router=useRouter();
  const [profile,setProfile]=useState(initial);
  const [values,setValues]=useState<Record<Field,string>>({name:initial.name,phone:initial.phone,email:initial.email});
  const [pending,setPending]=useState<Pending>(null);
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[badField,setBadField]=useState<Field|'picture'|null>(null),[saved,setSaved]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const preview=pending?.kind==='upload'?pending.preview:null;
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);

  const picture=pending?.kind==='upload'?pending.preview:pending?.kind==='remove'?null:profile.picture_url;
  const changed=()=>{setSaved(false);setError('');setBadField(null);};

  function pick(file:File|undefined){
    if(fileRef.current)fileRef.current.value='';
    if(!file)return;
    changed();
    if(!PICTURE_TYPES.includes(file.type)){setError('Pick a PNG, JPEG or WebP picture.');setBadField('picture');return;}
    if(file.size>PICTURE_MAX_BYTES){setError('Pick a picture of 2 MB or less.');setBadField('picture');return;}
    setPending({kind:'upload',file,preview:URL.createObjectURL(file)});
  }

  async function save(){
    if(saving)return;
    setSaving(true);changed();
    try{
      let next=profile;
      if(pending?.kind==='upload')next=await uploadPicture(pending.file);
      else if(pending?.kind==='remove'&&profile.picture_url)next=await deletePicture();
      setPending(null);setProfile(next);
      next=await saveProfile({name:values.name,phone:values.phone,email:values.email});
      setProfile(next);setValues({name:next.name,phone:next.phone,email:next.email});
      setSaved(true);
      router.refresh();
    }catch(e){
      setError(e instanceof Error?e.message:'Your profile wasn’t saved. Try again.');
      const field=e instanceof RequestError?e.body?.field:null;
      setBadField(field==='name'||field==='phone'||field==='email'||field==='picture'?field:null);
    }finally{setSaving(false);}
  }

  return <SettingsFrame tabs={tabs}>
    <Card title="Profile" saved={saved} action={<SaveButton label="Save profile" drawnOff disabled={saving} onClick={()=>void save()}/>}>
      <Problem>{error}</Problem>
      <div className={s.profileBody}>
        <div className={s.pictureRow}>
          <div className={s.avatar}>{picture?<img src={picture} alt={profile.name}/>:profile.initials}</div>
          <div className={s.pictureSide}>
            <div className={s.floorName}>Picture</div>
            <div className={s.pictureActions}>
              <button type="button" className={s.plainButton} aria-invalid={badField==='picture'||undefined} onClick={()=>fileRef.current?.click()}>Upload picture</button>
              <button type="button" className={s.plainButton} onClick={()=>{changed();setPending(profile.picture_url?{kind:'remove'}:null);}}>Remove</button>
              <input ref={fileRef} type="file" accept={PICTURE_TYPES.join(',')} className={s.fileInput} tabIndex={-1} aria-hidden="true" onChange={e=>pick(e.target.files?.[0])}/>
            </div>
          </div>
        </div>
        <div className={s.profileFields}>
          {FIELDS.map(f=><div key={f.key}>
            <label className={s.fieldLabel} htmlFor={`profile-${f.key}`}>{f.label}</label>
            <input id={`profile-${f.key}`} type={f.key==='email'?'email':f.key==='phone'?'tel':'text'} className={s.textField} autoComplete={f.key==='phone'?'tel':f.key} spellCheck={false}
              aria-invalid={badField===f.key||undefined} value={values[f.key]} onChange={e=>{const value=e.target.value;setValues(v=>({...v,[f.key]:value}));changed();}}/>
          </div>)}
        </div>
      </div>
    </Card>
  </SettingsFrame>;
}
