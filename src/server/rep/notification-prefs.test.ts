import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';
import {NOTIFICATION_GROUPS,NotificationPrefsError,notificationPrefs,notifyFor,updateNotificationPrefs} from './notification-prefs';

// Settings > Notifications (plan U9; C_RS4): one in-app switch per event, in two groups, the caution's
// (Needs attention) and the bell's (Notifications), stored per rep and applied by GET /api/rep/badges.
useSeededDatabase();

const ALL_ON={quote_overdue:true,quote_aging:true,below_margin_floor:true,change_requested:true,quote_accepted:true,quote_declined:true,quote_expired:true,customer_chat_needs_rep:true};

describe('the groups',()=>{
  it("are C_RS4's two cards, in its order and words",()=>{
    expect(NOTIFICATION_GROUPS.map(g=>[g.title,g.items.map(i=>[i.key,i.label])])).toEqual([
      ['Needs attention',[['quote_overdue','Quote overdue'],['quote_aging','Quote aging'],['below_margin_floor','Below margin floor'],['change_requested','Change requested']]],
      ['Notifications',[['quote_accepted','Quote accepted'],['quote_declined','Quote declined'],['quote_expired','Quote expired'],['customer_chat_needs_rep','Customer chat needs a rep']]],
    ]);
  });
});

describe('notificationPrefs and updateNotificationPrefs',()=>{
  it('reads every switch on until the rep turns one off, and stores the switches sent, for that rep only',()=>{
    expect(notificationPrefs('mara')).toEqual(ALL_ON);
    expect(updateNotificationPrefs('mara',{quote_aging:false,quote_expired:false})).toEqual({...ALL_ON,quote_aging:false,quote_expired:false});
    expect(notificationPrefs('mara')).toEqual({...ALL_ON,quote_aging:false,quote_expired:false});
    expect(notificationPrefs('eli')).toEqual(ALL_ON);
    expect(updateNotificationPrefs('mara',{quote_aging:true,quote_expired:true})).toEqual(ALL_ON);
  });

  it('refuses an unknown event, a value that is not on or off, or nothing to save, storing nothing',()=>{
    for(const input of [null,[],{},{quote_requested:false},{quote_aging:'no'},{quote_aging:false,email:true},{rep_id:'eli',quote_aging:false}]){
      expect(()=>updateNotificationPrefs('mara',input),JSON.stringify(input)).toThrow(NotificationPrefsError);
    }
    expect(notificationPrefs('mara')).toEqual(ALL_ON);
  });
});

describe('notifyFor: what GET /api/rep/badges keeps',()=>{
  it("keeps each row kind by the rep's switch; a new quote request is the chat needing its rep",()=>{
    updateNotificationPrefs('mara',{quote_overdue:false,customer_chat_needs_rep:false});
    const notify=notifyFor('mara');
    expect(notify('quote_overdue')).toBe(false);
    expect(notify('quote_requested')).toBe(false);
    for(const kind of ['quote_aging','below_margin_floor','change_requested','quote_accepted','quote_declined','quote_expired'] as const)expect(notify(kind),kind).toBe(true);
    updateNotificationPrefs('mara',{quote_overdue:true,customer_chat_needs_rep:true});
  });
});
