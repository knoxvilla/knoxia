/**
 * KnoxiaOS — os.js (XP Luna theme)
 * Full rewrite: WMP-style player, MSN-style chat, XP taskbar/start menu.
 * All JS uses addEventListener, wrapped in IIFE, no inline handlers.
 */

(function () {
'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let windows      = [];
let nextZ        = 1100;
let focusedId    = null;
let dragState    = null;
let clockInterval = null;

// ── Maintenance mode ────────────────────────────────────────────────────────
const MAINTENANCE_MODE = true;
const LOCK_PASSWORD    = 'knoxialover';

// ── VFS ─────────────────────────────────────────────────────────────────────
const VFS = {
    'My Music': {
        type: 'folder',
        children: {
            'Silver (demo 2025).mp3': { type: 'audio', label: 'Silver (demo 2025)', url: './music/track_01.mp3' },
            'Untitled (Instrumental, 2025).mp3': { type: 'audio', label: 'Untitled (Instrumental, 2025)', url: './music/track_02.mp3' },
            'love u 4 life (demo 2024).mp3': { type: 'audio', label: 'love u 4 life (demo 2024)', url: './music/track_03.mp3' },
        }
    },
    'My Documents': {
        type: 'folder',
        children: {
            'readme.txt':  { type: 'text', label: 'readme.txt',  content: 'Welcome to KnoxiaOS.\n\nThis is an interactive archive of music by Ramsey Knox.\n\nExplore the files to find more.' },
            'lyrics.txt':  { type: 'text', label: 'lyrics.txt',  content: '' },
            'about.txt':   { type: 'text', label: 'about.txt',   content: 'Ramsey Knox is a producer and vocalist based in Stockholm.\n\nMaking old-school R&B for new ears.' },
        }
    },
    'Recycle Bin': { type: 'folder', children: {} }
};

const playlist = Object.entries(VFS['My Music'].children)
    .filter(([,v]) => v.type === 'audio').map(([,v]) => v);

// ── Desktop icons ────────────────────────────────────────────────────────────
const DESKTOP_ICONS = [
    { id: 'explorer',     label: 'My Computer',    x: 16, y: 16,  iconType: 'computer' },
    { id: 'my_music',     label: 'My Music',       x: 16, y: 106, iconType: 'folder'   },
    { id: 'music_player', label: 'Media Player',   x: 16, y: 196, iconType: 'wmp'      },
    { id: 'msn_chat',     label: 'Messenger',      x: 16, y: 286, iconType: 'msn'      },
    { id: 'recycle_bin',  label: 'Recycle Bin',    x: 16, y: 376, iconType: 'bin'      },
];

// ── Audio ────────────────────────────────────────────────────────────────────
let audio = null, currentTrack = 0;
let audioCtx = null, analyser = null, sourceNode = null;
let eqData = new Uint8Array(32);

function ensureAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.connect(audioCtx.destination);
        eqData = new Uint8Array(analyser.frequencyBinCount);
    }
}
function loadTrack(idx) {
    if (audio) { audio.pause(); try { sourceNode?.disconnect(); } catch(e) {} }
    currentTrack = idx;
    audio = new Audio(playlist[currentTrack].url);
    audio.crossOrigin = 'anonymous';
    ensureAudioCtx();
    sourceNode = audioCtx.createMediaElementSource(audio);
    sourceNode.connect(analyser);
    audio.addEventListener('ended', () => {
        if (currentTrack < playlist.length - 1) nextTrack();
    });
}
function playTrack(fromStart) {
    if (!audio) loadTrack(currentTrack);
    if (fromStart) audio.currentTime = 0;
    audioCtx.resume().then(() => audio.play());
    // Fade ambience out so it doesn't play over the music
    _fadeAmbience(0, 1.5);
}
function pauseTrack() {
    if (audio) audio.pause();
    // Fade ambience back in
    _fadeAmbience(0.28, 2);
}
function stopTrack() {
    if (audio) { audio.pause(); audio.currentTime = 0; }
    _fadeAmbience(0.28, 2);
}
function _fadeAmbience(targetVol, duration) {
    // Reach through to main.js ambientTrack if available
    try {
        const amb = window._ambienceTrack;
        if (!amb) return;
        const ctx  = amb.context;
        const gain = amb.gain.gain;
        gain.cancelScheduledValues(ctx.currentTime);
        gain.setValueAtTime(gain.value, ctx.currentTime);
        gain.linearRampToValueAtTime(targetVol, ctx.currentTime + duration);
        if (targetVol > 0 && !amb.isPlaying) {
            amb.setVolume(0);
            amb.play();
        }
    } catch(e) {}
}
function nextTrack()  { loadTrack((currentTrack + 1) % playlist.length); playTrack(true); }
function prevTrack()  { loadTrack((currentTrack - 1 + playlist.length) % playlist.length); playTrack(true); }
function seekTo(r)    { if (audio?.duration) audio.currentTime = r * audio.duration; }
function getProgress(){ return (!audio || !audio.duration) ? 0 : audio.currentTime / audio.duration; }
function fmtTime(s)   { return (!s || isNaN(s)) ? '0:00' : `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; }

// ── Notepad storage ───────────────────────────────────────────────────────────
function getVFSNode(path) { const p = path.split('/').filter(Boolean); return p.length === 2 ? VFS[p[0]]?.children[p[1]] ?? null : null; }
function loadNote(path)       { return localStorage.getItem(`knoxiaos_${path}`) ?? (getVFSNode(path)?.content ?? ''); }
function saveNote(path, text) { localStorage.setItem(`knoxiaos_${path}`, text); }

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

// Build XP-style icon SVG
function makeXPIcon(type, size = 32) {
    const wrap = el('div');
    wrap.style.cssText = `width:${size}px;height:${size}px;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;

    const iconFiles = {
        computer: './icons/my-computer.png',
        bin:      './icons/recycle-bin.png',
        wmp:      './icons/media-player.png',
        msn:      './icons/messenger.png',
        folder:   './icons/folder.png',
        notepad:  './icons/notepad.png',
        info:     './icons/system-info.png',
        knox:     './icons/knox.png',
    };

    const src = iconFiles[type];
    if (src) {
        const img = el('img');
        img.src = src;
        img.style.cssText = `width:${size}px;height:${size}px;object-fit:contain;display:block;`;
        img.draggable = false;
        wrap.appendChild(img);
    } else {
        // Fallback for any unknown type
        wrap.style.fontSize = `${size * 0.7}px`;
        wrap.style.lineHeight = '1';
        wrap.textContent = '📄';
    }

    return wrap;
}

