/** Inline script applied before first paint to avoid a flash of the default
 * theme. Lives in a server-safe module (NOT theme-provider.tsx, which is
 * "use client" — importing from there hands the server layout a client
 * reference proxy instead of the string). Storage keys must match
 * theme-provider.tsx. */
export const themeInitScript = `(function(){try{var d=document.documentElement,ls=window.localStorage;
var t=ls.getItem('helix_theme');d.dataset.theme=t==='light'?'light':'dark';
var de=ls.getItem('helix_density');d.dataset.density=de==='compact'?'compact':'comfortable';
var a=ls.getItem('helix_accent');if(a&&/^#[0-9a-fA-F]{6}$/.test(a)){d.style.setProperty('--accent',a);d.style.setProperty('--accent-ink','#fff');}
var f=parseInt(ls.getItem('helix_ft')||'',10);if(f>=11&&f<=18)d.style.setProperty('--ft',f+'px');
}catch(e){}})();`;
