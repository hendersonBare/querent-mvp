'use client';
import type {ReactNode} from 'react';
import {PageHeader} from '@/components/ui';
import {cx} from '@/components/ui/cx';
import {HeaderAlerts} from './HeaderAlerts';
import s from './RepPage.module.css';

/**
 * Every rep page's header (plan U2; C_QOBoard): the U0 PageHeader with the shell's caution and bell
 * (./HeaderAlerts) on the right. A page passes its title, then its own picker, search or Filter as
 * children, in the frame's order (plan U3 to U9 add them; the shell adds none):
 *
 *   <RepPageHeader title="Quotes"><CustomerPicker …/><FilterButton …/></RepPageHeader>
 *
 * `description` is the line under the title where a frame draws one (C_ANBase). `spaced` keeps 18px
 * under the header for a page body not rebuilt yet; a rebuilt page drops it and sets the spacing its
 * frame draws on its own next block. `actions` is the old name for children (legacy pages).
 */
export function RepPageHeader({title,description,actions,children,spaced=false}:{title:string;description?:ReactNode;actions?:ReactNode;children?:ReactNode;spaced?:boolean}){
  return <PageHeader className={cx('ui-root',s.pageHeader,spaced&&s.spaced)} title={title} subtitle={description} right={<HeaderAlerts/>}>
    {children}{actions}
  </PageHeader>;
}

export {s as repPageStyles};