// ── Window Manager ────────────────────────────────────────────────────────────
function createWindow({ id, title, width, height, x, y, content, iconType, resizable }) {
    const existing = windows.find(w => w.id === id);
    if (existing) { if (existing.minimized) restoreWindow(id); else focusWindow(id); return existing; }

    const desktop = document.getElementById('desktop');
    const dw = desktop.offsetWidth, dh = desktop.offsetHeight;
    x = x ?? Math.max(30, Math.floor((dw - width)  / 2) + (windows.length * 24) % 160);
    y = y ?? Math.max(30, Math.floor((dh - height) / 2) + (windows.length * 24) % 120);

    const win = el('div', 'xp-window');
    win.dataset.winId = id;
    win.style.cssText = `width:${width}px;height:${height}px;left:${x}px;top:${y}px;`;
    win.style.zIndex = ++nextZ;

    // Titlebar
    const titlebar = el('div', 'xp-titlebar');
    const ico = el('div', 'xp-titlebar-icon');
    if (iconType) ico.appendChild(makeXPIcon(iconType, 16));
    const titleEl = el('div', 'xp-titlebar-title');
    titleEl.textContent = title;

    const controls = el('div', 'xp-controls');
    const minBtn   = el('button', 'xp-btn xp-btn-minimize'); minBtn.textContent   = '−';
    const maxBtn   = el('button', 'xp-btn xp-btn-maximize'); maxBtn.textContent   = '□';
    const closeBtn = el('button', 'xp-btn xp-btn-close');    closeBtn.textContent = '✕';
    controls.append(minBtn, maxBtn, closeBtn);
    titlebar.append(ico, titleEl, controls);

    const body = el('div', 'xp-window-body');
    if (content) body.appendChild(content);
    win.append(titlebar, body);
    desktop.appendChild(win);
    win.classList.add('xp-window-opening');
    win.addEventListener('animationend', () => win.classList.remove('xp-window-opening'), { once: true });
    playUISound('open');

    const winObj = { id, el: win, titlebar, body, minimized: false, maximized: false,
        normalRect: { x, y, w: width, h: height }, title, iconType };
    windows.push(winObj);
    focusWindow(id);
    updateTaskbar();

    // Make window resizable
    makeResizable(win, winObj);

    // Drag
    titlebar.addEventListener('mousedown', (e) => {
        if ([minBtn, maxBtn, closeBtn].includes(e.target)) return;
        e.preventDefault();
        focusWindow(id);
        if (winObj.maximized) return;
        const r = win.getBoundingClientRect();
        dragState = { win, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top };
    });
    titlebar.addEventListener('dblclick', (e) => {
        if ([minBtn, maxBtn, closeBtn].includes(e.target)) return;
        toggleMaximize(id);
    });

    closeBtn.addEventListener('click',   () => closeWindow(id));
    minBtn.addEventListener('click',     () => minimizeWindow(id));
    maxBtn.addEventListener('click',     () => toggleMaximize(id));
    win.addEventListener('mousedown',    () => focusWindow(id));

    return winObj;
}

function focusWindow(id) {
    focusedId = id;
    windows.forEach(w => {
        const focused = w.id === id;
        if (focused) w.el.style.zIndex = ++nextZ;
        w.el.classList.toggle('focused',   focused);
        w.el.classList.toggle('unfocused', !focused);
    });
    updateTaskbar();
}

function closeWindow(id) {
    const idx = windows.findIndex(w => w.id === id);
    if (idx < 0) return;
    if (id === 'music_player') stopTrack();
    const winEl = windows[idx].el;
    playUISound('close');
    winEl.classList.add('xp-window-closing');
    setTimeout(() => {
        winEl.remove();
        const i = windows.findIndex(w => w.id === id);
        if (i >= 0) windows.splice(i, 1);
        updateTaskbar();
    }, 120);
}

function minimizeWindow(id) {
    const w = windows.find(w => w.id === id);
    if (!w || w.minimized) return;
    w.minimized = true;
    playUISound('minimize');
    w.el.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
    w.el.style.transformOrigin = 'bottom center';
    w.el.style.transform = 'scale(0.1) translateY(200px)';
    w.el.style.opacity   = '0';
    setTimeout(() => {
        w.el.style.display = 'none';
        w.el.style.transition = w.el.style.transform = w.el.style.opacity = '';
    }, 160);
    updateTaskbar();
}

function restoreWindow(id) {
    const w = windows.find(w => w.id === id);
    if (!w) return;
    if (w.minimized) {
        w.minimized = false;
        w.el.style.display = 'flex';
        w.el.style.transform = 'scale(0.1) translateY(200px)';
        w.el.style.opacity   = '0';
        w.el.style.transition = 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), opacity 0.12s ease';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            w.el.style.transform = 'scale(1) translateY(0)';
            w.el.style.opacity   = '1';
        }));
        setTimeout(() => { w.el.style.transition = w.el.style.transform = w.el.style.opacity = ''; }, 200);
    }
    focusWindow(id);
    updateTaskbar();
}

function toggleMaximize(id) {
    const w = windows.find(w => w.id === id);
    if (!w) return;
    const desktop = document.getElementById('desktop');
    if (!w.maximized) {
        const r = w.el.getBoundingClientRect(), dr = desktop.getBoundingClientRect();
        w.normalRect = { x: r.left-dr.left, y: r.top-dr.top, w: w.el.offsetWidth, h: w.el.offsetHeight };
        Object.assign(w.el.style, { left:'0px', top:'0px', width: desktop.offsetWidth+'px', height: desktop.offsetHeight+'px' });
        w.maximized = true;
    } else {
        Object.assign(w.el.style, { left: w.normalRect.x+'px', top: w.normalRect.y+'px', width: w.normalRect.w+'px', height: w.normalRect.h+'px' });
        w.maximized = false;
    }
    const btn = w.el.querySelector('.xp-btn-maximize');
    if (btn) btn.textContent = w.maximized ? '❐' : '□';
}

// ── Taskbar ───────────────────────────────────────────────────────────────────
function updateTaskbar() {
    const container = document.getElementById('taskbar-windows');
    if (!container) return;
    container.innerHTML = '';
    windows.forEach(w => {
        const btn = el('button', 'taskbar-btn' + (w.id === focusedId && !w.minimized ? ' active' : ''));
        if (w.iconType) btn.appendChild(makeXPIcon(w.iconType, 14));
        const lbl = el('span'); lbl.textContent = w.title;
        btn.appendChild(lbl);
        btn.addEventListener('click', () => {
            if (w.minimized) restoreWindow(w.id);
            else if (w.id === focusedId) minimizeWindow(w.id);
            else focusWindow(w.id);
        });
        container.appendChild(btn);
    });
}

// ── Clock ─────────────────────────────────────────────────────────────────────
// ── UI Sounds ─────────────────────────────────────────────────────────────────
const _uiAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playUISound(type) {
    try {
        const ctx = _uiAudioCtx;
        const g   = ctx.createGain();
        g.connect(ctx.destination);
        if (type === 'open') {
            const o = ctx.createOscillator();
            o.type = 'sine'; o.connect(g);
            g.gain.setValueAtTime(0, ctx.currentTime);
            g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
            o.frequency.setValueAtTime(880, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
            o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.18);
        } else if (type === 'close') {
            const o = ctx.createOscillator();
            o.type = 'sine'; o.connect(g);
            g.gain.setValueAtTime(0, ctx.currentTime);
            g.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.005);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            o.frequency.setValueAtTime(660, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
            o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.12);
        } else if (type === 'minimize') {
            const o = ctx.createOscillator();
            o.type = 'sine'; o.connect(g);
            g.gain.setValueAtTime(0.06, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            o.frequency.setValueAtTime(1000, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
            o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.1);
        }
    } catch(e) {}
}

function startClock() {
    function tick() {
        const clockEl = document.getElementById('clock');
        if (!clockEl) return;
        const now  = new Date();
        const time = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
        const date = now.toLocaleDateString('en-US', { month:'numeric', day:'numeric', year:'numeric' });
        const full = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
        clockEl.innerHTML = `${time}<br>${date}`;
        clockEl.title = full; // tooltip shows full date on hover
    }
    tick();
    clockInterval = setInterval(tick, 1000);
}

