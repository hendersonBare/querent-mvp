import {forwardRef,type ButtonHTMLAttributes} from 'react';
import {Icon} from './Icon';
import s from './HeaderIconButton.module.css';
import {cx} from './cx';

/** The header's caution (Needs attention) or bell (Notifications) button (plan U0; C_QOBoard, C_QOB3, C_QOB4). */
export const HeaderIconButton=forwardRef<HTMLButtonElement,{tone:'caution'|'bell';icon:'caution'|'bell';label:string;open?:boolean}&Omit<ButtonHTMLAttributes<HTMLButtonElement>,'children'>>(
  function HeaderIconButton({tone,icon,label,open=false,className,...rest},ref){
    return <button ref={ref} type="button" aria-label={label} data-ui={tone} className={cx(s.button,s[tone],open&&s.open,className)} {...rest}>
      <Icon name={icon} size={19}/>
    </button>;
  });
