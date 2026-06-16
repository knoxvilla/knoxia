const PREFIX = 'knoxia:notepad:';

export function loadNotepadText(filePath, defaultContent) {
    try {
        const saved = localStorage.getItem(PREFIX + filePath);
        return saved ?? defaultContent;
    } catch {
        return defaultContent;
    }
}

export function saveNotepadText(filePath, text) {
    try {
        localStorage.setItem(PREFIX + filePath, text);
    } catch {
        /* storage full or blocked */
    }
}