// ── Start Menu ────────────────────────────────────────────────────────────────
function buildStartMenu() {
    const menu = document.getElementById('start-menu');
    if (!menu) return;
    menu.innerHTML = '';

    const header = el('div', 'start-menu-header');
    const avatar = el('div', 'start-menu-avatar');
    const uname  = el('div', 'start-menu-username'); uname.textContent = 'Ramsey Knox';
    header.append(avatar, uname);

    const body  = el('div', 'start-menu-body');
    const left  = el('div', 'start-menu-left');
    const right = el('div', 'start-menu-right');

    // Left items — 32px icons like real XP
    [
        { id: 'music_player', label: 'Knoxia Media Player', iconType: 'wmp'      },
        { id: 'msn_chat',     label: 'MSN Messenger',       iconType: 'msn'      },
        { id: 'explorer',     label: 'My Computer',         iconType: 'computer' },
        { id: 'my_music',     label: 'My Music',            iconType: 'folder'   },
        { id: 'notepad',      label: 'Notepad',             iconType: 'notepad'  },
    ].forEach(item => {
        const div = el('div', 'start-menu-item');
        const ico = el('div', 'menu-icon'); ico.appendChild(makeXPIcon(item.iconType, 32));
        const lbl = el('span'); lbl.textContent = item.label;
        div.append(ico, lbl);
        div.addEventListener('click', () => { launchApp(item.id); closeStartMenu(); });
        left.appendChild(div);
    });

    left.appendChild(el('div', 'start-menu-divider'));

    // Right panel — matches XP layout with sections
    [
        { label: 'My Documents',  id: 'explorer',     iconType: 'folder'   },
        { label: 'My Music',      id: 'my_music',     iconType: 'folder'   },
        { label: 'My Computer',   id: 'explorer',     iconType: 'computer' },
        null,
        { label: 'System Info',   id: 'sys_info',     iconType: 'info'     },
        { label: 'Recycle Bin',   id: 'recycle_bin',  iconType: 'bin'      },
    ].forEach(item => {
        if (item === null) {
            right.appendChild(el('div', 'start-menu-right-section-sep'));
            return;
        }
        const div = el('div', 'start-menu-item right-item');
        const ico = el('span'); ico.style.cssText = 'flex-shrink:0;display:flex;align-items:center;';
        ico.appendChild(makeXPIcon(item.iconType, 16));
        const lbl = el('span'); lbl.textContent = item.label;
        const arr = el('span'); arr.textContent = '›';
        arr.style.cssText = 'margin-left:auto;opacity:0.5;font-size:13px;';
        div.append(ico, lbl, arr);
        div.addEventListener('click', () => { launchApp(item.id); closeStartMenu(); });
        right.appendChild(div);
    });

    body.append(left, right);

    const footer = el('div', 'start-menu-footer');
    const shutBtn = el('button', 'start-menu-footer-btn');
    shutBtn.textContent = 'Turn Off Computer';
    shutBtn.addEventListener('click', () => { closeStartMenu(); triggerShutdown(); });
    footer.appendChild(shutBtn);

    menu.append(header, body, footer);
}

function openStartMenu()  { document.getElementById('start-menu')?.classList.add('open'); }
function closeStartMenu() { document.getElementById('start-menu')?.classList.remove('open'); }
function isStartMenuOpen(){ return !!document.getElementById('start-menu')?.classList.contains('open'); }

// ── App launchers ─────────────────────────────────────────────────────────────
function launchApp(id, opts) {
    if (id === 'explorer')     return openExplorer(opts?.path ?? null);
    if (id === 'my_music')     return openExplorer('My Music');
    if (id === 'notepad')      return openNotepad(opts?.path ?? 'My Documents/readme.txt');
    if (id === 'music_player') return openMusicPlayer();
    if (id === 'msn_chat')     return openMSNChat();
    if (id === 'sys_info')     return openSysInfo();
    if (id === 'recycle_bin')  return openExplorer('Recycle Bin');
}

