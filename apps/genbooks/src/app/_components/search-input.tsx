import { XIcon } from "lucide-react";

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    onClear: () => void;
  }
  
  export function SearchInput({ value, onChange, onClear }: SearchInputProps) {
    return (
      <div className="content-card flex flex-col gap-2 p-2">
        <div className="flex justify-between">
          <h3 className="font-bold">Modulsuche</h3>
          <button type="button" onClick={onClear} className="btn-soft p-1.5">
            <XIcon />
          </button>
        </div>
        <input
          onChange={(e) => onChange(e.target.value)}
          className="field-shell w-full px-3 py-2.5"
          placeholder="Suchbegriff eingeben."
          value={value}
        />
      </div>
    );
  }
