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
 * `description` is the line under the title where a frame draws one (C_ANBase). Each page sets the
 * spacing its frame draws on its own next block.
 */
export function RepPageHeader({title,description,children}:{title:string;description?:ReactNode;children?:ReactNode}){
  return <PageHeader className={cx('ui-root',s.pageHeader)} title={title} subtitle={description} right={<HeaderAlerts/>}>
    {children}
  </PageHeader>;
}