// ── Explorer ──────────────────────────────────────────────────────────────────
function openExplorer(startPath) {
    let currentPath = startPath ?? null;
    const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    const toolbar = el('div', 'xp-toolbar');
    const backBtn = el('button', 'xp-toolbar-btn'); backBtn.textContent = '← Back';
    const upBtn   = el('button', 'xp-toolbar-btn'); upBtn.textContent   = '↑ Up';
    toolbar.append(backBtn, upBtn);

    const addrBar   = el('div', 'explorer-address-bar');
    const addrLabel = el('span', 'explorer-address-label'); addrLabel.textContent = 'Address:';
    const addrInput = el('input', 'explorer-address-input'); addrInput.readOnly = true;
    addrBar.append(addrLabel, addrInput);

    const layout  = el('div', 'explorer-layout'); layout.style.flex = '1';
    const sidebar = el('div', 'explorer-sidebar');

    // Sidebar
    const sec = el('div', 'explorer-sidebar-section');
    const stitle = el('div', 'explorer-sidebar-title'); stitle.textContent = 'Folders';
    sec.appendChild(stitle);
    Object.keys(VFS).forEach(name => {
        const item = el('div', 'explorer-sidebar-item');
        const ico  = makeXPIcon('folder', 16);
        const lbl  = el('span'); lbl.textContent = name;
        item.append(ico, lbl);
        item.addEventListener('click', () => navigate(name));
        sec.appendChild(item);
    });
    sidebar.appendChild(sec);

    const main = el('div', 'explorer-main');
    const grid = el('div', 'explorer-grid');
    main.appendChild(grid);
    layout.append(sidebar, main);

    const statusbar   = el('div', 'xp-statusbar');
    const statusPanel = el('div', 'xp-statusbar-panel');
    statusbar.appendChild(statusPanel);

    wrap.append(toolbar, addrBar, layout, statusbar);

    function navigate(path) { currentPath = path; renderGrid(); }

    function renderGrid() {
        grid.innerHTML = '';
        addrInput.value = currentPath ? `C:\\${currentPath}` : 'My Computer';
        sidebar.querySelectorAll('.explorer-sidebar-item').forEach(s => s.classList.remove('active'));

        let items = [];
        if (!currentPath) {
            items = Object.keys(VFS).map(name => ({ name, type: 'folder' }));
        } else {
            const folder = VFS[currentPath];
            if (!folder) return;
            items = Object.entries(folder.children || {}).map(([name, node]) => ({ name, node, type: node.type }));
            sidebar.querySelectorAll('.explorer-sidebar-item').forEach(s => {
                if (s.querySelector('span')?.textContent === currentPath) s.classList.add('active');
            });
        }

        statusPanel.textContent = `${items.length} object(s)`;

        items.forEach(({ name, node, type }) => {
            const item = el('div', 'explorer-item');
            const icoWrap = el('div', 'explorer-item-icon');
            const icoType = type === 'audio' ? 'wmp' : type === 'text' ? 'notepad' : 'folder';
            icoWrap.appendChild(makeXPIcon(icoType, 32));
            const lbl = el('span'); lbl.textContent = name;
            item.append(icoWrap, lbl);

            item.addEventListener('click', () => {
                grid.querySelectorAll('.explorer-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });
            item.addEventListener('dblclick', () => {
                if (type === 'folder') navigate(currentPath ? currentPath + '/' + name : name);
                else if (type === 'text')  openNotepad(`${currentPath}/${name}`, node);
                else if (type === 'audio') { const idx = playlist.findIndex(p => p.url === node.url); openMusicPlayer(); if (idx >= 0) { loadTrack(idx); playTrack(true); } }
            });
            grid.appendChild(item);
        });
    }

    backBtn.addEventListener('click', () => { currentPath = null; renderGrid(); });
    upBtn.addEventListener('click',   () => { currentPath = null; renderGrid(); });

    const winObj = createWindow({ id:'explorer', title:'My Computer', width:560, height:380, iconType:'computer', content:wrap });
    if (startPath) navigate(startPath); else renderGrid();
    return winObj;
}

// ── Notepad ───────────────────────────────────────────────────────────────────
function openNotepad(path, node) {
    const resolved = node ?? getVFSNode(path);
    const id = 'notepad_' + path.replace(/\W/g, '_');
    const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    const menubar = el('div', 'xp-menubar');
    ['File','Edit','Format','View','Help'].forEach(lbl => {
        const item = el('span', 'xp-menubar-item'); item.textContent = lbl;
        menubar.appendChild(item);
    });

    const textarea = el('textarea', 'notepad-textarea');
    textarea.value = loadNote(path);
    textarea.spellcheck = false;
    textarea.addEventListener('input', () => saveNote(path, textarea.value));

    const statusbar = el('div', 'xp-statusbar');
    const linePanel = el('div', 'xp-statusbar-panel'); linePanel.textContent = 'Ln 1, Col 1';
    textarea.addEventListener('keyup', () => {
        const txt = textarea.value.substring(0, textarea.selectionStart);
        const lines = txt.split('\n');
        linePanel.textContent = `Ln ${lines.length}, Col ${lines[lines.length-1].length+1}`;
    });
    statusbar.appendChild(linePanel);
    wrap.append(menubar, textarea, statusbar);

    return createWindow({
        id, width: 420, height: 340, iconType: 'notepad',
        title: `${resolved?.label ?? path.split('/').pop()} - Notepad`,
        content: wrap,
    });
}

// ── Media Player (WMP style) ──────────────────────────────────────────────────
function openMusicPlayer() {
    const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    const menubar = el('div', 'xp-menubar');
    ['File','View','Play','Tools','Help'].forEach(lbl => {
        const item = el('span', 'xp-menubar-item'); item.textContent = lbl;
        menubar.appendChild(item);
    });

    // Tabs
    const tabsBar = el('div', 'wmp-tabs-bar');
    ['Now Playing','Library','Rip','Burn','Sync'].forEach((lbl, i) => {
        const tab = el('div', 'wmp-tab' + (i === 0 ? ' active' : ''));
        tab.textContent = lbl;
        tabsBar.appendChild(tab);
    });

    // Chrome
    const chrome = el('div', 'wmp-chrome');

    // Nav
    const nav = el('div', 'wmp-nav');
    ['Now Playing','Media Library','Radio Tuner','Skin Chooser'].forEach((lbl, i) => {
        const item = el('div', 'wmp-nav-item' + (i === 0 ? ' active' : ''));
        item.innerHTML = lbl.replace(' ', '<br>') + '<span style="float:right;font-size:9px;opacity:0.4;">›</span>';
        nav.appendChild(item);
    });

    // Stage
    const stage = el('div', 'wmp-stage');
    const info  = el('div', 'wmp-info');
    const artistEl = el('div', 'wmp-artist'); artistEl.textContent = 'Ramsey Knox';
    // Marquee wrapper — hidden overflow, inner span scrolls
    const trackEl      = el('div', 'wmp-track-name');
    const trackInner   = el('span', 'wmp-track-inner');
    trackInner.textContent = playlist[currentTrack]?.label ?? 'No Track';
    trackEl.appendChild(trackInner);
    info.append(artistEl, trackEl);

    // Visualizer canvas
    const vizWrap = el('div', 'wmp-viz-wrap');
    const vizCanvas = document.createElement('canvas');
    vizWrap.appendChild(vizCanvas);

    const statusBar = el('div', 'wmp-status-bar');
    const statusTxt  = el('div', 'wmp-status-txt');  statusTxt.textContent  = '■ Stopped';
    const statusTime = el('div', 'wmp-status-time'); statusTime.textContent = '0:00 / 0:00';
    statusBar.append(statusTxt, statusTime);

    stage.append(info, vizWrap, statusBar);

    // Playlist
    const pl = el('div', 'wmp-playlist');
    const plHdr = el('div', 'wmp-pl-header');
    const plTitle = el('div', 'wmp-pl-title'); plTitle.textContent = 'My Playlist';
    plHdr.appendChild(plTitle);
    const plItems = el('div', 'wmp-pl-items');
    playlist.forEach((track, i) => {
        const item = el('div', 'wmp-pl-item' + (i === currentTrack ? ' active' : ''));
        item.textContent = track.label;
        item.dataset.idx = i;
        item.addEventListener('click', () => { loadTrack(i); playTrack(true); });
        plItems.appendChild(item);
    });
    pl.append(plHdr, plItems);

    chrome.append(nav, stage, pl);

    // Transport
    const transport = el('div', 'wmp-transport');
    const skipPrev  = el('div', 'wmp-skip'); skipPrev.textContent = '⏮';
    const playBtn   = el('div', 'wmp-play-btn'); playBtn.textContent = '▶';
    const stopBtn   = el('div', 'wmp-stop-btn'); stopBtn.textContent = '■';
    const skipNext  = el('div', 'wmp-skip'); skipNext.textContent = '⏭';

    const seekEl    = el('div', 'wmp-seek');
    const seekTrack = el('div', 'wmp-seek-track');
    const seekFill  = el('div', 'wmp-seek-fill');
    const seekThumb = el('div', 'wmp-seek-thumb');
    seekTrack.append(seekFill, seekThumb);
    const seekLabels = el('div', 'wmp-seek-labels');
    const seekCur = el('div', 'wmp-seek-lbl'); seekCur.textContent = '0:00';
    const seekDur = el('div', 'wmp-seek-lbl'); seekDur.textContent = '0:00';
    seekLabels.append(seekCur, seekDur);
    seekEl.append(seekTrack, seekLabels);

    const volEl    = el('div', 'wmp-vol');
    const volIco   = el('div', 'wmp-vol-ico'); volIco.textContent = '🔈';
    const volTrack = el('div', 'wmp-vol-track');
    const volFill  = el('div', 'wmp-vol-fill');
    const volThumb = el('div', 'wmp-vol-thumb');
    volTrack.append(volFill, volThumb);
    volEl.append(volIco, volTrack);

    transport.append(skipPrev, playBtn, stopBtn, skipNext, seekEl, volEl);

    wrap.append(menubar, tabsBar, chrome, transport);

    // Events
    skipPrev.addEventListener('click', prevTrack);
    skipNext.addEventListener('click', nextTrack);
    playBtn.addEventListener('click', () => {
        if (audio && !audio.paused) pauseTrack();
        else playTrack();
    });
    stopBtn.addEventListener('click', stopTrack);
    seekTrack.addEventListener('click', (e) => {
        const r = seekTrack.getBoundingClientRect();
        seekTo((e.clientX - r.left) / r.width);
    });
    volTrack.addEventListener('click', (e) => {
        const r = volTrack.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        if (audio) audio.volume = ratio;
        volFill.style.width  = (ratio * 100) + '%';
        volThumb.style.left  = (ratio * 100) + '%';
    });

    // Visualizer
    let vizRAF;
    const vizCtx = vizCanvas.getContext('2d');
    let vizT = 0;
    const blobs = [
        { x:0.5, y:0.5, r:0.35, color:[180,20,80],  speed:0.008, ox:0.3, oy:0.25 },
        { x:0.3, y:0.6, r:0.30, color:[20,80,200],  speed:0.012, ox:0.4, oy:0.3  },
        { x:0.7, y:0.4, r:0.28, color:[200,120,10], speed:0.007, ox:0.35,oy:0.2  },
        { x:0.5, y:0.3, r:0.25, color:[140,10,160], speed:0.010, ox:0.25,oy:0.35 },
        { x:0.4, y:0.7, r:0.22, color:[10,160,100], speed:0.009, ox:0.3, oy:0.28 },
    ];

    function drawViz() {
        vizRAF = requestAnimationFrame(drawViz);
        const W = vizWrap.clientWidth, H = vizWrap.clientHeight;
        if (W === 0 || H === 0) return;
        if (vizCanvas.width !== W)  vizCanvas.width  = W;
        if (vizCanvas.height !== H) vizCanvas.height = H;

        vizT += 0.018;
        vizCtx.fillStyle = 'rgba(0,0,0,0.18)';
        vizCtx.fillRect(0, 0, W, H);

        blobs.forEach((b, i) => {
            const px = (b.x + Math.sin(vizT * b.speed * 80 + i * 1.3) * b.ox) * W;
            const py = (b.y + Math.cos(vizT * b.speed * 60 + i * 0.9) * b.oy) * H;
            const r  = (b.r + Math.sin(vizT * b.speed * 50 + i) * 0.12) * Math.min(W, H);
            const grad = vizCtx.createRadialGradient(px, py, 0, px, py, r);
            const [R, G, B] = b.color;
            const alpha = 0.55 + Math.sin(vizT * b.speed * 40 + i * 2) * 0.2;
            grad.addColorStop(0,   `rgba(${R},${G},${B},${alpha})`);
            grad.addColorStop(0.4, `rgba(${Math.round(R*0.6)},${Math.round(G*0.6)},${Math.round(B*0.6)},${alpha*0.5})`);
            grad.addColorStop(1,   'rgba(0,0,0,0)');
            vizCtx.globalCompositeOperation = 'screen';
            vizCtx.fillStyle = grad;
            vizCtx.fillRect(0, 0, W, H);
        });

        const cx = W * (0.5 + Math.sin(vizT*0.3)*0.05);
        const cy = H * (0.5 + Math.cos(vizT*0.25)*0.08);
        for (let i = 0; i < 10; i++) {
            const angle = (i/10)*Math.PI*2 + vizT*0.4;
            const len   = Math.min(W,H)*0.35*(0.6+Math.sin(vizT*0.8+i)*0.4);
            const hue   = (vizT*30+i*36)%360;
            const grd   = vizCtx.createLinearGradient(cx,cy,cx+Math.cos(angle)*len,cy+Math.sin(angle)*len);
            grd.addColorStop(0,   `hsla(${hue},100%,70%,0.12)`);
            grd.addColorStop(1,   'hsla(0,0%,0%,0)');
            vizCtx.beginPath(); vizCtx.moveTo(cx,cy);
            vizCtx.lineTo(cx+Math.cos(angle)*len, cy+Math.sin(angle)*len);
            vizCtx.strokeStyle = grd; vizCtx.lineWidth = 1.5; vizCtx.stroke();
        }
        vizCtx.globalCompositeOperation = 'source-over';
    }
    drawViz();

    // Player tick
    let playerRAF;
    let marqueeOffset = 0, marqueeDir = 1, marqueeTimer = 0;

    function playerTick() {
        playerRAF = requestAnimationFrame(playerTick);
        const playing = audio && !audio.paused;
        const prog    = getProgress();

        const label  = playlist[currentTrack]?.label ?? 'No Track';
        const prefix = playing ? '▶   ' : '';
        const fullTxt = prefix + label + '     —     Ramsey Knox';

        trackInner.textContent = fullTxt;

        // Marquee: scroll trackInner left/right inside trackEl
        const overflow = trackInner.scrollWidth - trackEl.clientWidth;
        if (overflow > 4) {
            marqueeTimer++;
            if (marqueeTimer > 150) { // pause at each end
                marqueeOffset += marqueeDir * 0.3;
                if (marqueeOffset >= overflow) { marqueeDir = -1; marqueeTimer = 0; }
                if (marqueeOffset <= 0)        { marqueeDir =  1; marqueeTimer = 0; }
                trackInner.style.transform = `translateX(-${Math.max(0, marqueeOffset)}px)`;
            }
        } else {
            marqueeOffset = 0;
            marqueeTimer  = 0;
            trackInner.style.transform = 'translateX(0)';
        }
        statusTxt.textContent  = playing ? '▶ Playing' : '■ Stopped';
        statusTime.textContent = `${fmtTime(audio?.currentTime)} / ${fmtTime(audio?.duration)}`;
        seekFill.style.width   = (prog * 100).toFixed(1) + '%';
        seekThumb.style.left   = (prog * 100).toFixed(1) + '%';
        seekCur.textContent    = fmtTime(audio?.currentTime);
        seekDur.textContent    = fmtTime(audio?.duration);
        playBtn.textContent    = playing ? '⏸' : '▶';

        // Update playlist active
        plItems.querySelectorAll('.wmp-pl-item').forEach((item, i) => {
            item.classList.toggle('active', i === currentTrack);
        });
    }
    playerTick();

    const winObj = createWindow({
        id: 'music_player', title: 'Knoxia Media Player',
        width: 460, height: 340, iconType: 'wmp', content: wrap
    });

    winObj.el.querySelector('.xp-btn-close').addEventListener('click', () => {
        cancelAnimationFrame(vizRAF);
        cancelAnimationFrame(playerRAF);
    }, { once: true });

    return winObj;
}

// ── MSN Chat ──────────────────────────────────────────────────────────────────
function openMSNChat() {
    const SUPA_URL = 'https://tmgyzqmelczjqlebmgpv.supabase.co';
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZ3l6cW1lbGN6anFsZWJtZ3B2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjYyMTYsImV4cCI6MjA5NzIwMjIxNn0.YqR0tyNbQA8uLFuikwmk0GfxBHUXkNrdS4x5YCCziXU';
    const headers  = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
    const visitorName = 'Visitor_' + Math.random().toString(36).slice(2,6).toUpperCase();
    let seenIds = new Set();
    let realtimeSocket = null;

    const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    const menubar = el('div', 'xp-menubar');
    ['File','Edit','Actions','Tools','Help'].forEach(lbl => {
        const item = el('span', 'xp-menubar-item'); item.textContent = lbl;
        menubar.appendChild(item);
    });

    // Icon toolbar
    const iconToolbar = el('div', 'msn-icon-toolbar');
    [
        { ico: '👥', lbl: 'Invite' },
        { ico: '📂', lbl: 'Send Files' },
        null,
        { ico: '🎥', lbl: 'Video' },
        { ico: '🎤', lbl: 'Voice' },
        null,
        { ico: '🎮', lbl: 'Activities' },
        { ico: '♟️', lbl: 'Games' },
    ].forEach(item => {
        if (!item) { iconToolbar.appendChild(el('div', 'msn-toolbar-sep')); return; }
        const btn = el('div', 'msn-toolbar-btn');
        const ico = el('div', 'msn-toolbar-btn-ico'); ico.textContent = item.ico;
        const lbl = el('div', 'msn-toolbar-btn-lbl'); lbl.textContent = item.lbl;
        btn.append(ico, lbl);
        iconToolbar.appendChild(btn);
    });

    // MSN logo
    const logoArea = el('div', 'msn-logo-area');
    const wordmark = el('div', 'msn-wordmark');
    wordmark.innerHTML = 'msn<span class="msn-wordmark-dot">✦</span>';
    const bfly = el('div', 'msn-butterfly');
    ['msn-bfly msn-bfly-tl2','msn-bfly msn-bfly-tr2','msn-bfly msn-bfly-bl2','msn-bfly msn-bfly-br2'].forEach(cls => {
        bfly.appendChild(el('div', cls));
    });
    const netTxt = el('div', 'msn-net'); netTxt.textContent = 'Messenger';
    logoArea.append(wordmark, bfly, netTxt);
    iconToolbar.appendChild(logoArea);

    // Main body
    const mainBody = el('div', 'msn-main-body');
    const leftCol  = el('div', 'msn-left-col');

    // To bar
    const toBar = el('div', 'msn-to-bar');
    const toLbl = el('span', 'msn-to-label'); toLbl.textContent = 'To:';
    const toVal = el('span', 'msn-to-val');   toVal.textContent = 'Ramsey Knox <knox@knoxiaos.com>';
    toBar.append(toLbl, toVal);

    // Chat messages
    const msgs = el('div', 'msn-chat-msgs');

    function fmtTs(ts) {
        return new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
    }

    function addMsg(text, from, isSystem, ts) {
        const row = el('div', 'msn-msg-row');
        if (isSystem) {
            row.style.cssText = 'align-items:center;';
            const sys = el('div'); sys.style.cssText = 'font-size:10px;color:#888;padding:2px 0;text-align:center;';
            sys.textContent = text; row.appendChild(sys);
        } else {
            const isSelf = from === visitorName;
            const who = el('div', 'msn-msg-who ' + (isSelf ? 'me' : 'them'));
            who.textContent = from + ' says:';
            const txt = el('div', 'msn-msg-txt'); txt.textContent = text;
            const tsEl = el('div', 'msn-msg-ts'); tsEl.textContent = ts ? fmtTs(ts) : '';
            row.append(who, txt, tsEl);
        }
        msgs.appendChild(row);
        msgs.scrollTop = msgs.scrollHeight;
    }

    // Font toolbar
    const fontToolbar = el('div', 'msn-font-toolbar');
    [
        { tag:'span', cls:'msn-ft', text:'A', style:'font-weight:700;color:#cc0000;font-size:14px;' },
        null,
        { tag:'span', cls:'msn-ft', text:'😊' },
        { tag:'span', cls:'msn-ft-voice', text:'🔊 Voice Clip' },
        { tag:'span', cls:'msn-ft', text:'😉' },
        { tag:'span', cls:'msn-ft', text:'🖼️' },
        { tag:'span', cls:'msn-ft', text:'🎨' },
        null,
        { tag:'span', cls:'msn-ft', text:'✍', style:'font-weight:700;' },
        { tag:'span', cls:'msn-ft', text:'A', style:'text-decoration:underline;' },
    ].forEach(item => {
        if (!item) { fontToolbar.appendChild(el('div', 'msn-ft-sep')); return; }
        const e = el(item.tag, item.cls); e.textContent = item.text;
        if (item.style) e.style.cssText += item.style;
        fontToolbar.appendChild(e);
    });

    // Input
    const inputRow = el('div', 'msn-input-row');
    const inputBox = el('textarea', 'msn-input-box');
    inputBox.placeholder = '';
    const inputBtns = el('div', 'msn-input-btns');
    const sendBtn   = el('button', 'msn-send-btn');   sendBtn.textContent   = 'Send';
    const searchBtn = el('button', 'msn-search-btn'); searchBtn.textContent = 'Find';
    inputBtns.append(sendBtn, searchBtn);
    inputRow.append(inputBox, inputBtns);

    const bottomIcons = el('div', 'msn-bottom-icons');
    ['📳','𝐀'].forEach(ico => {
        const s = el('span', 'msn-bi'); s.textContent = ico;
        bottomIcons.appendChild(s);
    });

    leftCol.append(toBar, msgs, fontToolbar, inputRow, bottomIcons);

    // Right column with display pic
    const rightCol = el('div', 'msn-right-col');
    const dp1 = el('div', 'msn-dp');
    const frame1 = el('div', 'msn-dp-frame');
    const placeholder1 = el('div', 'msn-dp-placeholder'); placeholder1.textContent = '🧑‍💻';
    frame1.appendChild(placeholder1);
    dp1.appendChild(frame1);

    const dp2 = el('div', 'msn-dp'); dp2.style.borderTop = '1px solid #a0b8d0';
    const frame2 = el('div', 'msn-dp-frame');
    const placeholder2 = el('div', 'msn-dp-placeholder'); placeholder2.textContent = '🦆';
    frame2.appendChild(placeholder2);
    dp2.appendChild(frame2);

    rightCol.append(dp1, dp2);
    mainBody.append(leftCol, rightCol);

    // Status bar
    const statusbar = el('div', 'msn-statusbar');
    const statusLink = el('span', 'msn-status-link'); statusLink.textContent = 'Click for new Emoticons and Theme Packs from Blue Mountain';
    statusbar.appendChild(statusLink);

    wrap.append(menubar, iconToolbar, mainBody, statusbar);

    // Send logic
    async function sendMessage(text) {
        sendBtn.disabled = true;
        try {
            await fetch(`${SUPA_URL}/rest/v1/messages`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify({ author: visitorName, content: text }),
            });
        } catch(e) { console.error('[MSN]', e); }
        sendBtn.disabled = false;
    }

    const send = () => {
        const txt = inputBox.value.trim();
        if (!txt || sendBtn.disabled) return;
        inputBox.value = '';
        addMsg(txt, visitorName, false, new Date().toISOString());
        sendMessage(txt);
    };

    sendBtn.addEventListener('click', send);
    inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); send(); }
    });

    // Load history
    async function loadHistory() {
        try {
            const res  = await fetch(`${SUPA_URL}/rest/v1/messages?select=*&order=created_at.asc&limit=60`, { headers });
            const rows = await res.json();
            addMsg('MSN Messenger — Channel Open', '', true);
            if (rows.length === 0) addMsg('No messages yet. Say hello!', '', true);
            else rows.forEach(r => { seenIds.add(r.id); addMsg(r.content, r.author, false, r.created_at); });
        } catch(e) { addMsg('Could not load messages.', '', true); }
    }

    // Realtime
    function connectRealtime() {
        const wsUrl = SUPA_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPA_KEY + '&vsn=1.0.0';
        realtimeSocket = new WebSocket(wsUrl);
        let hbInterval = null;

        realtimeSocket.onopen = () => {
            realtimeSocket.send(JSON.stringify({
                topic: 'realtime:knoxia-chat', event: 'phx_join', ref: '1',
                payload: { config: { postgres_changes: [{ event:'INSERT', schema:'public', table:'messages' }] } }
            }));
            hbInterval = setInterval(() => {
                if (realtimeSocket?.readyState === WebSocket.OPEN)
                    realtimeSocket.send(JSON.stringify({ topic:'phoenix', event:'heartbeat', payload:{}, ref:'hb' }));
            }, 20000);
        };
        realtimeSocket.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.event === 'postgres_changes') {
                    const r = msg.payload?.data?.record;
                    if (r && !seenIds.has(r.id)) {
                        seenIds.add(r.id);
                        if (r.author !== visitorName) addMsg(r.content, r.author, false, r.created_at);
                    }
                }
            } catch(e) {}
        };
        realtimeSocket.onclose = () => {
            clearInterval(hbInterval);
            setTimeout(() => { if (realtimeSocket?.readyState === WebSocket.CLOSED) connectRealtime(); }, 3000);
        };
    }

    loadHistory();
    connectRealtime();

    const winObj = createWindow({
        id: 'msn_chat', title: 'Ramsey Knox - Conversation',
        width: 500, height: 400, iconType: 'msn', content: wrap
    });

    winObj.el.querySelector('.xp-btn-close').addEventListener('click', () => {
        if (realtimeSocket) { realtimeSocket.onclose = null; realtimeSocket.close(); }
    }, { once: true });

    return winObj;
}

