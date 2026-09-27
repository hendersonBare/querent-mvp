/**
 * Reloads the page (after Reset sample quote), so every part of the quote detail, whatever it
 * keeps in its own state, starts again from the server's copy. Its own module so tests can spy on it.
 */
export function reloadPage(){
  window.location.reload();
}
