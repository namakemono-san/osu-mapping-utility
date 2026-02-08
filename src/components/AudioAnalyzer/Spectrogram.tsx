interface SpectrogramProps {
  imageBase64: string;
}

export default function Spectrogram({ imageBase64 }: SpectrogramProps) {
  return (
    <div className="w-full rounded-lg border border-[#2a2a2a] bg-black p-2">
      <img
        src={`data:image/png;base64,${imageBase64}`}
        alt="Spectrogram"
        className="block w-full h-auto rounded"
        draggable={false}
      />
    </div>
  );
}