// ── System Info ───────────────────────────────────────────────────────────────
function openSysInfo() {
    const body = el('div', 'sysinfo-body');
    const header = el('div', 'sysinfo-header');
    const logo = el('div'); logo.appendChild(makeXPIcon('computer', 48));
    const info = el('div');
    const name = el('div', 'sysinfo-os-name'); name.textContent = 'KnoxiaOS';
    const ver  = el('div', 'sysinfo-os-version'); ver.textContent = 'Version 1.0.4 — Build 2025';
    info.append(name, ver);
    header.append(logo, info);
    body.appendChild(header);

    [
        ['System',    'Knoxia Machina™'],
        ['Processor', 'Ramsey Knox Creative Engine'],
        ['Memory',    'Unlimited Imagination'],
        ['Storage',   'My Music · My Documents'],
        ['Graphics',  'WebGL / Three.js'],
        ['Audio',     'Web Audio API'],
        ['Built by',  'Ramsey Knox'],
        ['Location',  'Stockholm, SE'],
    ].forEach(([label, value]) => {
        const row = el('div', 'sysinfo-row');
        const lbl = el('div', 'sysinfo-label'); lbl.textContent = label;
        const val = el('div', 'sysinfo-value'); val.textContent = value;
        row.append(lbl, val);
        body.appendChild(row);
    });

    return createWindow({ id:'sys_info', title:'System Properties', width:360, height:320, iconType:'info', content:body });
}

