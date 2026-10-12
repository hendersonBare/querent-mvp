'use client';
import {useEffect,useState} from 'react';
import type {CustomerRepContact} from '@/domain';
import type {API} from '@/lib/contracts';
import {SiteIcon} from './icons';
import {SiteSheet} from './SiteSheet';
import s from './site.module.css';

/**
 * The My rep sheet (plan U10; C_CVL3): "Your rep" with initials, name, title, phone and email. Read
 * from GET /api/query/customer/contacts (trimmed to the rep) when it opens. Plan U9: the picture the rep
 * set on Settings > Profile takes the initials' place in the circle (no frame draws it).
 */
export function RepSheet({api,onClose}:{api:API;onClose:()=>void}){
  const [contact,setContact]=useState<CustomerRepContact|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let live=true;
    api.get<CustomerRepContact>('customer/contacts').then(r=>{if(live)setContact(r);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Your rep could not be loaded.');});
    return ()=>{live=false;};
  },[api]);
  const rep=contact?.rep;
  return <SiteSheet title="Your rep" icon="rep" onClose={onClose}>
    {error?<div className={s.sheetError} role="alert">{error}</div>
      :contact&&!rep?<div className={s.sheetEmpty}>No rep is assigned yet.</div>
      :rep&&<div className={s.rep}>
        <div className={s.repWho}>
          <div className={s.repAvatar}>{rep.picture_url?<img className={s.repPicture} src={rep.picture_url} alt={rep.name}/>:rep.initials}</div>
          <div><div className={s.repName}>{rep.name}</div><div className={s.repTitle}>{rep.title}</div></div>
        </div>
        <div className={s.repLine}><span className={s.repIcon}><SiteIcon name="phone" size={15}/></span><span>{rep.phone}</span></div>
        <div className={s.repLine}><span className={s.repIcon}><SiteIcon name="mail" size={15}/></span><span>{rep.email}</span></div>
      </div>}
  </SiteSheet>;
}
