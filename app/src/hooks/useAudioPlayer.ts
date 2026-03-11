import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioPlayerState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
}

export interface AudioPlayerActions {
    loadAudio: (audioData: number[]) => Promise<void>;
    togglePlayPause: () => void;
    seekTo: (timeMs: number) => void;
    getCurrentTimeMs: () => number;
    reset: () => void;
    setCurrentTime: (timeMs: number) => void;
}

export interface UseAudioPlayerOptions {
    musicVolume: number;
    speedRate: number;
    isDT: boolean;
}

export interface UseAudioPlayerReturn extends AudioPlayerState, AudioPlayerActions {
    audioContext: AudioContext | null;
    isLoaded: boolean;
}
export function useAudioPlayer(options: UseAudioPlayerOptions): UseAudioPlayerReturn {
    const { musicVolume, speedRate, isDT } = options;

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioGainNodeRef = useRef<GainNode | null>(null);
    const audioStartTimeRef = useRef<number>(0);
    const audioOffsetRef = useRef<number>(0);

    useEffect(() => {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        return () => {
            ctx.close();
        };
    }, []);

    useEffect(() => {
        if (audioGainNodeRef.current) {
            audioGainNodeRef.current.gain.value = musicVolume;
        }
    }, [musicVolume]);

    useEffect(() => {
        if (isPlaying && audioContextRef.current) {
            if (audioSourceRef.current) {
                const elapsedMs = (audioContextRef.current.currentTime - audioStartTimeRef.current) * 1000 * speedRate;
                audioOffsetRef.current = audioOffsetRef.current + elapsedMs;

                try {
                    audioSourceRef.current.stop();
                } catch (_e) {
                }
                audioSourceRef.current.disconnect();
                audioSourceRef.current = null;
                audioGainNodeRef.current = null;
            }

            setIsPlaying(false);
            setCurrentTime(audioOffsetRef.current);
        }
    }, [isDT]);

    const createAudioSource = useCallback((startOffsetSec: number) => {
        if (!audioContextRef.current || !audioBufferRef.current) return null;

        const source = audioContextRef.current.createBufferSource();
        const gainNode = audioContextRef.current.createGain();

        source.buffer = audioBufferRef.current;

        if (isDT) {
            source.playbackRate.value = 1.5;
        }

        source.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        gainNode.gain.value = musicVolume;

        source.onended = () => {
            if (audioSourceRef.current === source) {
                audioSourceRef.current = null;
                audioGainNodeRef.current = null;
                audioOffsetRef.current = 0;
                setIsPlaying(false);
            }
        };

        if (startOffsetSec < audioBufferRef.current.duration) {
            source.start(0, startOffsetSec);
        }

        return { source, gainNode };
    }, [musicVolume, isDT]);

    const loadAudio = useCallback(async (audioData: number[]) => {
        if (!audioContextRef.current) return;

        const arrayBuffer = new Uint8Array(audioData).buffer;
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        audioBufferRef.current = audioBuffer;
        setDuration(audioBuffer.duration * 1000);
    }, []);

    const getCurrentTimeMs = useCallback((): number => {
        if (!audioContextRef.current || !isPlaying) {
            return audioOffsetRef.current;
        }

        const elapsedMs = (audioContextRef.current.currentTime - audioStartTimeRef.current) * 1000 * speedRate;
        return audioOffsetRef.current + elapsedMs;
    }, [isPlaying, speedRate]);

    const togglePlayPause = useCallback(() => {
        if (!audioContextRef.current || !audioBufferRef.current) return;

        if (isPlaying) {
            if (audioSourceRef.current) {
                audioSourceRef.current.stop();
                audioSourceRef.current.disconnect();
            }

            const elapsedMs = (audioContextRef.current.currentTime - audioStartTimeRef.current) * 1000 * speedRate;
            audioOffsetRef.current = audioOffsetRef.current + elapsedMs;

            audioSourceRef.current = null;
            audioGainNodeRef.current = null;
            setIsPlaying(false);
        } else {
            const audioNodes = createAudioSource(audioOffsetRef.current / 1000);

            if (audioNodes) {
                audioSourceRef.current = audioNodes.source;
                audioGainNodeRef.current = audioNodes.gainNode;
                audioStartTimeRef.current = audioContextRef.current.currentTime;
                setIsPlaying(true);
            }
        }
    }, [isPlaying, createAudioSource, speedRate]);

    const seekTo = useCallback((timeMs: number) => {
        if (!audioContextRef.current || !audioBufferRef.current) return;

        const wasPlaying = isPlaying;

        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
            audioGainNodeRef.current = null;
        }

        audioOffsetRef.current = Math.max(0, Math.min(timeMs, duration));
        setCurrentTime(audioOffsetRef.current);

        if (wasPlaying) {
            const audioNodes = createAudioSource(audioOffsetRef.current / 1000);

            if (audioNodes) {
                audioSourceRef.current = audioNodes.source;
                audioGainNodeRef.current = audioNodes.gainNode;
                audioStartTimeRef.current = audioContextRef.current.currentTime;
            }
        }
    }, [isPlaying, duration, createAudioSource]);

    const reset = useCallback(() => {
        if (audioSourceRef.current) {
            try {
                audioSourceRef.current.stop();
            } catch (_e) {
            }
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        audioGainNodeRef.current = null;
        audioBufferRef.current = null;
        audioOffsetRef.current = 0;
        audioStartTimeRef.current = 0;
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
    }, []);

    return {
        isPlaying,
        currentTime,
        duration,
        audioContext: audioContextRef.current,
        isLoaded: audioBufferRef.current !== null,
        loadAudio,
        togglePlayPause,
        seekTo,
        getCurrentTimeMs,
        reset,
        setCurrentTime,
    };
}