// ── Desktop Icons ─────────────────────────────────────────────────────────────
function buildDesktopIcons() {
    const desktop = document.getElementById('desktop');
    if (!desktop) return;

    DESKTOP_ICONS.forEach(def => {
        const iconEl = el('div', 'desktop-icon');
        iconEl.style.left = def.x + 'px';
        iconEl.style.top  = def.y + 'px';

        const img = el('div', 'dsk-icon-img');
        img.appendChild(makeXPIcon(def.iconType, 32));
        const lbl = el('span'); lbl.textContent = def.label;
        iconEl.append(img, lbl);

        let clicks = 0, timer = null;
        iconEl.addEventListener('click', () => {
            clicks++;
            if (clicks === 1) {
                desktop.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
                iconEl.classList.add('selected');
                timer = setTimeout(() => { clicks = 0; }, 400);
            } else {
                clearTimeout(timer); clicks = 0;
                launchApp(def.id);
            }
        });
        desktop.appendChild(iconEl);
    });

    desktop.addEventListener('click', (e) => {
        if (e.target === desktop) {
            desktop.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
            closeStartMenu();
        }
    });

    // Right-click context menu on desktop
    desktop.addEventListener('contextmenu', (e) => {
        // Only fire on desktop background — not on windows or taskbar
        if (e.target.closest('.xp-window') || e.target.closest('#taskbar') || e.target.closest('#start-menu')) return;
        e.preventDefault();
        const x = e.clientX - desktop.getBoundingClientRect().left;
        const y = e.clientY - desktop.getBoundingClientRect().top;
        buildContextMenu([
            { iconType: 'computer', label: 'Open My Computer',  action: () => launchApp('explorer') },
            { iconType: 'folder',   label: 'Open My Music',    action: () => launchApp('my_music') },
            null,
            { iconType: 'wmp',      label: 'Open Media Player', action: () => launchApp('music_player') },
            { iconType: 'msn',      label: 'Open Messenger',    action: () => launchApp('msn_chat') },
            null,
            { iconType: 'info',     label: 'System Properties', action: () => launchApp('sys_info') },
        ], x, y);
    });
}

