// Virtual filesystem — single source of truth for files, apps, and the music library.
export const vfs = {
    '/Music': {
        type: 'folder',
        label: 'Music',
        children: {
            '01. SIGNAL FLOW.wav': {
                type: 'audio',
                url: './01. SIGNAL FLOW.wav',
                label: '01. SIGNAL FLOW.wav',
            },
            '02. KNOXIA SUNSET.wav': {
                type: 'audio',
                url: './02. KNOXIA SUNSET.wav',
                label: '02. KNOXIA SUNSET.wav',
            },
            '03. DIGITAL GHOST.wav': {
                type: 'audio',
                url: './03. DIGITAL GHOST.wav',
                label: '03. DIGITAL GHOST.wav',
            },
        },
    },
    '/Documents': {
        type: 'folder',
        label: 'Documents',
        children: {
            'lyrics.txt': {
                type: 'text',
                label: 'lyrics.txt',
                content: "VERSE 1:\nInside the neon glow,\nSignals start to flow...",
            },
        },
    },
};

export function getMusicPlaylist() {
    return Object.values(vfs['/Music'].children);
}

export function listDirectory(path) {
    if (path === '/') {
        return Object.entries(vfs).map(([key, node]) => ({
            name: node.label,
            path: key,
            type: 'folder',
            node,
        }));
    }

    const folder = vfs[path];
    if (!folder?.children) return [];

    return Object.entries(folder.children).map(([fileName, node]) => ({
        name: node.label || fileName,
        path: `${path}/${fileName}`,
        type: node.type === 'folder' ? 'folder' : node.type,
        node,
    }));
}

export function resolveNodeAtPath(path) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const folder = vfs[`/${parts[0]}`];
    const fileName = parts.slice(1).join('/');
    return folder?.children?.[fileName] ?? null;
}

export function getParentPath(path) {
    if (path === '/') return null;
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join('/')}` : '/';
}

export const START_MENU_ITEMS = [
    { id: 'explorer', label: 'My Computer' },
    { id: 'music_player', label: 'Knoxia Player' },
    { id: 'notepad', label: 'Notepad' },
    { id: 'sys_info', label: 'System Information' },
];
