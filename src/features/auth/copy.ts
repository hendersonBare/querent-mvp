// The auth screens' and APIs' words, in one place so the forms and the route handlers say the same thing.
// Sign-in failures and reset requests read the same whatever happened, so nobody can learn from them
// whether an account exists.

export const MIN_PASSWORD_LENGTH=8;

export const COPY={
  loginFailed:'Email or password is incorrect.',
  resetSent:'If an account exists for that email, we sent a link to reset the password.',
  linkExpired:'That reset link has expired or was already used. Enter your email to get a new one.',
  passwordTooShort:`Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  passwordMismatch:'The passwords do not match.',
  passwordSame:'Choose a password different from your current one.',
  passwordFailed:'The password could not be changed. Try again.',
  signInToContinue:'Sign in to continue.',
  crossOrigin:'This request came from another site and was refused.',
  emailRequired:'Enter your email address.',
} as const;
