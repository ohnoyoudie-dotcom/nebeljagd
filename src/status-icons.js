// Resolution-independent versions of the approved simplified status artwork.
const paths = {
 burn:'<path fill="#ff8612" d="M33 4c4 14-12 17-8 29-7-3-8-8-7-12C4 34 7 58 31 60c24 0 30-22 19-34 0 7-3 11-6 12 5-15-5-22-11-34Z"/><path fill="#ffcc53" d="M33 28c1 9-10 13-7 20-4-1-5-3-6-5-3 9 4 16 12 17 13-1 18-12 12-20-1 5-3 7-5 8 2-8-3-13-6-20Z"/>',
 poison:'<path fill="#a4f432" d="M32 4C24 18 10 33 10 43a22 22 0 0 0 44 0C54 32 41 18 32 4Z"/><g fill="#4b941b"><circle cx="25" cy="43" r="8"/><circle cx="39" cy="32" r="5"/><circle cx="41" cy="47" r="3"/></g>',
 cold:'<g stroke="#73e1f6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M32 6v52M9.5 19l45 26M9.5 45l45-26M24 11l8 8 8-8M24 53l8-8 8 8M10 28l11-3-3-11M54 36l-11 3 3 11M18 50l3-11-11-3M46 14l-3 11 11 3"/></g>',
 slow:'<g fill="none" stroke="#ffc552" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7h38M13 57h38M16 9c0 13 3 15 16 23-13 8-16 10-16 23M48 9c0 13-3 15-16 23 13 8 16 10 16 23"/></g><path fill="#ffda70" d="M19 20h26L32 30ZM18 54c3-8 9-11 14-15 5 4 11 7 14 15Z"/>',
 stun:'<g fill="#ffd235"><path d="m32 5 4 8 9 1-6.5 6.5L40 30l-8-4.5-8 4.5 1.5-9.5L19 14l9-1Z"/><path d="m14 31 4 8 9 1-6.5 6.5L22 56l-8-4.5L6 56l1.5-9.5L1 40l9-1Z"/><path d="m50 31 4 8 9 1-6.5 6.5L58 56l-8-4.5-8 4.5 1.5-9.5L37 40l9-1Z"/></g>',
 revealed:'<path fill="none" stroke="#20e4d1" stroke-width="5" d="M6 32s10-17 26-17 26 17 26 17-10 17-26 17S6 32 6 32Z"/><circle fill="#20e4d1" cx="32" cy="32" r="9"/>',
 blind:'<g fill="none" stroke="#fff3d8" stroke-width="5"><path d="M6 32s10-17 26-17 26 17 26 17-10 17-26 17S6 32 6 32Z"/></g><circle cx="32" cy="32" r="9" fill="#fff3d8"/><path stroke="#121923" stroke-width="12" d="M9 55 55 9"/><path stroke="#fff3d8" stroke-width="6" d="M9 55 55 9"/>',
 shield:'<path fill="#42d9f4" d="M32 5C23 11 16 14 8 15v18c0 13 13 22 24 28 11-6 24-15 24-28V15c-8-1-15-4-24-10Z"/><path fill="#15bfe5" d="M32 5v56c11-6 24-15 24-28V15c-8-1-15-4-24-10Z"/>',
};
export function statusIconSvg(id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${paths[id]??''}</svg>`;
}
