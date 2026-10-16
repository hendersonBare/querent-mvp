import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {LoginForm} from './LoginForm';
import {ResetPasswordForm} from './ResetPasswordForm';
import {UpdatePasswordForm} from './UpdatePasswordForm';
import {COPY} from './copy';

// The auth forms (docs/boxt/plan.md B2). Sign-in failures all read the same, and a reset request
// always gets the same answer, so neither form tells anyone whether an account exists.

const fetchMock=vi.fn<typeof fetch>();
const navigate=vi.fn<(url:string)=>void>();
const reply=(status:number,body:unknown)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));

beforeEach(()=>{
  fetchMock.mockReset();
  navigate.mockReset();
  vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>vi.unstubAllGlobals());

const fill=(label:RegExp|string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});

describe('LoginForm',()=>{
  it('has email and password fields, a Sign in button and a Forgot password? link, and no sign-up',()=>{
    render(<LoginForm next="/quote-tool" navigate={navigate}/>);
    expect(screen.getByLabelText('Email')).toHaveAttribute('type','email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type','password');
    expect(screen.getByRole('button',{name:'Sign in'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Forgot password?'})).toHaveAttribute('href','/reset-password');
    expect(document.body.textContent).not.toMatch(/sign ?up|create an account|register/i);
    // Without JavaScript the form still posts to the login API.
    const form=screen.getByRole('button',{name:'Sign in'}).closest('form')!;
    expect(form).toHaveAttribute('method','post');
    expect(form).toHaveAttribute('action','/api/auth/login');
  });

  it('posts the credentials and the next page, then goes there',async()=>{
    fetchMock.mockReturnValueOnce(reply(200,{ok:true,redirectTo:'/quotes'}));
    render(<LoginForm next="/quotes" navigate={navigate}/>);
    fill('Email','rep@boxt.test');
    fill('Password','pw-123456');
    fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
    await waitFor(()=>expect(navigate).toHaveBeenCalledWith('/quotes'));
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse(String(init?.body))).toEqual({email:'rep@boxt.test',password:'pw-123456',next:'/quotes'});
  });

  it.each([
    ['a wrong password',401,{error:'Invalid login credentials'}],
    ['an unknown account',401,{error:'User not found'}],
    ['a rate limit',429,{error:'Too many requests'}],
    ['a server error',500,{}],
  ])('shows one message for %s, whatever the server said',async(_case,status,body)=>{
    fetchMock.mockReturnValueOnce(reply(status,body));
    render(<LoginForm next="/quote-tool" navigate={navigate}/>);
    fill('Email','someone@boxt.test');
    fill('Password','whatever-1');
    fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.loginFailed);
    expect(COPY.loginFailed).toBe('Email or password is incorrect.');
    expect(screen.getByRole('alert').textContent).toBe(COPY.loginFailed);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the same message when the network fails',async()=>{
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<LoginForm next="/quote-tool" navigate={navigate}/>);
    fill('Email','rep@boxt.test');
    fill('Password','x');
    fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.loginFailed);
  });

  it('shows the message after a no-JavaScript post came back with ?error',()=>{
    render(<LoginForm next="/quote-tool" initialError navigate={navigate}/>);
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.loginFailed);
  });
});

describe('ResetPasswordForm',()=>{
  it('asks for the email only and links back to sign in',()=>{
    render(<ResetPasswordForm/>);
    expect(screen.getByLabelText('Email')).toHaveAttribute('type','email');
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.getByRole('link',{name:'Back to sign in'})).toHaveAttribute('href','/login');
    const form=screen.getByRole('button',{name:'Send reset link'}).closest('form')!;
    expect(form).toHaveAttribute('action','/api/auth/reset');
  });

  it.each([
    ['an existing account',200,{ok:true}],
    ['an unknown account',200,{ok:true}],
    ['a rate limit',429,{error:'For security purposes, you can only request this after 1 seconds.'}],
    ['a server error',500,{error:'User not found'}],
  ])('gives the same answer for %s',async(_case,status,body)=>{
    fetchMock.mockReturnValueOnce(reply(status,body));
    render(<ResetPasswordForm/>);
    fill('Email','someone@boxt.test');
    fireEvent.click(screen.getByRole('button',{name:'Send reset link'}));
    expect(await screen.findByRole('status')).toHaveTextContent(COPY.resetSent);
    expect(COPY.resetSent).toBe('If an account exists for that email, we sent a link to reset the password.');
    expect(document.body.textContent).not.toMatch(/not found|no account|does not exist|security purposes/i);
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/reset');
    expect(JSON.parse(String(init?.body))).toEqual({email:'someone@boxt.test'});
  });

  it('explains an expired link',()=>{
    render(<ResetPasswordForm expired/>);
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.linkExpired);
  });

  it('shows the confirmation after a no-JavaScript post',()=>{
    render(<ResetPasswordForm sent/>);
    expect(screen.getByRole('status')).toHaveTextContent(COPY.resetSent);
  });
});

describe('UpdatePasswordForm',()=>{
  it('needs at least 8 characters and a matching confirmation before it posts',async()=>{
    render(<UpdatePasswordForm navigate={navigate}/>);
    fill('New password','short');
    fill('Confirm new password','short');
    fireEvent.click(screen.getByRole('button',{name:'Set new password'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.passwordTooShort);
    fill('New password','long-enough-1');
    fill('Confirm new password','long-enough-2');
    fireEvent.click(screen.getByRole('button',{name:'Set new password'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.passwordMismatch);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the new password and goes to the app',async()=>{
    fetchMock.mockReturnValueOnce(reply(200,{ok:true,redirectTo:'/quote-tool'}));
    render(<UpdatePasswordForm navigate={navigate}/>);
    fill('New password','long-enough-1');
    fill('Confirm new password','long-enough-1');
    fireEvent.click(screen.getByRole('button',{name:'Set new password'}));
    await waitFor(()=>expect(navigate).toHaveBeenCalledWith('/quote-tool'));
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/update-password');
    expect(JSON.parse(String(init?.body))).toEqual({password:'long-enough-1',confirm:'long-enough-1'});
  });

  it('shows the server\'s message when the update is refused',async()=>{
    fetchMock.mockReturnValueOnce(reply(401,{error:COPY.linkExpired}));
    render(<UpdatePasswordForm navigate={navigate}/>);
    fill('New password','long-enough-1');
    fill('Confirm new password','long-enough-1');
    fireEvent.click(screen.getByRole('button',{name:'Set new password'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY.linkExpired);
    expect(navigate).not.toHaveBeenCalled();
  });
});
