import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface VisualDictionaryCardBodyProps {
    word: string;
    phonetic?: string;
    pos?: string;
    translation?: string;
    exampleSentence?: string;
    exampleTranslation?: string;
    isSpeaking?: boolean;
    onSpeak: () => void;
}

export function VisualDictionaryCardBody({
    word,
    phonetic = '',
    pos = '',
    translation = '',
    exampleSentence,
    exampleTranslation,
    isSpeaking,
    onSpeak,
}: VisualDictionaryCardBodyProps) {
    return (
        <>
            <div className="mb-6 text-center">
                <h1 className="mb-3 font-serif text-5xl font-bold tracking-tight text-gray-900">{word}</h1>
                <div className="mt-3 flex items-center justify-center gap-2">
                    <span className="text-sm text-gray-500">{phonetic.trim() || 'No phonetic'}</span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {pos.trim() || 'Unknown'}
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onSpeak}
                        className={isSpeaking ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}
                    >
                        <Volume2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="mb-8 text-center">
                <div className="mx-auto mb-4 mt-6 h-[2px] w-8 bg-gray-200" />
                <p className="text-base font-medium text-gray-800">{translation.trim() || 'No translation available'}</p>
            </div>

            {(exampleSentence?.trim() || exampleTranslation?.trim()) && (
                <div className="mb-8 mt-2 text-center">
                    {exampleSentence?.trim() ? (
                        <p className="text-center font-serif text-lg italic leading-relaxed text-gray-800">
                            {exampleSentence.trim()}
                        </p>
                    ) : null}
                    <p className="mb-3 mt-4 text-[10px] uppercase tracking-widest text-gray-400">— LINGOVIBE CONTEXT</p>
                    {exampleTranslation?.trim() ? (
                        <p className="text-center text-sm text-gray-500">{exampleTranslation.trim()}</p>
                    ) : null}
                </div>
            )}
        </>
    );
}
