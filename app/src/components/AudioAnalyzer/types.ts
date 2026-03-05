export interface AudioAnalysisResult {
  image_base64: string;
  sample_rate: number;
  channels: number;
  bits_per_sample: number;
  original_sample_rate: number;
  frequency_cutoff_hz: number;
  duration_seconds: number;
  file_size_bytes: number;
  original_size_bytes: number;
  average_bitrate_kbps: number;
  image_width: number;
  image_height: number;
  max_frequency_hz: number;
  decode_ms: number;
  analyze_ms: number;
  render_ms: number;
  total_ms: number;
}

export interface AudioAnalyzerProps {
  className?: string;
}
