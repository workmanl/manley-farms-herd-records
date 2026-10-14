// One build setting for the app address. Build scripts replace this object only.
export const DEPLOY = Object.freeze({"basePath":"/","origin":"https://herd.manleyfarms.com","moved":false});
export const NEW_ADDRESS = 'https://herd.manleyfarms.com/';
export function deployConfig({basePath = DEPLOY.basePath, origin = DEPLOY.origin, moved = DEPLOY.moved} = {}) {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) throw Error('Use a directory path ending in /.');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error('Use an HTTPS origin.');
  return Object.freeze({basePath, origin:url.origin, moved, url:url.origin + basePath});
}
export const APP_ADDRESS = deployConfig(DEPLOY).url;
