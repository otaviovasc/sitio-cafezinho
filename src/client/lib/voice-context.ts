import { createContext, useContext } from 'react';

export const VoiceContext = createContext<{ voiceEnabled: boolean }>({ voiceEnabled: false });

export function useVoice() {
  return useContext(VoiceContext);
}
