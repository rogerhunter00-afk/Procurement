import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface ScannerInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  scanRegionId: string;
  helper?: string;
}

export function ScannerInput({ label, placeholder, value, onChange, scanRegionId, helper }: ScannerInputProps) {
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (!showScanner) return undefined;

    const scanner = new Html5QrcodeScanner(
      scanRegionId,
      { fps: 10, qrbox: { width: 240, height: 240 }, rememberLastUsedCamera: true },
      false,
    );
    scannerRef.current = scanner;
    scanner.render(
      (decodedText) => {
        onChange(decodedText.trim());
        setShowScanner(false);
      },
      () => undefined,
    );

    return () => {
      scanner.clear().catch(() => undefined);
      scannerRef.current = null;
    };
  }, [onChange, scanRegionId, showScanner]);

  return (
    <div className="field-card">
      <label>{label}</label>
      <div className="scan-row">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase().trim())}
          placeholder={placeholder}
          inputMode="text"
          autoCapitalize="characters"
        />
        <button type="button" className="secondary" onClick={() => setShowScanner((current) => !current)}>
          {showScanner ? 'Close' : 'Scan'}
        </button>
      </div>
      {helper ? <p className="hint">{helper}</p> : null}
      {showScanner ? <div id={scanRegionId} className="scanner" /> : null}
    </div>
  );
}
