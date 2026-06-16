export function createMusicPlayer() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.85;
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);

    let source = null;
    let buffer = null;
    let loadedUrl = null;
    let startedAt = 0;
    let pausedAt = 0;
    let playing = false;
    let onTrackEnded = null;

    function stopSource() {
        if (!source) return;
        source.onended = null;
        try { source.stop(); } catch (_) { /* already stopped */ }
        source.disconnect();
        source = null;
    }

    async function ensureContext() {
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
    }

    async function load(trackUrl) {
        if (loadedUrl === trackUrl && buffer) return buffer;

        stopSource();
        playing = false;
        pausedAt = 0;
        startedAt = 0;

        const response = await fetch(trackUrl);
        if (!response.ok) throw new Error(`Failed to load audio: ${trackUrl}`);

        const arrayBuffer = await response.arrayBuffer();
        buffer = await audioContext.decodeAudioData(arrayBuffer);
        loadedUrl = trackUrl;
        return buffer;
    }

    async function play(fromStart = false) {
        await ensureContext();
        if (!buffer) return;

        if (fromStart) pausedAt = 0;

        stopSource();

        source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(gainNode);
        source.onended = () => {
            if (!playing) return;
            playing = false;
            pausedAt = 0;
            onTrackEnded?.();
        };

        startedAt = audioContext.currentTime - pausedAt;
        source.start(0, pausedAt);
        playing = true;
    }

    function pause() {
        if (!playing) return;
        pausedAt = audioContext.currentTime - startedAt;
        stopSource();
        playing = false;
    }

    function stop() {
        stopSource();
        playing = false;
        pausedAt = 0;
        startedAt = 0;
        buffer = null;
        loadedUrl = null;
    }

    function seek(ratio) {
        if (!buffer?.duration) return;
        pausedAt = buffer.duration * Math.max(0, Math.min(1, ratio));
        if (playing) play(false);
    }

    function getCurrentTime() {
        if (!buffer) return 0;
        if (playing) return Math.min(audioContext.currentTime - startedAt, buffer.duration);
        return pausedAt;
    }

    function getDuration() {
        return buffer?.duration ?? 0;
    }

    function getProgress() {
        if (!buffer?.duration) return 0;
        return Math.min(getCurrentTime() / buffer.duration, 1);
    }

    function isPlaying() {
        return playing;
    }

    function getEqBands(count = 12, segments = 8) {
        analyser.getByteFrequencyData(frequencyData);
        const bands = [];
        const step = Math.max(1, Math.floor(frequencyData.length / count));

        for (let i = 0; i < count; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += frequencyData[i * step + j] ?? 0;
            }
            bands.push(Math.ceil((sum / step / 255) * segments));
        }

        return bands;
    }

    function setOnTrackEnded(callback) {
        onTrackEnded = callback;
    }

    return {
        load,
        play,
        pause,
        stop,
        seek,
        getCurrentTime,
        getDuration,
        getProgress,
        isPlaying,
        getEqBands,
        setOnTrackEnded,
        ensureContext,
    };
}
