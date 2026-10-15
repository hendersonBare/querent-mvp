import type {ReactNode} from 'react';
import {Rail,type SignOutAction} from './Rail';
import s from './AppShell.module.css';

// The app frame: the rail (./Rail), then the page area, which takes the rest of the width. Each page
// renders inside it through ./PageFrame (title, then its body).

export interface AppShellProps {
  /** The signed-in user's email, shown at the foot of the rail. */
  email:string;
  /** Sign out's form action (a URL or a server action); see ./Rail. */
  onSignOut?:SignOutAction;
  children:ReactNode;
}

export function AppShell({email,onSignOut,children}:AppShellProps){
  return <div className={s.shell}>
    <Rail email={email} onSignOut={onSignOut}/>
    <main className={s.page}>{children}</main>
  </div>;
}
