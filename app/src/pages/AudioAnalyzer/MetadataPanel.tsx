import { Card } from "../../components/Card";

interface MetadataPanelProps {
  sampleRate: number;
  originalSampleRate: number;
  frequencyCutoffHz: number;
  channels: number;
  bitsPerSample: number;
  fileSizeBytes: number;
  originalSizeBytes: number;
  averageBitrateKbps: number;
  decodeMs: number;
  analyzeMs: number;
  renderMs: number;
  totalMs: number;
  format: "mp3" | "ogg";
}

function expectedCutoffHz(format: "mp3" | "ogg", bitrateKbps: number): number {
  if (format === "ogg") {
    if (bitrateKbps <= 128) return 15000;
    if (bitrateKbps <= 192) return 16000;
    return 18000;
  }
  if (bitrateKbps <= 128) return 16000;
  if (bitrateKbps <= 192) return 18000;
  return 19500;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function formatElapsed(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms}ms`;
}

export default function MetadataPanel(props: MetadataPanelProps) {
  const channelText = props.channels > 1 ? `(${props.channels}ch Stereo)` : "(Mono)";
  const executionText = `Load ${formatElapsed(props.decodeMs)} / Analyze ${formatElapsed(props.analyzeMs)} / Render ${formatElapsed(props.renderMs)} / Total ${formatElapsed(props.totalMs)}`;
  const originalPercent = props.originalSizeBytes > 0
    ? ((props.fileSizeBytes / props.originalSizeBytes) * 100).toFixed(1)
    : "0.0";

  const hasCutoff = props.frequencyCutoffHz > 0 && props.frequencyCutoffHz < props.sampleRate / 2;
  const expected = expectedCutoffHz(props.format, props.averageBitrateKbps);
  const isBloated = hasCutoff && props.frequencyCutoffHz < expected;

  return (
    <Card className="p-2">
      <div className="text-xs font-semibold mb-2 border-b border-border-subtle pb-1">Vitals</div>
      <div className="text-xs leading-5 space-y-0.5">
        <div>Sample Rate: {Math.round(props.sampleRate)}Hz</div>
        <div>Channels: {props.channels} {channelText}</div>
        <div>Bits Per Sample: {props.bitsPerSample}</div>
        <div>Size: {formatSize(props.fileSizeBytes)} ({originalPercent}% of original)</div>
        <div>Original Size: {formatSize(props.originalSizeBytes)}</div>
        <div>Average Bitrate: {props.averageBitrateKbps}kbps</div>
        {props.originalSampleRate !== props.sampleRate && (
          <div>Original Sample Rate: {Math.round(props.originalSampleRate / 1000)}kHz</div>
        )}
        {hasCutoff && (
          <div>Frequency Cutoff: {(props.frequencyCutoffHz / 1000).toFixed(1)}kHz</div>
        )}
        {isBloated && (
          <div className="mt-1 rounded bg-amber-900/40 border border-amber-600/50 px-2 py-1 text-amber-300 leading-4">
            Possible lossy re-encode — cutoff {(props.frequencyCutoffHz / 1000).toFixed(1)}kHz, expected ≥{(expected / 1000).toFixed(1)}kHz
          </div>
        )}
      </div>
      <div className="mt-3 text-11 leading-4 border-t border-border-subtle pt-2">{executionText}</div>
    </Card>
  );
}
