// Constants every mod gets at build time from mod-pack.ts (`define`).

/** This mod's installed id, `iangregsondev-<name>`: use it for shared-state keys, settings files and layouts. */
declare const __MOD_ID__: string;

/** The namespace every mod from this repo shares, `iangregsondev`: use it for files that belong to the repo's mods together, such as the `herdr:sync` record. */
declare const __NAMESPACE__: string;
