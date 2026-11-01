/** A path on this site, never a URL: `//host` and `/\host` both parse as another host once joined to an origin. */
export const SITE_PATH = /^\/(?![/\\])/u
