/**
 * KnoxiaOS — os.js (Aqua Y2K)
 * Fixed window management: minimize/maximize/restore all work.
 * Dock shows running apps with restore on click.
 */

(function () {
    'use strict';

    // ── State ────────────────────────────────────────────────────────────
    let windows     = [];
    let nextZ       = 1100;
    let focusedId   = null;
    let dragState   = null;

    // ── Virtual Filesystem ───────────────────────────────────────────────
    const VFS = {
        'My Music': {
            type: 'folder',
            children: {
                'track_01.mp3': { type: 'audio', label: 'Track 01', url: './music/track_01.mp3' },
                'track_02.mp3': { type: 'audio', label: 'Track 02', url: './music/track_02.mp3' },
                'track_03.mp3': { type: 'audio', label: 'Track 03', url: './music/track_03.mp3' },
            }
        },
        'My Documents': {
            type: 'folder',
            children: {
                'readme.txt': { type: 'text', label: 'readme.txt', content: 'Welcome to KnoxiaOS.\n\nThis is an interactive archive of music by Ramsey Knox.\n\nExplore the files to find more.' },
                'lyrics.txt': { type: 'text', label: 'lyrics.txt', content: '' },
                'about.txt':  { type: 'text', label: 'about.txt',  content: 'Ramsey Knox is a producer and vocalist based in Stockholm.\n\nMaking old-school R&B for new ears.' },
            }
        },
        'Recycle Bin': { type: 'folder', children: {} }
    };

    // ── App registry — shared icon/color definitions ──────────────────────
    // Every icon is the same shape (rounded square) with a unique gradient.
    // Emoji is used as the glyph — consistent size and centering everywhere.
    const APPS = {
        music_player: { label: 'Media Player', emoji: '♪',  bg: 'linear-gradient(145deg,#4488dd,#1a55aa)', id: 'music_player' },
        explorer:     { label: 'My Files',     emoji: '◫',  bg: 'linear-gradient(145deg,#44aadd,#1a77aa)', id: 'explorer'     },
        my_music:     { label: 'My Music',     emoji: '♫',  bg: 'linear-gradient(145deg,#4488dd,#1a55aa)', id: 'my_music'     },
        notepad:      { label: 'Notepad',      emoji: '≡',  bg: 'linear-gradient(145deg,#ddaa22,#aa7700)', id: 'notepad'      },
        sys_info:     { label: 'About',        emoji: '◎',  bg: 'linear-gradient(145deg,#8855cc,#5522aa)', id: 'sys_info'     },
        orbit:        { label: 'Orbit',        emoji: '⊛',  bg: 'linear-gradient(145deg,#22ccaa,#116688)', id: 'orbit'        },
        trash:        { label: 'Trash',        emoji: '⊘',  bg: 'linear-gradient(145deg,#888899,#555566)', id: 'trash'        },
    };

    const DOCK_CONFIG = [
        'music_player', 'explorer', 'notepad', 'sys_info', 'orbit',
    ];

    const DESKTOP_ICONS = [
        { app: 'explorer',     x: 20, y: 40  },
        { app: 'my_music',     x: 20, y: 130 },
        { app: 'notepad',      x: 20, y: 220 },
        { app: 'music_player', x: 20, y: 310 },
        { app: 'orbit',        x: 20, y: 400 },
    ];

    // ── Music Player State ───────────────────────────────────────────────
    const playlist = Object.entries(VFS['My Music'].children)
        .filter(([, v]) => v.type === 'audio').map(([, v]) => v);

    let audio = null, currentTrack = 0;
    let audioCtx = null, analyser = null, sourceNode = null;
    let eqData = new Uint8Array(32);

    function ensureAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser  = audioCtx.createAnalyser();
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
    }

    function playTrack(fromStart = false) {
        if (!audio) loadTrack(currentTrack);
        if (fromStart) audio.currentTime = 0;
        audioCtx.resume().then(() => audio.play());
    }

    function pauseTrack() { if (audio) audio.pause(); }
    function stopTrack()  { if (audio) { audio.pause(); audio.currentTime = 0; } }
    function nextTrack()  { loadTrack((currentTrack + 1) % playlist.length); playTrack(true); }
    function prevTrack()  { loadTrack((currentTrack - 1 + playlist.length) % playlist.length); playTrack(true); }
    function seekTo(r)    { if (audio?.duration) audio.currentTime = r * audio.duration; }
    function getProgress(){ return (!audio || !audio.duration) ? 0 : audio.currentTime / audio.duration; }
    function fmtTime(s)   { return (!s || isNaN(s)) ? '0:00' : `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; }

    // ── Notepad Storage ──────────────────────────────────────────────────
    function getVFSNode(path) {
        const p = path.split('/').filter(Boolean);
        return p.length === 2 ? VFS[p[0]]?.children[p[1]] ?? null : null;
    }
    function loadNote(path)       { return localStorage.getItem(`knoxiaos_${path}`) ?? (getVFSNode(path)?.content ?? ''); }
    function saveNote(path, text) { localStorage.setItem(`knoxiaos_${path}`, text); }

    // ── DOM helpers ──────────────────────────────────────────────────────
    function el(tag, cls) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        return e;
    }

    // Build the consistent Aqua icon tile
    function makeIcon(appId, size = 32) {
        const app  = APPS[appId] || APPS.explorer;
        const wrap = el('div', 'aqua-icon');
        wrap.style.cssText = [
            `width:${size}px`, `height:${size}px`,
            `border-radius:${Math.round(size * 0.22)}px`,
            `background:${app.bg}`,
            `font-size:${Math.round(size * 0.5)}px`,
            `box-shadow:0 2px 6px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.35)`,
            'display:flex', 'align-items:center', 'justify-content:center',
            'position:relative', 'overflow:hidden', 'flex-shrink:0',
            'color:white', 'font-style:normal', 'line-height:1',
            'user-select:none',
        ].join(';');
        wrap.textContent = app.emoji;

        const gloss = el('div');
        gloss.style.cssText = `position:absolute;top:0;left:0;right:0;height:52%;background:rgba(255,255,255,0.25);border-radius:${Math.round(size*0.22)}px ${Math.round(size*0.22)}px 0 0;pointer-events:none;`;
        wrap.appendChild(gloss);
        return wrap;
    }

    // ── Window Manager ───────────────────────────────────────────────────
    function createWindow({ id, title, width, height, x, y, content }) {
        // Bring to front if already open
        const existing = windows.find(w => w.id === id);
        if (existing) {
            if (existing.minimized) restoreWindow(id);
            else focusWindow(id);
            return existing;
        }

        const desktop = document.getElementById('desktop');
        const dw = desktop.offsetWidth, dh = desktop.offsetHeight;
        x = x ?? Math.max(30, Math.floor((dw - width)  / 2) + (windows.length * 28) % 180);
        y = y ?? Math.max(30, Math.floor((dh - height) / 2) + (windows.length * 28) % 120);

        const win = el('div', 'xp-window');
        win.dataset.winId = id;
        win.style.cssText = `width:${width}px;height:${height}px;left:${x}px;top:${y}px;`;
        win.style.zIndex  = ++nextZ;

        // ── Titlebar ──────────────────────────────────────────────────
        const titlebar = el('div', 'xp-titlebar');

        // Traffic lights — LEFT side
        const tlGroup = el('div', 'xp-controls');
        const closeBtn   = el('button', 'xp-btn xp-btn-close');
        const minBtn     = el('button', 'xp-btn xp-btn-minimize');
        const restoreBtn = el('button', 'xp-btn xp-btn-maximize');
        restoreBtn.title = 'Maximize';
        tlGroup.append(closeBtn, minBtn, restoreBtn);

        // Title — centered absolutely so it can't push the lights
        const titleEl = el('div', 'xp-titlebar-title');
        titleEl.textContent = title;

        titlebar.append(tlGroup, titleEl);

        const body = el('div', 'xp-window-body');
        if (content) body.appendChild(content);

        win.append(titlebar, body);
        desktop.appendChild(win);

        const winObj = {
            id, el: win, titlebar, body,
            minimized: false, maximized: false,
            normalRect: { x, y, w: width, h: height },
            title,
        };
        windows.push(winObj);
        focusWindow(id);
        updateDockRunningStates();

        // ── Drag titlebar ──────────────────────────────────────────────
        titlebar.addEventListener('mousedown', (e) => {
            if (e.target === closeBtn || e.target === minBtn || e.target === restoreBtn) return;
            e.preventDefault();
            focusWindow(id);
            if (winObj.maximized) return;
            const r = win.getBoundingClientRect();
            dragState = { win, offsetX: e.clientX - r.left, offsetY: e.clientY - r.top };
        });

        // Double-click titlebar = toggle maximize
        titlebar.addEventListener('dblclick', (e) => {
            if (e.target === closeBtn || e.target === minBtn || e.target === restoreBtn) return;
            toggleMaximize(id);
        });

        closeBtn.addEventListener('click',   () => closeWindow(id));
        minBtn.addEventListener('click',     () => minimizeWindow(id));
        restoreBtn.addEventListener('click', () => toggleMaximize(id));
        win.addEventListener('mousedown',    () => focusWindow(id));

        // Update green button tooltip based on state
        function syncMaxBtn() {
            restoreBtn.title = winObj.maximized ? 'Restore' : 'Maximize';
        }
        syncMaxBtn();
        // Patch toggleMaximize to sync button after each toggle
        const _origToggle = toggleMaximize;
        restoreBtn._syncState = syncMaxBtn;

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
        updateDockRunningStates();
    }

    function closeWindow(id) {
        const idx = windows.findIndex(w => w.id === id);
        if (idx < 0) return;
        if (id === 'music_player') stopTrack();
        windows[idx].el.remove();
        windows.splice(idx, 1);
        updateDockRunningStates();
    }

    function minimizeWindow(id) {
        const w = windows.find(w => w.id === id);
        if (!w || w.minimized) return;
        w.minimized = true;
        // Animate shrink to dock then hide
        w.el.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
        w.el.style.transformOrigin = 'bottom center';
        w.el.style.transform = 'scale(0.1) translateY(200px)';
        w.el.style.opacity   = '0';
        setTimeout(() => {
            w.el.style.display = 'none';
            w.el.style.transition = '';
            w.el.style.transform  = '';
            w.el.style.opacity    = '';
        }, 180);
        updateDockRunningStates();
    }

    function restoreWindow(id) {
        const w = windows.find(w => w.id === id);
        if (!w) return;
        if (w.minimized) {
            w.minimized = false;
            w.el.style.display = 'flex';
            // Animate pop up from dock
            w.el.style.transform  = 'scale(0.1) translateY(200px)';
            w.el.style.opacity    = '0';
            w.el.style.transition = 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s ease';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    w.el.style.transform = 'scale(1) translateY(0)';
                    w.el.style.opacity   = '1';
                });
            });
            setTimeout(() => {
                w.el.style.transition = '';
                w.el.style.transform  = '';
                w.el.style.opacity    = '';
            }, 220);
        }
        focusWindow(id);
        updateDockRunningStates();
    }

    function toggleMaximize(id) {
        const w = windows.find(w => w.id === id);
        if (!w) return;
        const desktop = document.getElementById('desktop');
        if (!w.maximized) {
            const r = w.el.getBoundingClientRect(), dr = desktop.getBoundingClientRect();
            w.normalRect = { x: r.left-dr.left, y: r.top-dr.top, w: w.el.offsetWidth, h: w.el.offsetHeight };
            Object.assign(w.el.style, { left:'0px', top:'0px', width:desktop.offsetWidth+'px', height:desktop.offsetHeight+'px' });
            w.maximized = true;
        } else {
            Object.assign(w.el.style, { left:w.normalRect.x+'px', top:w.normalRect.y+'px', width:w.normalRect.w+'px', height:w.normalRect.h+'px' });
            w.maximized = false;
        }
        // Sync green button appearance
        const greenBtn = w.el.querySelector('.xp-btn-maximize, .xp-btn-restore');
        if (greenBtn) greenBtn.title = w.maximized ? 'Restore to window' : 'Maximize';
        // When maximized, show a small inner indicator (two overlapping squares)
        if (greenBtn) greenBtn.textContent = w.maximized ? '⊡' : '';
    }

    // ── Dock running states ───────────────────────────────────────────────
    // Dock icons get a dot when their app is open, and clicking restores if minimized.
    function updateDockRunningStates() {
        const dock = document.getElementById('dock');
        if (!dock) return;
        dock.querySelectorAll('.dock-icon[data-app]').forEach(iconEl => {
            const appId = iconEl.dataset.app;
            const win   = windows.find(w => w.id === appId || w.id.startsWith(appId));
            const isOpen = !!win;
            const isFocused = win && win.id === focusedId;

            // Running dot
            let dot = iconEl.querySelector('.running-dot');
            if (isOpen && !dot) {
                dot = el('div', 'running-dot');
                iconEl.appendChild(dot);
            } else if (!isOpen && dot) {
                dot.remove();
            }

            iconEl.classList.toggle('dock-focused', isFocused);
        });
    }

    // ── Menubar ──────────────────────────────────────────────────────────
    function buildMenubar() {
        const bar = document.getElementById('menubar');
        if (!bar) return;

        const globe = el('div', 'menubar-globe');
        globe.id = 'menubar-globe';
        globe.title = 'Applications';
        bar.appendChild(globe);

        ['KnoxiaOS', 'Finder', 'File', 'View', 'Window'].forEach((label, i) => {
            const item = el('span', 'menubar-item' + (i === 0 ? ' brand' : ''));
            item.textContent = label;
            bar.appendChild(item);
        });

        const right = el('div', 'menubar-right');

        // Volume icon
        const vol = el('span', 'menubar-item menubar-icon');
        vol.textContent = '🔊';
        vol.title = 'Volume';

        // Clock
        const clock = el('span', 'menubar-item');
        clock.id = 'clock';

        right.append(vol, clock);
        bar.appendChild(right);
    }

    function startClock() {
        function tick() {
            const clockEl = document.getElementById('clock');
            if (!clockEl) return;
            const now  = new Date();
            const time = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
            const day  = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
            clockEl.textContent = `${day}  ${time}`;
        }
        tick();
        setInterval(tick, 1000);
    }

    // ── Dock ─────────────────────────────────────────────────────────────
    function buildDock() {
        const dock = document.getElementById('dock');
        if (!dock) return;

        DOCK_CONFIG.forEach(appId => {
            if (!appId) { dock.appendChild(el('div', 'dock-sep')); return; }
            const app    = APPS[appId];
            const iconEl = el('div', 'dock-icon');
            iconEl.dataset.app = appId;
            iconEl.title = app.label;

            // Icon face using the shared makeIcon helper (larger for dock)
            const face = makeIcon(appId, 40);
            face.style.width  = '100%';
            face.style.height = '100%';
            face.style.borderRadius = 'inherit';
            face.style.position = 'absolute';
            face.style.inset = '0';
            iconEl.appendChild(face);

            iconEl.addEventListener('click', () => {
                const existing = windows.find(w => w.id === appId || w.id.startsWith(appId + '_'));
                if (existing) {
                    if (existing.minimized) restoreWindow(existing.id);
                    else if (existing.id === focusedId) minimizeWindow(existing.id);
                    else focusWindow(existing.id);
                } else {
                    launchApp(appId);
                }
            });

            dock.appendChild(iconEl);
        });
    }

    // ── App Menu ─────────────────────────────────────────────────────────
    function buildAppMenu() {
        const menu = document.getElementById('app-menu');
        if (!menu) return;

        const header = el('div', 'app-menu-header');
        const avatar = el('div', 'app-menu-avatar');
        const name   = el('div', 'app-menu-username');
        name.textContent = 'Ramsey Knox';
        header.append(avatar, name);

        const body = el('div', 'app-menu-body');

        ['music_player', 'explorer', 'notepad', 'sys_info', 'orbit'].forEach(appId => {
            const app = APPS[appId];
            const row = el('div', 'app-menu-item');
            const ico = makeIcon(appId, 20);
            const lbl = el('span'); lbl.textContent = app.label;
            row.append(ico, lbl);
            row.addEventListener('click', () => { launchApp(appId); closeAppMenu(); });
            body.appendChild(row);
        });

        const div = el('div', 'app-menu-divider');
        body.appendChild(div);

        const footer = el('div', 'app-menu-footer');
        const shutBtn = el('button', 'app-menu-footer-btn');
        shutBtn.textContent = 'Shut Down…';
        shutBtn.addEventListener('click', () => { closeAppMenu(); triggerShutdown(); });
        footer.appendChild(shutBtn);

        menu.append(header, body, footer);
    }

    function openAppMenu()  { document.getElementById('app-menu')?.classList.add('open'); }
    function closeAppMenu() { document.getElementById('app-menu')?.classList.remove('open'); }
    function isAppMenuOpen(){ return !!document.getElementById('app-menu')?.classList.contains('open'); }

    // ── App Launchers ────────────────────────────────────────────────────
    function launchApp(id, opts) {
        if (id === 'explorer')     return openExplorer(opts?.path ?? null);
        if (id === 'my_music')     return openExplorer('My Music');
        if (id === 'notepad')      return openNotepad(opts?.path ?? 'My Documents/readme.txt');
        if (id === 'music_player') return openMusicPlayer();
        if (id === 'sys_info')     return openSysInfo();
        if (id === 'orbit')        return window.dispatchEvent(new CustomEvent('knoxiaos:orbit'));
    }

    // ── Explorer ─────────────────────────────────────────────────────────
    function openExplorer(startPath) {
        let currentPath = startPath ?? null;
        const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

        const toolbar = el('div', 'xp-toolbar');
        const backBtn = el('button', 'xp-toolbar-btn'); backBtn.textContent = '← Back';
        const upBtn   = el('button', 'xp-toolbar-btn'); upBtn.textContent   = '↑ Up';
        toolbar.append(backBtn, upBtn);

        const addrBar   = el('div', 'explorer-address-bar');
        const addrLabel = el('span', 'explorer-address-label'); addrLabel.textContent = 'Path:';
        const addrInput = el('input', 'explorer-address-input'); addrInput.readOnly = true;
        addrBar.append(addrLabel, addrInput);

        const layout  = el('div', 'explorer-layout'); layout.style.flex = '1';
        const sidebar = el('div', 'explorer-sidebar');

        // Sidebar sections
        [{ title: 'Places', items: [
            { name: 'My Music',     appId: 'music_player' },
            { name: 'My Documents', appId: 'notepad'      },
            { name: 'Recycle Bin',  appId: 'trash'        },
        ]}].forEach(({ title, items }) => {
            const sec   = el('div', 'explorer-sidebar-section');
            const stitle = el('span', 'explorer-sidebar-title'); stitle.textContent = title;
            sec.appendChild(stitle);
            items.forEach(({ name, appId }) => {
                const row = el('div', 'explorer-sidebar-item');
                const ico = makeIcon(appId, 14);
                ico.style.borderRadius = '3px';
                const lbl = el('span'); lbl.textContent = name;
                row.append(ico, lbl);
                row.addEventListener('click', () => navigate(name));
                sec.appendChild(row);
            });
            sidebar.appendChild(sec);
        });

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
            addrInput.value = currentPath ? `KnoxiaOS › ${currentPath}` : 'KnoxiaOS';
            sidebar.querySelectorAll('.explorer-sidebar-item').forEach(s => s.classList.remove('active'));

            let items = [];
            if (!currentPath) {
                items = Object.keys(VFS).map(name => ({ name, type:'folder' }));
            } else {
                const folder = VFS[currentPath];
                if (!folder) return;
                items = Object.entries(folder.children || {}).map(([name, node]) => ({ name, node, type: node.type }));
                sidebar.querySelectorAll('.explorer-sidebar-item').forEach(s => {
                    if (s.querySelector('span')?.textContent === currentPath) s.classList.add('active');
                });
            }

            statusPanel.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

            items.forEach(({ name, node, type }) => {
                const appId = type === 'audio' ? 'music_player' : type === 'text' ? 'notepad' : 'explorer';
                const item  = el('div', 'explorer-item');
                const ico   = makeIcon(appId, 32);
                const lbl   = el('span'); lbl.textContent = name;
                item.append(ico, lbl);

                item.addEventListener('click', () => {
                    grid.querySelectorAll('.explorer-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                });
                item.addEventListener('dblclick', () => {
                    if (type === 'folder') navigate(currentPath ? currentPath + '/' + name : name);
                    else if (type === 'text')  openNotepad(`${currentPath}/${name}`, node);
                    else if (type === 'audio') {
                        const idx = playlist.findIndex(p => p.url === node.url);
                        openMusicPlayer();
                        if (idx >= 0) { loadTrack(idx); playTrack(true); }
                    }
                });
                grid.appendChild(item);
            });
        }

        backBtn.addEventListener('click', () => { currentPath = null; renderGrid(); });
        upBtn.addEventListener('click',   () => { currentPath = null; renderGrid(); });

        const winObj = createWindow({ id:'explorer', title:'My Files', width:520, height:360, content:wrap });
        if (startPath) navigate(startPath); else renderGrid();
        return winObj;
    }

    // ── Notepad ──────────────────────────────────────────────────────────
    function openNotepad(path, node) {
        const resolved = node ?? getVFSNode(path);
        const id = 'notepad_' + path.replace(/\W/g, '_');
        const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';

        const menubar = el('div', 'xp-menubar');
        ['File','Edit','Format','Help'].forEach(lbl => {
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
            const txt   = textarea.value.substring(0, textarea.selectionStart);
            const lines = txt.split('\n');
            linePanel.textContent = `Ln ${lines.length}, Col ${lines[lines.length-1].length+1}`;
        });
        statusbar.appendChild(linePanel);
        wrap.append(menubar, textarea, statusbar);

        return createWindow({
            id, width:420, height:320, content:wrap,
            title:`${resolved?.label ?? path.split('/').pop()} — Notepad`,
        });
    }

    // ── Music Player ─────────────────────────────────────────────────────
    function openMusicPlayer() {
        // Inject EQ keyframes once
        if (!document.getElementById('eq-kf')) {
            const s = document.createElement('style'); s.id = 'eq-kf';
            s.textContent = [
                '@keyframes eq1{0%,100%{height:3px}50%{height:14px}}',
                '@keyframes eq2{0%,100%{height:9px}50%{height:3px}}',
                '@keyframes eq3{0%,100%{height:5px}50%{height:16px}}',
                '@keyframes eq4{0%,100%{height:13px}50%{height:4px}}',
                '@keyframes eq5{0%,100%{height:4px}50%{height:12px}}',
            ].join('');
            document.head.appendChild(s);
        }

        const body = el('div', 'player-body');

        // LCD panel
        const lcd = el('div', 'player-lcd');

        // EQ visualizer
        const eq   = el('div', 'player-eq');
        const bars = [];
        const KF   = ['eq1','eq2','eq3','eq4','eq5'];
        const DL   = ['0s','0.11s','0.22s','0.07s','0.29s','0.15s','0.04s','0.18s'];
        for (let i = 0; i < 10; i++) {
            const b = el('div', 'player-eq-bar');
            b.style.cssText = `animation:${KF[i%5]} ${(0.7+i*0.05).toFixed(2)}s ease-in-out infinite ${DL[i%8]};`;
            bars.push(b); eq.appendChild(b);
        }

        const trackLbl = el('div', 'player-lcd-track');
        trackLbl.textContent = playlist[currentTrack]?.label ?? 'No Track';

        const timeLbl = el('div', 'player-lcd-time');
        timeLbl.textContent = '0:00  /  0:00';

        const progTrack = el('div', 'player-progress-track');
        const progFill  = el('div', 'player-progress-fill');
        progFill.style.width = '0%';
        progTrack.appendChild(progFill);

        lcd.append(eq, trackLbl, timeLbl, progTrack);

        // Transport controls
        const controls = el('div', 'player-controls');
        const prevBtn  = el('button', 'player-btn');                prevBtn.textContent  = '⏮';
        const rwdBtn   = el('button', 'player-btn');                rwdBtn.textContent   = '⏪';
        const playBtn  = el('button', 'player-btn player-btn-play'); playBtn.textContent = '▶';
        const pauseBtn = el('button', 'player-btn');                pauseBtn.textContent = '⏸';
        const ffwBtn   = el('button', 'player-btn');                ffwBtn.textContent   = '⏩';
        const nextBtn  = el('button', 'player-btn');                nextBtn.textContent  = '⏭';
        controls.append(prevBtn, rwdBtn, playBtn, pauseBtn, ffwBtn, nextBtn);

        // Volume row with knob
        const volRow   = el('div', 'player-volume');
        const volLabel = el('div', 'player-volume-label'); volLabel.textContent = 'VOL';
        const volTrack = el('div', 'player-volume-slider');
        const volFill  = el('div', 'player-volume-fill'); volFill.style.width = '80%';
        const volKnob  = el('div', 'player-volume-knob');
        volKnob.style.left = '80%';
        volTrack.append(volFill, volKnob);
        volRow.append(volLabel, volTrack);

        body.append(lcd, controls, volRow);

        // Events
        prevBtn.addEventListener('click', prevTrack);
        nextBtn.addEventListener('click', nextTrack);
        playBtn.addEventListener('click', () => playTrack());
        pauseBtn.addEventListener('click', pauseTrack);
        rwdBtn.addEventListener('mousedown', () => { if (audio) audio.currentTime = Math.max(0, audio.currentTime - 10); });
        ffwBtn.addEventListener('mousedown', () => { if (audio && audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); });

        progTrack.addEventListener('click', (e) => {
            const r = progTrack.getBoundingClientRect();
            seekTo((e.clientX - r.left) / r.width);
        });

        let volDrag = false;
        function setVolFromEvent(e) {
            const r = volTrack.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            if (audio) audio.volume = ratio;
            const pct = (ratio * 100).toFixed(0) + '%';
            volFill.style.width  = pct;
            volKnob.style.left   = pct;
        }
        volTrack.addEventListener('mousedown', (e) => { volDrag = true; setVolFromEvent(e); });
        document.addEventListener('mousemove', (e) => { if (volDrag) setVolFromEvent(e); });
        document.addEventListener('mouseup',   ()  => { volDrag = false; });

        // Animation loop
        let playerRAF;
        function tick() {
            const playing = audio && !audio.paused;
            trackLbl.textContent = (playing ? '▶  ' : '⏸  ') + (playlist[currentTrack]?.label ?? 'No Track');
            timeLbl.textContent  = `${fmtTime(audio?.currentTime)}  /  ${fmtTime(audio?.duration)}`;
            progFill.style.width = (getProgress() * 100).toFixed(1) + '%';
            playBtn.classList.toggle('active',  playing);
            pauseBtn.classList.toggle('active', !playing && audio !== null);

            if (playing && analyser) {
                analyser.getByteFrequencyData(eqData);
                bars.forEach((b, i) => {
                    const v = (eqData[Math.floor(i / bars.length * eqData.length)] / 255) * 16;
                    b.style.height = Math.max(2, v) + 'px';
                    b.style.animationPlayState = 'paused';
                });
            } else {
                bars.forEach(b => { b.style.animationPlayState = 'running'; });
            }

            playerRAF = requestAnimationFrame(tick);
        }
        tick();

        const winObj = createWindow({ id:'music_player', title:'Knoxia Media Player', width:260, height:210, content:body });
        winObj.el.querySelector('.xp-btn-close').addEventListener('click', () => cancelAnimationFrame(playerRAF), { once:true });
        return winObj;
    }

    // ── System Info ──────────────────────────────────────────────────────
    function openSysInfo() {
        const body = el('div', 'sysinfo-body');

        const header = el('div', 'sysinfo-header');
        const logo   = el('div', 'sysinfo-logo');
        const info   = el('div');
        const name   = el('div', 'sysinfo-os-name');    name.textContent = 'KnoxiaOS';
        const ver    = el('div', 'sysinfo-os-version'); ver.textContent  = 'Version 1.0.4 · Build 2025';
        info.append(name, ver);
        header.append(logo, info);
        body.appendChild(header);

        const divider = el('div', 'sysinfo-divider');
        body.appendChild(divider);

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

        return createWindow({ id:'sys_info', title:'About KnoxiaOS', width:320, height:310, content:body });
    }

    // ── Desktop Icons ────────────────────────────────────────────────────
    function buildDesktopIcons() {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;

        DESKTOP_ICONS.forEach(({ app: appId, x, y }) => {
            const app    = APPS[appId];
            const iconEl = el('div', 'desktop-icon');
            iconEl.style.left = x + 'px';
            iconEl.style.top  = y + 'px';

            const img = makeIcon(appId, 36);
            const lbl = el('span'); lbl.textContent = app.label;
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
                    launchApp(appId);
                }
            });
            desktop.appendChild(iconEl);
        });

        desktop.addEventListener('click', (e) => {
            if (e.target === desktop) {
                desktop.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
                closeAppMenu();
            }
        });
    }

    // ── Global Events ────────────────────────────────────────────────────
    function attachGlobalEvents() {
        // Window drag
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

        // Globe opens app menu
        document.addEventListener('click', (e) => {
            const globe = document.getElementById('menubar-globe');
            if (globe && (e.target === globe || globe.contains(e.target))) {
                e.stopPropagation();
                isAppMenuOpen() ? closeAppMenu() : openAppMenu();
                return;
            }
            if (!e.target.closest('#app-menu')) closeAppMenu();
        });
    }

    // ── Shutdown ─────────────────────────────────────────────────────────
    function triggerShutdown() {
        window.dispatchEvent(new CustomEvent('knoxiaos:shutdown'));
    }

    // ── Init ─────────────────────────────────────────────────────────────
    // ── Lock screen ──────────────────────────────────────────────────────
    const MAINTENANCE_MODE = true;  // set false to disable lock screen
    const LOCK_PASSWORD    = 'knoxialover';

    function showLockScreen(onUnlock) {
        const lock = el('div');
        lock.id = 'lock-screen';
        lock.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:9999',
            'display:flex', 'align-items:center', 'justify-content:center',
            'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
            'background:rgba(0,0,8,0.96)',
        ].join(';');

        // Inject lock screen keyframes
        if (!document.getElementById('lock-kf')) {
            const s = document.createElement('style');
            s.id = 'lock-kf';
            s.textContent = [
                '@keyframes lock-shake{0%,100%{transform:translateX(0)}',
                '15%{transform:translateX(-8px)}',
                '30%{transform:translateX(8px)}',
                '45%{transform:translateX(-6px)}',
                '60%{transform:translateX(6px)}',
                '75%{transform:translateX(-3px)}',
                '90%{transform:translateX(3px)}}',
                '@keyframes lock-fadein{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
            ].join('');
            document.head.appendChild(s);
        }

        // Card
        const card = el('div');
        card.style.cssText = [
            'background:linear-gradient(180deg,rgba(220,232,252,0.97),rgba(200,218,245,0.97))',
            'border:1px solid rgba(100,140,210,0.5)',
            'border-radius:14px',
            'padding:36px 40px 28px',
            'width:320px',
            'display:flex', 'flex-direction:column', 'align-items:center', 'gap:14px',
            'box-shadow:0 24px 60px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.5)',
            'animation:lock-fadein 0.5s ease',
        ].join(';');

        // Globe orb
        const orb = el('div');
        orb.style.cssText = [
            'width:56px', 'height:56px', 'border-radius:50%',
            'background:conic-gradient(from 180deg,#1144aa,#3388ff,#1144aa,#0a2266,#3388ff,#1144aa)',
            'border:2px solid #0a2266',
            'box-shadow:0 4px 16px rgba(0,50,180,0.5),inset 0 2px 0 rgba(255,255,255,0.3)',
            'position:relative', 'overflow:hidden', 'flex-shrink:0',
        ].join(';');
        const orbGloss = el('div');
        orbGloss.style.cssText = 'position:absolute;top:4px;left:8px;width:16px;height:13px;background:rgba(255,255,255,0.38);border-radius:50%;transform:rotate(-20deg);';
        orb.appendChild(orbGloss);

        // Title
        const title = el('div');
        title.style.cssText = 'font-size:17px;font-weight:700;color:#0a1a2a;letter-spacing:-0.01em;';
        title.textContent = 'KnoxiaOS';

        // Subtitle
        const sub = el('div');
        sub.style.cssText = 'font-size:11px;color:#4a6a8a;font-weight:500;letter-spacing:0.04em;margin-top:-8px;';
        sub.textContent = 'MAINTENANCE MODE';

        // Divider
        const div = el('div');
        div.style.cssText = 'height:1px;width:100%;background:linear-gradient(90deg,transparent,rgba(80,120,180,0.3),transparent);';

        // Input wrapper (for shake animation)
        const inputWrap = el('div');
        inputWrap.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:8px;';

        const input = el('input');
        input.type        = 'password';
        input.placeholder = 'Enter password';
        input.autocomplete = 'off';
        input.style.cssText = [
            'width:100%', 'height:36px',
            'background:white',
            'border:1px solid rgba(80,120,180,0.4)',
            'border-radius:7px',
            'padding:0 12px',
            'font-size:13px',
            'color:#1a2a3a',
            'outline:none',
            'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
            'box-shadow:inset 0 1px 3px rgba(0,0,0,0.08)',
            'box-sizing:border-box',
        ].join(';');
        input.style.userSelect = 'text';

        const errMsg = el('div');
        errMsg.style.cssText = 'font-size:11px;color:#cc2222;text-align:center;height:14px;font-weight:500;';

        inputWrap.append(input, errMsg);

        // Submit button
        const btn = el('button');
        btn.textContent = 'Unlock';
        btn.style.cssText = [
            'width:100%', 'height:34px',
            'background:linear-gradient(180deg,#4488ee,#2260bb)',
            'border:1px solid rgba(20,60,140,0.5)',
            'border-radius:7px',
            'color:white',
            'font-size:12px', 'font-weight:700',
            'cursor:pointer', 'letter-spacing:0.04em',
            'font-family:Helvetica Neue,Helvetica,Arial,sans-serif',
            'box-shadow:0 2px 6px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.2)',
            'transition:filter 0.15s',
        ].join(';');
        btn.addEventListener('mouseenter', () => btn.style.filter = 'brightness(1.1)');
        btn.addEventListener('mouseleave', () => btn.style.filter = 'brightness(1)');

        // Footer note
        const note = el('div');
        note.style.cssText = 'font-size:10px;color:#8a9aaa;text-align:center;margin-top:2px;';
        note.textContent = 'This system is under maintenance.';

        card.append(orb, title, sub, div, inputWrap, btn, note);
        lock.appendChild(card);
        document.body.appendChild(lock);

        // Focus input after paint
        requestAnimationFrame(() => input.focus());

        function attempt() {
            if (input.value === LOCK_PASSWORD) {
                // Correct — fade out lock screen
                lock.style.transition = 'opacity 0.4s';
                lock.style.opacity    = '0';
                setTimeout(() => {
                    lock.remove();
                    onUnlock();
                }, 400);
            } else {
                // Wrong — shake and show error
                errMsg.textContent = 'Incorrect password.';
                input.value = '';
                inputWrap.style.animation = 'none';
                requestAnimationFrame(() => {
                    inputWrap.style.animation = 'lock-shake 0.5s ease';
                });
                input.focus();
                setTimeout(() => { errMsg.textContent = ''; }, 2000);
            }
        }

        btn.addEventListener('click', attempt);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.stopPropagation(); attempt(); }
        });
    }

    function initOS() {
        if (MAINTENANCE_MODE) {
            showLockScreen(bootDesktop);
        } else {
            bootDesktop();
        }
    }

    function bootDesktop() {
        buildMenubar();
        buildDock();
        buildAppMenu();
        buildDesktopIcons();
        startClock();
        attachGlobalEvents();
        if (!audio && playlist.length > 0) loadTrack(0);
        // Show welcome message after short delay
        setTimeout(showWelcomePopup, 2000);
    }

    // ── Welcome popup ─────────────────────────────────────────────────────
    function showWelcomePopup() {
        const desktop = document.getElementById('desktop');
        if (!desktop || document.getElementById('welcome-popup')) return;

        const MESSAGE = "hey, welcome to KnoxiaOS. feel free to explore — open Orbit to visit the star system and discover what\'s out there. want to talk to people? the chat app has you covered. enjoy the ride.";

        // Inject keyframes once
        if (!document.getElementById('popup-kf')) {
            const s = document.createElement('style');
            s.id = 'popup-kf';
            s.textContent = [
                '@keyframes popup-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
                '@keyframes dot-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}',
            ].join('');
            document.head.appendChild(s);
        }

        const popup = el('div');
        popup.id = 'welcome-popup';
        popup.style.cssText = [
            'position:absolute',
            'bottom:16px', 'right:16px',
            'width:272px',
            'border-radius:10px',
            'overflow:hidden',
            'display:flex', 'flex-direction:column',
            'border:1px solid rgba(60,90,140,0.4)',
            'box-shadow:0 12px 40px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.2)',
            'animation:popup-in 0.4s cubic-bezier(0.34,1.56,0.64,1)',
            'z-index:1200',
        ].join(';');

        // Titlebar
        const titlebar = el('div');
        titlebar.style.cssText = [
            'height:22px',
            'display:flex', 'align-items:center', 'padding:0 8px', 'gap:5px',
            'flex-shrink:0',
            'background:repeating-linear-gradient(180deg,rgba(255,255,255,0.07)0px,rgba(255,255,255,0.07)1px,transparent 1px,transparent 2px),linear-gradient(180deg,#d8e2ee 0%,#c4d0de 35%,#b8c8d8 65%,#bcc8d6 100%)',
            'border-bottom:1px solid rgba(90,120,165,0.4)',
            'cursor:default',
        ].join(';');

        // Traffic lights
        const tls = el('div', 'xp-controls');
        const closeBtn = el('button', 'xp-btn xp-btn-close');
        const minBtn   = el('button', 'xp-btn xp-btn-minimize');
        const maxBtn   = el('button', 'xp-btn xp-btn-maximize');
        tls.append(closeBtn, minBtn, maxBtn);

        const titleEl = el('div');
        titleEl.style.cssText = 'position:absolute;left:0;right:0;text-align:center;font-size:11px;font-weight:600;color:#1a2a3a;text-shadow:0 1px 0 rgba(255,255,255,0.7);pointer-events:none;';
        titleEl.textContent = 'Ramsey Knox';

        titlebar.append(tls, titleEl);

        // Body
        const body = el('div');
        body.style.cssText = [
            'background:rgba(234,240,250,0.98)',
            'padding:12px',
            'display:flex', 'flex-direction:column', 'gap:10px',
            'min-height:120px',
        ].join(';');

        // Avatar + name row
        const avatarRow = el('div');
        avatarRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const avatar = el('div');
        avatar.style.cssText = [
            'width:32px', 'height:32px', 'border-radius:50%', 'flex-shrink:0',
            'background:conic-gradient(from 180deg,#1144aa,#3388ff,#1144aa,#0a2266,#3388ff,#1144aa)',
            'border:2px solid rgba(100,140,210,0.4)',
            'box-shadow:0 1px 4px rgba(0,0,0,0.2)',
            'display:flex', 'align-items:center', 'justify-content:center',
            'font-size:11px', 'font-weight:700', 'color:white',
            'position:relative', 'overflow:hidden',
        ].join(';');
        const avatarGloss = el('div');
        avatarGloss.style.cssText = 'position:absolute;top:2px;left:4px;width:10px;height:8px;background:rgba(255,255,255,0.35);border-radius:50%;transform:rotate(-20deg);';
        avatar.appendChild(avatarGloss);

        const nameEl = el('div');
        nameEl.style.cssText = 'font-size:12px;font-weight:700;color:#1a2a3a;';
        nameEl.textContent = 'Ramsey Knox';

        const onlineEl = el('div');
        onlineEl.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:auto;';
        const onlineDot = el('div');
        onlineDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#22cc66;box-shadow:0 0 6px rgba(34,204,102,0.6);';
        const onlineLabel = el('div');
        onlineLabel.style.cssText = 'font-size:9px;color:#3a7a4a;font-weight:600;letter-spacing:0.04em;';
        onlineLabel.textContent = 'online';
        onlineEl.append(onlineDot, onlineLabel);

        avatarRow.append(avatar, nameEl, onlineEl);
        body.appendChild(avatarRow);

        // Divider
        const div = el('div');
        div.style.cssText = 'height:1px;background:linear-gradient(90deg,transparent,rgba(80,120,180,0.25),transparent);';
        body.appendChild(div);

        // Message area
        const msgArea = el('div');
        msgArea.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

        // Typing indicator
        const typingBubble = el('div');
        typingBubble.style.cssText = [
            'display:inline-flex', 'align-items:center', 'gap:3px',
            'background:rgba(200,215,240,0.7)',
            'border:1px solid rgba(100,130,180,0.2)',
            'border-radius:10px 10px 10px 2px',
            'padding:7px 10px',
            'align-self:flex-start',
        ].join(';');

        for (let i = 0; i < 3; i++) {
            const dot = el('div');
            dot.style.cssText = [
                'width:5px', 'height:5px', 'border-radius:50%',
                'background:#6688aa',
                `animation:dot-bounce 1.2s ease-in-out infinite`,
                `animation-delay:${i * 0.18}s`,
            ].join(';');
            typingBubble.appendChild(dot);
        }

        msgArea.appendChild(typingBubble);
        body.appendChild(msgArea);
        popup.append(titlebar, body);
        desktop.appendChild(popup);

        // After typing animation, replace with message
        setTimeout(() => {
            typingBubble.remove();

            const msgBubble = el('div');
            msgBubble.style.cssText = [
                'background:rgba(200,215,240,0.7)',
                'border:1px solid rgba(100,130,180,0.2)',
                'border-radius:10px 10px 10px 2px',
                'padding:9px 11px',
                'font-size:11px', 'line-height:1.6',
                'color:#1a2a3a',
                'align-self:flex-start',
                'animation:popup-in 0.3s ease',
            ].join(';');
            msgBubble.textContent = MESSAGE;
            msgArea.appendChild(msgBubble);

            // Dismiss hint
            const hint = el('div');
            hint.style.cssText = 'font-size:9px;color:#8a9aaa;text-align:right;margin-top:2px;letter-spacing:0.03em;';
            hint.textContent = 'click × to dismiss';
            body.appendChild(hint);
        }, 2200);

        // Close button dismisses with fade
        closeBtn.addEventListener('click', () => {
            popup.style.transition = 'opacity 0.25s, transform 0.25s';
            popup.style.opacity    = '0';
            popup.style.transform  = 'translateY(8px)';
            setTimeout(() => popup.remove(), 260);
        });

        // Min/max do nothing on this popup
        minBtn.addEventListener('click', () => {
            popup.style.transition = 'opacity 0.2s';
            popup.style.opacity    = '0';
            setTimeout(() => popup.remove(), 220);
        });
        maxBtn.addEventListener('click', () => {});
    }

    window.KnoxiaOS = { init: initOS };

})();
