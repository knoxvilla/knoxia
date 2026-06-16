import { getParentPath, listDirectory } from '../vfs.js';

export const EXPLORER_ROW_HEIGHT = 22;
const TOOLBAR_H = 28;
const ADDRESS_H = 24;

export function getExplorerLayout(win) {
    const listTop = win.y + 30 + TOOLBAR_H + ADDRESS_H;
    const listHeight = win.h - 30 - TOOLBAR_H - ADDRESS_H - 8;
    return {
        toolbarY: win.y + 32,
        backX: win.x + 8,
        backY: win.y + 34,
        backW: 52,
        backH: 22,
        addressY: win.y + 32 + TOOLBAR_H,
        listTop,
        listHeight,
        contentX: win.x + 8,
        contentW: win.w - 16,
        maxRows: Math.floor(listHeight / EXPLORER_ROW_HEIGHT),
    };
}

export function drawExplorer(ctx, win) {
    const layout = getExplorerLayout(win);
    const items = listDirectory(win.currentPath);

    ctx.fillStyle = '#ece9d8';
    ctx.fillRect(win.x + 2, win.y + 32, win.w - 4, win.h - 34);

    // Toolbar
    ctx.fillStyle = '#ece9d8';
    ctx.fillRect(win.x + 2, layout.toolbarY, win.w - 4, TOOLBAR_H);
    ctx.strokeStyle = '#aca899';
    ctx.strokeRect(layout.backX, layout.backY, layout.backW, layout.backH);
    ctx.fillStyle = '#333';
    ctx.font = '11px Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText('Up', layout.backX + layout.backW / 2, layout.backY + 15);

    // Address bar
    ctx.fillStyle = 'white';
    ctx.fillRect(win.x + 8, layout.addressY + 2, win.w - 16, ADDRESS_H - 4);
    ctx.strokeStyle = '#7f9db9';
    ctx.strokeRect(win.x + 8, layout.addressY + 2, win.w - 16, ADDRESS_H - 4);
    ctx.fillStyle = '#333';
    ctx.font = '11px Tahoma';
    ctx.textAlign = 'left';
    ctx.fillText(`Address  ${win.currentPath}`, win.x + 14, layout.addressY + 17);

    // File list
    ctx.save();
    ctx.beginPath();
    ctx.rect(win.x + 4, layout.listTop, win.w - 8, layout.listHeight);
    ctx.clip();

    items.forEach((item, index) => {
        const rowY = layout.listTop + index * EXPLORER_ROW_HEIGHT;
        if (item.path === win.selectedItem) {
            ctx.fillStyle = '#316ac5';
            ctx.fillRect(win.x + 6, rowY, win.w - 12, EXPLORER_ROW_HEIGHT);
            ctx.fillStyle = 'white';
        } else {
            ctx.fillStyle = '#333';
        }

        const iconX = win.x + 12;
        const iconY = rowY + 4;
        if (item.type === 'folder') {
            ctx.fillStyle = item.path === win.selectedItem ? '#ffeb3b' : '#ffc107';
            ctx.fillRect(iconX, iconY, 14, 11);
            ctx.fillStyle = item.path === win.selectedItem ? 'white' : '#333';
        } else if (item.type === 'audio') {
            ctx.fillStyle = item.path === win.selectedItem ? '#b3d4ff' : '#5a8ef5';
            ctx.beginPath();
            ctx.arc(iconX + 7, iconY + 6, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = item.path === win.selectedItem ? 'white' : '#333';
        } else {
            ctx.fillStyle = item.path === win.selectedItem ? 'white' : '#666';
            ctx.fillRect(iconX, iconY, 10, 12);
            ctx.strokeStyle = item.path === win.selectedItem ? 'white' : '#333';
            ctx.strokeRect(iconX, iconY, 10, 12);
            ctx.fillStyle = item.path === win.selectedItem ? 'white' : '#333';
        }

        ctx.font = '11px Tahoma';
        ctx.textAlign = 'left';
        const label = item.name.length > 42 ? `${item.name.slice(0, 39)}...` : item.name;
        ctx.fillText(label, win.x + 32, rowY + 15);
    });

    ctx.restore();

    if (items.length === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '11px Tahoma';
        ctx.textAlign = 'center';
        ctx.fillText('This folder is empty.', win.x + win.w / 2, layout.listTop + 40);
    }
}

export function handleExplorerClick(win, px, py, { onOpenFile, onNavigate }) {
    const layout = getExplorerLayout(win);
    const items = listDirectory(win.currentPath);

    if (px >= layout.backX && px <= layout.backX + layout.backW &&
        py >= layout.backY && py <= layout.backY + layout.backH) {
        const parent = getParentPath(win.currentPath);
        if (parent) {
            win.currentPath = parent;
            win.selectedItem = null;
            onNavigate?.(win.currentPath);
        }
        return true;
    }

    if (py < layout.listTop || py > layout.listTop + layout.listHeight) {
        return false;
    }

    const index = Math.floor((py - layout.listTop) / EXPLORER_ROW_HEIGHT);
    const item = items[index];
    if (!item) return true;

    const now = Date.now();
    const isDoubleClick = win._lastClick?.path === item.path && (now - win._lastClick.time) < 400;
    win._lastClick = { path: item.path, time: now };

    if (isDoubleClick) {
        if (item.type === 'folder') {
            win.currentPath = item.path;
            win.selectedItem = null;
            onNavigate?.(win.currentPath);
        } else {
            onOpenFile?.(item.path, item.node);
        }
    } else {
        win.selectedItem = item.path;
    }

    return true;
}
