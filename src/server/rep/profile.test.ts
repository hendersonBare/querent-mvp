import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';
import {PICTURE_MAX_BYTES,ProfileError,ownPicture,pictureType,profileView,removePicture,savePicture,updateProfile} from './profile';

// Settings > Profile (plan U9; C_RS2): the signed-in rep's picture, name, phone and email, which customers
// see in the My rep sheet and on quotes. Every function takes the signed-in rep's id; there is no way to
// name another rep.
useSeededDatabase();

const PNG=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13]);
const JPEG=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46]);
const WEBP=Uint8Array.from([0x52,0x49,0x46,0x46,4,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50]);
const GIF=Uint8Array.from([0x47,0x49,0x46,0x38,0x39,0x61,1,0]);
const SVG=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const NOW='2026-10-12T10:00:00.000Z';

const errorOf=(fn:()=>unknown)=>{try{fn();}catch(e){return e;}throw new Error('did not throw');};

describe('pictureType: what the bytes are, never what the upload says',()=>{
  it('knows PNG, JPEG and WebP by their first bytes, and nothing else',()=>{
    expect(pictureType(PNG)).toBe('image/png');
    expect(pictureType(JPEG)).toBe('image/jpeg');
    expect(pictureType(WEBP)).toBe('image/webp');
    for(const bytes of [GIF,SVG,new Uint8Array(),Uint8Array.from([0x89,0x50])])expect(pictureType(bytes)).toBeNull();
  });
});

describe('profileView',()=>{
  it("is the rep's name, initials, title, phone, email and picture link (none on the seed)",()=>{
    expect(profileView('mara')).toEqual({name:'Mara Jensen',initials:'MJ',title:'Inside Sales',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com',picture_url:null});
  });
});

describe('updateProfile',()=>{
  it('stores the name, phone and email, trimmed, with initials from the new name',()=>{
    expect(updateProfile('mara',{name:'  Mara Quinn ',phone:' (801) 555-0199 ',email:' Mara.Quinn@Example.com '})).toEqual({
      name:'Mara Quinn',initials:'MQ',title:'Inside Sales',phone:'(801) 555-0199',email:'Mara.Quinn@Example.com',picture_url:null,
    });
    expect(profileView('eli').name).toBe('Eli Porter');
    updateProfile('mara',{name:'Mara Jensen',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com'});
    expect(profileView('mara').initials).toBe('MJ');
  });

  it('refuses a missing or bad field, naming it, and stores nothing',()=>{
    const good={name:'Mara Jensen',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com'};
    for(const [input,field,detail] of [
      [{...good,name:'  '},'name','Enter your name.'],
      [{...good,name:'x'.repeat(81)},'name','Enter a name of 80 characters or fewer.'],
      [{...good,phone:'call me'},'phone','Enter a phone number.'],
      [{...good,phone:'12'},'phone','Enter a phone number.'],
      [{...good,email:'mara'},'email','Enter an email address.'],
      [{...good,email:'mara@example'},'email','Enter an email address.'],
      [{...good,email:5},'email','Enter an email address.'],
    ] as const){
      const error=errorOf(()=>updateProfile('mara',input));
      expect(error,JSON.stringify(input)).toBeInstanceOf(ProfileError);
      expect(error).toMatchObject({status:400,field,message:detail});
    }
    expect(errorOf(()=>updateProfile('mara',null))).toMatchObject({status:400});
    expect(profileView('mara')).toMatchObject(good);
  });
});

describe('savePicture and removePicture',()=>{
  it('stores a PNG, JPEG or WebP picture and links it from the profile, changing the link each time',()=>{
    const first=savePicture('mara',PNG,{now:NOW});
    expect(first.picture_url).toBe(`/api/rep/profile/picture?v=${Date.parse(NOW)}`);
    expect(ownPicture('mara')).toMatchObject({type:'image/png'});
    expect(savePicture('mara',WEBP,{now:'2026-10-12T11:00:00.000Z'}).picture_url).toBe(`/api/rep/profile/picture?v=${Date.parse('2026-10-12T11:00:00.000Z')}`);
    expect(ownPicture('mara')?.type).toBe('image/webp');
    expect(removePicture('mara').picture_url).toBeNull();
    expect(ownPicture('mara')).toBeUndefined();
  });

  it('refuses anything that is not a PNG, JPEG or WebP picture, and anything over the size limit, keeping the old picture',()=>{
    savePicture('mara',JPEG,{now:NOW});
    for(const bytes of [GIF,SVG])expect(errorOf(()=>savePicture('mara',bytes,{now:NOW}))).toMatchObject({status:400,field:'picture',message:'Pick a PNG, JPEG or WebP picture.'});
    expect(errorOf(()=>savePicture('mara',new Uint8Array(),{now:NOW}))).toMatchObject({status:400,message:'Pick a PNG, JPEG or WebP picture.'});
    const big=new Uint8Array(PICTURE_MAX_BYTES+1);big.set(PNG);
    expect(errorOf(()=>savePicture('mara',big,{now:NOW}))).toMatchObject({status:413,field:'picture',message:'Pick a picture of 2 MB or less.'});
    expect(ownPicture('mara')?.type).toBe('image/jpeg');
    const fits=new Uint8Array(PICTURE_MAX_BYTES);fits.set(PNG);
    expect(savePicture('mara',fits,{now:NOW}).picture_url).not.toBeNull();
    removePicture('mara');
  });
});
