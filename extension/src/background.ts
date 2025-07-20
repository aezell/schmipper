// Browser extension background script
// Handles communication with native messaging host and audio source tracking

const NATIVE_HOST_NAME = 'com.browservolume.host';

interface AudioSource {
  tabId: number;
  title: string;
  favicon?: string;
  url: string;
  volume: number;
  muted: boolean;
  processId?: number;
  isPlaying: boolean;
}

import { 
  getErrorHandler, 
  handleError, 
  wrapOperation,
  ErrorType, 
  ErrorSeverity 
} from './error-handler';

interface VolumeMessage {
  action: string;
  tabId?: number;
  volume?: number;
  muted?: boolean;
}

// VolumeMessage interface for future native host communication

interface AudioStateMessage {
  action: 'audioStateChanged';
  tabId: number;
  state: {
    isPlaying: boolean;
    sources: string[];
    timestamp: number;
  };
}

let nativePort: any | null = null;
let audioSources: Map<number, AudioSource> = new Map();
let tabToProcessMap: Map<number, number> = new Map(); // Maps tab ID to process ID
let processToSourceMap: Map<number, string> = new Map(); // Maps process ID to source ID
const errorHandler = getErrorHandler();

// Connect to native messaging host
function connectToNativeHost(): Promise<chrome.runtime.Port> {
  return wrapOperation(
    async () => {
      if (nativePort && nativePort.name) {
        errorHandler.updateConnectionStatus({ 
          isConnected: true, 
          status: 'connected' 
        });
        return nativePort;
      }

      errorHandler.updateConnectionStatus({ 
        status: 'connecting',
        lastConnectAttempt: Date.now()
      });

      return new Promise<chrome.runtime.Port>((resolve, reject) => {
        try {
          nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
          
          nativePort.onMessage.addListener((message: any) => {
            // Forward messages to popup/content scripts
            chrome.runtime.sendMessage({ source: 'nativeHost', data: message }).catch(() => {
              // Popup might not be open, ignore error
            });
          });

          nativePort.onDisconnect.addListener(() => {
            const lastError = chrome.runtime.lastError?.message || 'Unknown disconnection';
            
            handleError(
              new Error(lastError),
              ErrorType.NATIVE_MESSAGING,
              ErrorSeverity.HIGH,
              { source: 'nativeHost_disconnect' }
            );
            
            errorHandler.updateConnectionStatus({
              isConnected: false,
              status: 'disconnected',
              lastError
            });
            
            nativePort = null;
          });

          errorHandler.updateConnectionStatus({
            isConnected: true,
            status: 'connected',
            connectionAttempts: 0
          });

          resolve(nativePort);
        } catch (error) {
          const connectError = error instanceof Error ? error : new Error(String(error));
          
          errorHandler.updateConnectionStatus({
            isConnected: false,
            status: 'error',
            lastError: connectError.message,
            connectionAttempts: errorHandler.getConnectionStatus().connectionAttempts + 1
          });
          
          reject(connectError);
        }
      });
    },
    'connectToNativeHost',
    ErrorType.NATIVE_MESSAGING,
    ErrorSeverity.HIGH,
    true
  );
}

// Handle audio state changes from content scripts
async function handleAudioStateChange(message: AudioStateMessage, sender: chrome.runtime.MessageSender): Promise<void> {
  if (!sender.tab) return;

  const tabId = sender.tab.id!;
  
  // Validate message.state exists
  if (!message.state) {
    return;
  }
  
  const { isPlaying } = message.state;
  const hadSource = audioSources.has(tabId);

  if (isPlaying) {
    // Add or update audio source, preserving existing volume/mute settings
    const existingSource = audioSources.get(tabId);
    const audioSource: AudioSource = {
      tabId,
      title: sender.tab.title || 'Unknown Tab',
      favicon: sender.tab.favIconUrl,
      url: sender.tab.url || '',
      volume: existingSource?.volume ?? 100, // Preserve existing volume or default to 100
      muted: existingSource?.muted ?? false, // Preserve existing mute state or default to false
      isPlaying: true
    };
    
    audioSources.set(tabId, audioSource);
    
    // Map tab to browser process
    await mapTabToProcess(tabId, sender.tab);
    
    // Only notify popup if this is a new source
    if (!hadSource) {
      chrome.runtime.sendMessage({
        action: 'audioSourcesUpdated',
        sources: Array.from(audioSources.values())
      }).catch(() => {
        // Popup might not be open, ignore error
      });
    }
  } else {
    // Remove audio source and clear mappings
    audioSources.delete(tabId);
    const processId = tabToProcessMap.get(tabId);
    if (processId) {
      tabToProcessMap.delete(tabId);
      processToSourceMap.delete(processId);
    }
    
    // Only notify popup if we actually removed a source
    if (hadSource) {
      chrome.runtime.sendMessage({
        action: 'audioSourcesUpdated',
        sources: Array.from(audioSources.values())
      }).catch(() => {
        // Popup might not be open, ignore error
      });
    }
  }
}

