import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TOKENIZER_PRESETS, type TokenizerConfig } from '@/services/fts5-types';

interface TokenizerPresetSelectorProps {
  value: TokenizerConfig;
  onChange: (config: TokenizerConfig) => void;
  disabled?: boolean;
}

export function TokenizerPresetSelector({ value, onChange, disabled }: TokenizerPresetSelectorProps): React.JSX.Element {
  const handlePresetChange = (presetType: string): void => {
    const preset = TOKENIZER_PRESETS.find(p => p.type === presetType);
    if (preset) {
      onChange({
        type: preset.type,
        ...(preset.defaultParameters && { parameters: preset.defaultParameters }),
      });
    }
  };

  return (
    <fieldset className="space-y-4">
      <legend className="text-base font-semibold">Tokenizer</legend>
      <p className="text-sm text-muted-foreground -mt-2">
        Choose how text is split into searchable tokens
      </p>
      
      <RadioGroup
        value={value.type}
        onValueChange={handlePresetChange}
        disabled={disabled}
        className="space-y-3"
      >
        {TOKENIZER_PRESETS.map((preset) => (
          <div key={preset.type} className="flex items-start space-x-3">
            <RadioGroupItem value={preset.type} id={`tokenizer-${preset.type}`} className="mt-1" />
            <div className="flex-1">
              <Label
                htmlFor={`tokenizer-${preset.type}`}
                className="font-medium cursor-pointer"
              >
                {preset.label}
              </Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                {preset.description}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