// ── Taskbar DOM ───────────────────────────────────────────────────────────────
function buildTaskbar() {
    // Build #taskbar with start button, separator, windows area, system tray
    const taskbar = document.getElementById('taskbar');
    if (!taskbar) return;
    taskbar.innerHTML = '';

    const startBtn = el('button', ''); startBtn.id = 'start-btn';
    const orb = el('div', 'start-orb');
    const startTxt = document.createTextNode(' start');
    startBtn.append(orb, startTxt);
    taskbar.appendChild(startBtn);

    const sep = el('div', 'taskbar-sep');
    taskbar.appendChild(sep);

    const windows = el('div', ''); windows.id = 'taskbar-windows';
    taskbar.appendChild(windows);

    const tray = el('div', ''); tray.id = 'system-tray';
    const trayIcons = el('div', 'tray-icons');
    const volIco = el('span', 'tray-icon'); volIco.textContent = '🔊';
    const netIco = el('span', 'tray-icon'); netIco.textContent = '🌐';
    trayIcons.append(volIco, netIco);
    const clock = el('div', ''); clock.id = 'clock';
    tray.append(trayIcons, clock);
    taskbar.appendChild(tray);

    startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isStartMenuOpen() ? closeStartMenu() : openStartMenu();
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#start-menu') && !e.target.closest('#start-btn')) closeStartMenu();
    });
}

// ── Global Events ─────────────────────────────────────────────────────────────
function attachGlobalEvents() {
    document.addEventListener('mousemove', (e) => {
        if (!dragState) return;
        const desktop = document.getElementById('desktop');
        const dr = desktop.getBoundingClientRect();
        const nx = Math.max(0, Math.min(e.clientX - dr.left - dragState.offsetX, desktop.offsetWidth  - dragState.win.offsetWidth));
        const ny = Math.max(0, Math.min(e.clientY - dr.top  - dragState.offsetY, desktop.offsetHeight - dragState.win.offsetHeight));
        dragState.win.style.left = nx + 'px';
        dragState.win.style.top  = ny + 'px';
    });
    document.addEventListener('mouseup', () => { dragState = null; });
}

// ── Shutdown ──────────────────────────────────────────────────────────────────
function triggerShutdown() {
    window.dispatchEvent(new CustomEvent('knoxiaos:shutdown'));
}

// ── Welcome popup ─────────────────────────────────────────────────────────────
function showWelcomePopup() {
    const desktop = document.getElementById('desktop');
    if (!desktop || document.getElementById('welcome-popup')) return;
    if (sessionStorage.getItem('knoxiaos_welcomed')) return;
    sessionStorage.setItem('knoxiaos_welcomed', '1');

    if (!document.getElementById('popup-kf')) {
        const s = document.createElement('style'); s.id = 'popup-kf';
        s.textContent = '@keyframes popup-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes dot-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}';
        document.head.appendChild(s);
    }

    const popup = el('div', 'xp-window');
    popup.id = 'welcome-popup';
    popup.style.cssText = 'position:absolute;bottom:10px;right:10px;width:260px;animation:popup-in 0.4s cubic-bezier(0.34,1.56,0.64,1);z-index:1200;';

    const tb = el('div', 'xp-titlebar');
    const ico = el('div', 'xp-titlebar-icon'); ico.appendChild(makeXPIcon('knox', 16));
    const title = el('div', 'xp-titlebar-title'); title.textContent = 'Welcome';
    const controls = el('div', 'xp-controls');
    const closeBtn = el('button', 'xp-btn xp-btn-close'); closeBtn.textContent = '✕';
    controls.appendChild(closeBtn);
    tb.append(ico, title, controls);

    const body = el('div', 'xp-window-body');
    body.style.cssText = 'padding:10px;background:white;display:flex;flex-direction:column;gap:8px;';

    const avatarRow = el('div');
    avatarRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const avatar = el('div'); avatar.appendChild(makeXPIcon('knox', 28));
    const nameEl = el('div'); nameEl.style.cssText = 'font-size:12px;font-weight:bold;color:#000;';
    nameEl.textContent = 'Ramsey Knox';
    const onlineDot = el('div'); onlineDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#00aa00;margin-left:auto;box-shadow:0 0 4px rgba(0,170,0,0.5);';
    avatarRow.append(avatar, nameEl, onlineDot);

    const divider = el('div'); divider.style.cssText = 'height:1px;background:#d4d0c8;';

    // Typing dots
    const typingRow = el('div');
    typingRow.style.cssText = 'display:flex;align-items:center;gap:3px;padding:4px 0;';
    for (let i = 0; i < 3; i++) {
        const dot = el('div');
        dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:#888;animation:dot-bounce 1.2s ease-in-out infinite;animation-delay:${i*0.18}s;`;
        typingRow.appendChild(dot);
    }

    body.append(avatarRow, divider, typingRow);
    popup.append(tb, body);
    desktop.appendChild(popup);

    closeBtn.addEventListener('click', () => {
        popup.style.transition = 'opacity 0.2s';
        popup.style.opacity = '0';
        setTimeout(() => popup.remove(), 220);
    });

    // After dots, show message
    setTimeout(() => {
        typingRow.remove();
        const msgBox = el('div');
        msgBox.style.cssText = 'background:#e8f0f8;border:1px solid #c0d0e8;border-radius:3px;padding:7px 9px;font-size:11px;line-height:1.6;color:#000;animation:popup-in 0.3s ease;';
        msgBox.textContent = "Hello! =^) For live chat, open the 'Messenger' app. For my music, open the Media player and listen to some of my songs. Honestly, just explore. Thanks for visiting my website, xo ";
        body.appendChild(msgBox);
        const hint = el('div'); hint.style.cssText = 'font-size:9px;color:#888;text-align:right;';
        hint.textContent = 'click × to close';
        body.appendChild(hint);
    }, 2200);
}