// Map tab to browser process for system-level audio control
async function mapTabToProcess(_tabId: number, _tab: chrome.tabs.Tab): Promise<void> {
  // Skip process mapping for now - content script control doesn't need it
}

// Query all tabs for current audio state to catch any sources we might have missed
async function refreshAllTabAudioState(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    
    // First, find tabs that Chrome already knows have audio
    const audioTabs = tabs.filter(tab => 
      tab.audible === true || // Chrome detected audio
      (tab as any).mutedInfo?.reason === 'user' // User has interacted with tab audio
    );
    
    
    // Process all tabs, but prioritize the ones Chrome knows have audio
    const tabsToProcess = [...audioTabs, ...tabs.filter(tab => !audioTabs.includes(tab))];
    
    const promises = tabsToProcess.map(async (tab) => {
      if (!tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('moz-extension://')) {
        return; // Skip chrome internal pages and extension pages
      }
      
      try {
        // For tabs Chrome knows have audio, add them immediately as a fallback
        if (tab.audible === true) {
          await handleAudioStateChange({
            action: 'audioStateChanged',
            tabId: tab.id,
            state: {
              isPlaying: true,
              sources: [],
              timestamp: Date.now()
            }
          }, { tab });
        }
        
        // Also try to inject content script and get detailed audio state
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          
          // Wait a moment for script to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (injectionError) {
          // Content script might already be injected, or tab doesn't support injection
        }
        
        // Try to get detailed audio state from content script
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getAudioState' });
          if (response?.success && response?.hasAudio) {
            // Update the source if we haven't already added it
            if (!audioSources.has(tab.id)) {
              await handleAudioStateChange({
                action: 'audioStateChanged',
                tabId: tab.id,
                state: {
                  isPlaying: true,
                  sources: [],
                  timestamp: Date.now()
                }
              }, { tab });
            }
          }
        } catch (messageError) {
        }
      } catch (error) {
      }
    });
    
    await Promise.allSettled(promises);
  } catch (error) {
  }
}


// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((message: VolumeMessage | AudioStateMessage | any, sender, sendResponse) => {

  if (message.action === 'audioStateChanged') {
    handleAudioStateChange(message as AudioStateMessage, sender);
    sendResponse({ success: true });
    return true;
  }

  if (message.target === 'nativeHost') {
    connectToNativeHost()
      .then(port => {
        port.postMessage(message.data);
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }

  if (message.action === 'getAudioSources') {
    // Also query all tabs for current audio state to catch any missed sources
    refreshAllTabAudioState().then(() => {
      sendResponse({ 
        success: true, 
        sources: Array.from(audioSources.values()) 
      });
    }).catch(() => {
      // Even if refresh fails, return current sources
      sendResponse({ 
        success: true, 
        sources: Array.from(audioSources.values()) 
      });
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'setVolume') {
    const { tabId, volume } = message;
    if (audioSources.has(tabId)) {
      const source = audioSources.get(tabId)!;
      source.volume = volume;
      audioSources.set(tabId, source);

      // Send to content script first (immediate web-based control)
      chrome.tabs.sendMessage(tabId, {
        action: 'setVolume',
        volume: volume
      }).then(() => {
        // Skip native host for now - content script should handle everything
      }).catch(() => {
        // Tab might be unresponsive
      });
        
      sendResponse({ success: true });
      return true;
    }
    sendResponse({ success: false, error: 'Tab not found' });
    return true;
  }

  if (message.action === 'setMute') {
    const { tabId, muted } = message;
    if (audioSources.has(tabId)) {
      const source = audioSources.get(tabId)!;
      source.muted = muted;
      audioSources.set(tabId, source);

      // Send to content script first (immediate web-based control)
      chrome.tabs.sendMessage(tabId, {
        action: 'setMute',
        muted: muted
      }).then(() => {
        // Skip native host for now - content script should handle everything
      }).catch(() => {
        // Tab might be unresponsive
      });
        
      sendResponse({ success: true });
      return true;
    }
    sendResponse({ success: false, error: 'Tab not found' });
    return true;
  }



  // Default case - unknown message
  sendResponse({ success: false, error: 'Unknown message action' });
  return true;
});

// Clean up audio sources when tabs are removed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (audioSources.has(tabId)) {
    audioSources.delete(tabId);
  }
});

// Clean up audio sources when tabs are updated (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && audioSources.has(tabId)) {
    // Tab navigated to new URL, audio likely stopped
    audioSources.delete(tabId);
  }
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
});


export {};
