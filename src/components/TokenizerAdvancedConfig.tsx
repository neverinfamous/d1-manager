import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { TokenizerConfig } from '@/services/fts5-types';

interface TokenizerAdvancedConfigProps {
  value: TokenizerConfig;
  onChange: (config: TokenizerConfig) => void;
  disabled?: boolean;
}

export function TokenizerAdvancedConfig({ value, onChange, disabled }: TokenizerAdvancedConfigProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleParameterChange = (key: string, paramValue: string | number) => {
    onChange({
      ...value,
      parameters: {
        ...value.parameters,
        [key]: paramValue,
      },
    });
  };

  const handleRemoveDiacriticsChange = (checked: boolean) => {
    handleParameterChange('remove_diacritics', checked ? 1 : 0);
  };

  const handleCaseSensitiveChange = (checked: boolean) => {
    handleParameterChange('case_sensitive', checked ? 1 : 0);
  };

  const isUnicode61 = value.type === 'unicode61' || value.type === 'porter';
  const isTrigram = value.type === 'trigram';

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between"
        disabled={disabled}
      >
        <span className="font-medium">Advanced Tokenizer Configuration</span>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {isExpanded && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          {isUnicode61 && (
            <>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remove-diacritics"
                    checked={value.parameters?.remove_diacritics === 1}
                    onCheckedChange={handleRemoveDiacriticsChange}
                    disabled={disabled}
                  />
                  <Label htmlFor="remove-diacritics" className="font-normal cursor-pointer">
                    Remove diacritics
                  </Label>
                  <div className="relative group">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-popover text-popover-foreground text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10">
                      Treat characters with diacritics (é, ñ, ü) as equivalent to their base forms (e, n, u)
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Treats "café" and "cafe" as equivalent
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="separator-chars">Separator Characters</Label>
                <Input
                  id="separator-chars"
                  placeholder="e.g., _-."
                  value={value.parameters?.separators || ''}
                  onChange={(e) => handleParameterChange('separators', e.target.value)}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Characters to treat as word separators (beyond whitespace)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="token-chars">Token Characters</Label>
                <Input
                  id="token-chars"
                  placeholder="e.g., @#"
                  value={value.parameters?.tokenchars || ''}
                  onChange={(e) => handleParameterChange('tokenchars', e.target.value)}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Additional characters to include in tokens (e.g., @ for emails)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="categories">Unicode Categories</Label>
                <Input
                  id="categories"
                  placeholder="e.g., L* N* Co"
                  value={value.parameters?.categories || ''}
                  onChange={(e) => handleParameterChange('categories', e.target.value)}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Unicode character categories to include (advanced users only)
                </p>
              </div>
            </>
          )}

          {isTrigram && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="case-sensitive"
                  checked={value.parameters?.case_sensitive === 1}
                  onCheckedChange={handleCaseSensitiveChange}
                  disabled={disabled}
                />
                <Label htmlFor="case-sensitive" className="font-normal cursor-pointer">
                  Case sensitive
                </Label>
                <div className="relative group">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-popover text-popover-foreground text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10">
                    Distinguish between "Apple" and "apple" in searches
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Makes searches case-sensitive
              </p>
            </div>
          )}

          {value.type === 'ascii' && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">
                ASCII tokenizer has no configurable parameters. It provides simple, fast tokenization for ASCII-only text.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

