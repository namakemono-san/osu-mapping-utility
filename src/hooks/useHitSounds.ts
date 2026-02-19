import { useCallback, useEffect, useRef } from "react";
import type { TaikoHitType } from "../domain/osu/taikoMapper";

function bufferToWave(abuffer: AudioBuffer, len: number): Blob {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels: Float32Array[] = [];
    let sample: number;
    let offset = 0;
    let pos = 0;

    function setUint16(data: number) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: number) {
        view.setUint32(pos, data, true);
        pos += 4;
    }

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (let i = 0; i < abuffer.numberOfChannels; i++) {
        channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });
}

function createDonSound(): string {
    const ctx = new AudioContext();
    const sampleRate = ctx.sampleRate;
    const dur = 0.15;
    const buffer = ctx.createBuffer(1, sampleRate * dur, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * 8);
        data[i] = Math.sin(2 * Math.PI * 200 * t) * envelope * 0.5;
    }

    const wavBlob = bufferToWave(buffer, buffer.length);
    return URL.createObjectURL(wavBlob);
}

function createKatSound(): string {
    const ctx = new AudioContext();
    const sampleRate = ctx.sampleRate;
    const dur = 0.1;
    const buffer = ctx.createBuffer(1, sampleRate * dur, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * 12);
        data[i] = Math.sin(2 * Math.PI * 600 * t) * envelope * 0.5;
    }

    const wavBlob = bufferToWave(buffer, buffer.length);
    return URL.createObjectURL(wavBlob);
}

export type HitSoundType = TaikoHitType;

export interface UseHitSoundsReturn {
    playHitSound: (type: HitSoundType) => void;
}

export function useHitSounds(
    audioContext: AudioContext | null,
    hitsoundVolume: number,
): UseHitSoundsReturn {
    const donBufferRef = useRef<AudioBuffer | null>(null);
    const katBufferRef = useRef<AudioBuffer | null>(null);

    useEffect(() => {
        if (!audioContext) return;

        const initHitsounds = async () => {
            try {
                const donResponse = await fetch("/hitsounds/don.wav");
                if (!donResponse.ok) throw new Error("Failed to load don.wav");
                const donArrayBuffer = await donResponse.arrayBuffer();
                const donBuffer = await audioContext.decodeAudioData(donArrayBuffer);
                donBufferRef.current = donBuffer;

                const katResponse = await fetch("/hitsounds/kat.wav");
                if (!katResponse.ok) throw new Error("Failed to load kat.wav");
                const katArrayBuffer = await katResponse.arrayBuffer();
                const katBuffer = await audioContext.decodeAudioData(katArrayBuffer);
                katBufferRef.current = katBuffer;

                console.log("Hitsounds loaded successfully!");
            } catch (err) {
                console.warn("Failed to load hitsounds, using generated sounds:", err);
                const donResponse = await fetch(createDonSound());
                const donArrayBuffer = await donResponse.arrayBuffer();
                const donBuffer = await audioContext.decodeAudioData(donArrayBuffer);
                donBufferRef.current = donBuffer;

                const katResponse = await fetch(createKatSound());
                const katArrayBuffer = await katResponse.arrayBuffer();
                const katBuffer = await audioContext.decodeAudioData(katArrayBuffer);
                katBufferRef.current = katBuffer;
            }
        };

        initHitsounds();
    }, [audioContext]);

    const playHitSound = useCallback((type: HitSoundType) => {
        if (!audioContext || hitsoundVolume === 0) return;

        const isKat = type.includes("kat");
        const isBig = type.includes("big");
        const buffer = isKat ? katBufferRef.current : donBufferRef.current;

        if (!buffer) return;

        const playCount = isBig ? 2 : 1;

        for (let i = 0; i < playCount; i++) {
            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();

            source.buffer = buffer;
            source.connect(gainNode);
            gainNode.connect(audioContext.destination);

            gainNode.gain.value = isBig ? hitsoundVolume * 1.2 : hitsoundVolume;
            source.start(audioContext.currentTime);
        }
    }, [audioContext, hitsoundVolume]);

    return { playHitSound };
}
