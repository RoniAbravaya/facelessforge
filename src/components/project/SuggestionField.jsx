import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SuggestionField({ 
  suggestion, 
  isLoading, 
  onUse, 
  onRegenerate,
  reasoning 
}) {
  const [justUsed, setJustUsed] = React.useState(false);

  const handleUse = () => {
    onUse();
    setJustUsed(true);
    setTimeout(() => setJustUsed(false), 2000);
  };

  if (!suggestion && !isLoading) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mt-2 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-3"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
            <span>AI is generating suggestions...</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-semibold text-purple-900">AI Suggestion</span>
                </div>
                <p className="text-sm text-slate-700">{suggestion}</p>
                {reasoning && (
                  <p className="text-xs text-slate-500 mt-2 italic">💡 {reasoning}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onRegenerate}
                  className="text-purple-700 hover:text-purple-900 hover:bg-purple-100"
                  title="Generate different suggestion"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleUse}
                  className={`${
                    justUsed 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-purple-600 hover:bg-purple-700'
                  } text-white transition-all`}
                  disabled={justUsed}
                >
                  {justUsed ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Used!
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      Use
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}