// ── Lock Screen ───────────────────────────────────────────────────────────────
function showLockScreen(onUnlock) {
    const lock = el('div'); lock.id = 'lock-screen';
    lock.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:Tahoma,Verdana,sans-serif;background:linear-gradient(135deg,#0a3a8a,#1464d8,#0a3a8a);';

    if (!document.getElementById('lock-kf')) {
        const s = document.createElement('style'); s.id = 'lock-kf';
        s.textContent = '@keyframes lock-shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-8px)}30%{transform:translateX(8px)}45%{transform:translateX(-5px)}60%{transform:translateX(5px)}75%{transform:translateX(-3px)}90%{transform:translateX(3px)}}@keyframes lock-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
        document.head.appendChild(s);
    }

    const card = el('div');
    card.style.cssText = 'background:white;border:3px solid rgba(255,255,255,0.4);border-radius:4px;padding:32px 36px 24px;width:320px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5);animation:lock-in 0.4s ease;';

    const logoWrap = el('div'); logoWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:12px;';
    logoWrap.appendChild(makeXPIcon('computer', 48));

    const titleEl = el('div'); titleEl.style.cssText = 'font-size:18px;font-weight:bold;color:#0f4fbe;margin-bottom:4px;';
    titleEl.textContent = 'KnoxiaOS';
    const subEl = el('div'); subEl.style.cssText = 'font-size:11px;color:#666;margin-bottom:16px;letter-spacing:0.05em;';
    subEl.textContent = 'MAINTENANCE MODE';

    const divEl = el('div'); divEl.style.cssText = 'height:1px;background:#d4d0c8;margin-bottom:14px;';

    const inputEl = el('input'); inputEl.type = 'password'; inputEl.placeholder = 'Enter password';
    inputEl.style.cssText = 'width:100%;height:26px;border:1px solid #7f9db9;border-radius:1px;padding:0 8px;font-size:11px;font-family:Tahoma,sans-serif;outline:none;margin-bottom:8px;';
    inputEl.style.userSelect = 'text';

    const errEl = el('div'); errEl.style.cssText = 'font-size:11px;color:#cc0000;text-align:center;height:16px;margin-bottom:6px;';

    const btnEl = el('button');
    btnEl.style.cssText = 'width:100%;height:26px;background:linear-gradient(180deg,#245edb,#1a4fa0);border:1px solid #0831a3;border-radius:2px;color:white;font-size:11px;font-weight:bold;font-family:Tahoma,sans-serif;cursor:pointer;';
    btnEl.textContent = 'Log On';

    const inputWrap = el('div'); inputWrap.style.width = '100%';
    inputWrap.append(inputEl, errEl, btnEl);

    card.append(logoWrap, titleEl, subEl, divEl, inputWrap);
    lock.appendChild(card);
    document.body.appendChild(lock);

    requestAnimationFrame(() => inputEl.focus());

    function attempt() {
        if (inputEl.value === LOCK_PASSWORD) {
            lock.style.transition = 'opacity 0.4s';
            lock.style.opacity = '0';
            setTimeout(() => { lock.remove(); onUnlock(); }, 400);
        } else {
            errEl.textContent = 'The password is incorrect. Please try again.';
            inputEl.value = '';
            inputWrap.style.animation = 'none';
            requestAnimationFrame(() => { inputWrap.style.animation = 'lock-shake 0.5s ease'; });
            setTimeout(() => { errEl.textContent = ''; }, 2500);
            inputEl.focus();
        }
    }

    btnEl.addEventListener('click', attempt);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); attempt(); } });
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initOS() {
    if (MAINTENANCE_MODE) {
        showLockScreen(bootDesktop);
    } else {
        bootDesktop();
    }
}

function bootDesktop() {
    buildTaskbar();
    buildStartMenu();
    buildDesktopIcons();
    startClock();
    attachGlobalEvents();
    if (!audio && playlist.length > 0) loadTrack(0);
    setTimeout(showWelcomePopup, 2200);
}

window.KnoxiaOS = { init: initOS };

})();

// ══════════════════════════════════════════════════════════════════════════════
// POLISH ADDITIONS
// ══════════════════════════════════════════════════════════════════════════════

// ── Window resize ─────────────────────────────────────────────────────────────
function makeResizable(win, winObj) {
    const MIN_W = 220, MIN_H = 120;
    const EDGE  = 6; // px from edge that counts as resize zone

    let resizing = false;
    let resizeDir = '';
    let resizeStart = {};

    win.addEventListener('mousemove', (e) => {
        if (resizing || winObj.maximized) return;
        const r  = win.getBoundingClientRect();
        const rx = e.clientX - r.left;
        const ry = e.clientY - r.top;
        const onL = rx < EDGE;
        const onR = rx > r.width  - EDGE;
        const onT = ry < EDGE;
        const onB = ry > r.height - EDGE;

        if      (onL && onT) win.style.cursor = 'nw-resize';
        else if (onR && onT) win.style.cursor = 'ne-resize';
        else if (onL && onB) win.style.cursor = 'sw-resize';
        else if (onR && onB) win.style.cursor = 'se-resize';
        else if (onL)        win.style.cursor = 'w-resize';
        else if (onR)        win.style.cursor = 'e-resize';
        else if (onT)        win.style.cursor = 'n-resize';
        else if (onB)        win.style.cursor = 's-resize';
        else                 win.style.cursor = '';
    });

    win.addEventListener('mousedown', (e) => {
        if (winObj.maximized) return;
        const r  = win.getBoundingClientRect();
        const rx = e.clientX - r.left;
        const ry = e.clientY - r.top;
        const onL = rx < EDGE;
        const onR = rx > r.width  - EDGE;
        const onT = ry < EDGE;
        const onB = ry > r.height - EDGE;

        if (!onL && !onR && !onT && !onB) return;
        e.preventDefault();
        e.stopPropagation();
        resizing   = true;
        resizeDir  = (onT?'n':'') + (onB?'s':'') + (onL?'w':'') + (onR?'e':'');
        resizeStart = {
            mouseX: e.clientX, mouseY: e.clientY,
            x: r.left, y: r.top,
            w: r.width, h: r.height,
        };
        window._resizeWin    = win;
        window._resizeObj    = winObj;
        window._resizeDir    = resizeDir;
        window._resizeStart  = resizeStart;
        window._resizing     = true;
        window._resizeMinW   = MIN_W;
        window._resizeMinH   = MIN_H;
    });

    win.addEventListener('mouseleave', () => {
        if (!resizing) win.style.cursor = '';
    });
}

// Attach resize mousemove/mouseup to document once
(function attachResizeListeners() {
    document.addEventListener('mousemove', (e) => {
        if (!window._resizing) return;
        const s   = window._resizeStart;
        const dir = window._resizeDir;
        const win = window._resizeWin;
        const desktop = document.getElementById('desktop');
        if (!desktop || !win) return;
        const dr  = desktop.getBoundingClientRect();
        const dx  = e.clientX - s.mouseX;
        const dy  = e.clientY - s.mouseY;

        let nx = s.x - dr.left;
        let ny = s.y - dr.top;
        let nw = s.w;
        let nh = s.h;

        if (dir.includes('e')) nw = Math.max(window._resizeMinW, s.w + dx);
        if (dir.includes('s')) nh = Math.max(window._resizeMinH, s.h + dy);
        if (dir.includes('w')) { nw = Math.max(window._resizeMinW, s.w - dx); nx = s.x - dr.left + (s.w - nw); }
        if (dir.includes('n')) { nh = Math.max(window._resizeMinH, s.h - dy); ny = s.y - dr.top  + (s.h - nh); }

        win.style.left   = nx + 'px';
        win.style.top    = ny + 'px';
        win.style.width  = nw + 'px';
        win.style.height = nh + 'px';
        win.style.cursor = window._resizeDir.length === 1
            ? ({'n':'n','s':'s','e':'e','w':'w'}[window._resizeDir] + '-resize')
            : window._resizeDir + '-resize';
    });
    document.addEventListener('mouseup', () => {
        if (window._resizing) {
            window._resizing = false;
            if (window._resizeWin) window._resizeWin.style.cursor = '';
        }
    });
})();

// ── Right-click context menu ──────────────────────────────────────────────────
function buildContextMenu(items, x, y) {
    removeContextMenu();
    const menu = el('div', 'xp-context-menu');
    menu.id = 'xp-context-menu';
    menu.style.position = 'absolute';
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    items.forEach(item => {
        if (item === null) { menu.appendChild(el('div', 'xp-context-sep')); return; }
        const row = el('div', 'xp-context-item' + (item.disabled ? ' disabled' : ''));
        const ico = el('span', 'xp-context-ico');
        if (item.iconType) ico.appendChild(makeXPIcon(item.iconType, 16));
        else ico.textContent = item.icon || '';
        const lbl = el('span', 'xp-context-lbl');
        lbl.textContent = item.label;
        row.append(ico, lbl);
        if (!item.disabled) {
            row.addEventListener('click', () => { removeContextMenu(); item.action(); });
        }
        menu.appendChild(row);
    });

    document.getElementById('desktop')?.appendChild(menu);

    requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        if (r.right  > window.innerWidth)  menu.style.left = (x - r.width)  + 'px';
        if (r.bottom > window.innerHeight) menu.style.top  = (y - r.height) + 'px';
    });

    setTimeout(() => {
        document.addEventListener('click', removeContextMenu, { once: true });
    }, 0);
}

function removeContextMenu() {
    document.getElementById('xp-context-menu')?.remove();
}
