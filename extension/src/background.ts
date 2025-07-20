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

import { VolumeMode, VolumeModeController } from './volume-modes';
import ShortcutsManager from './shortcuts';
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
  mode?: VolumeMode;
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
let currentVolumeMode: VolumeMode = 'independent';
let volumeController: VolumeModeController = new VolumeModeController();
let shortcutsManager: ShortcutsManager;
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
            console.log('Received from native host:', message);
            // Forward messages to popup/content scripts
            chrome.runtime.sendMessage({ source: 'nativeHost', data: message }).catch(() => {
              // Popup might not be open, ignore error
            });
          });

          nativePort.onDisconnect.addListener(() => {
            const lastError = chrome.runtime.lastError?.message || 'Unknown disconnection';
            console.log('Native host disconnected:', lastError);
            
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
    console.warn('Received audio state message without state property:', message);
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
    console.log(`Audio started in tab ${tabId}: ${audioSource.title} (volume: ${audioSource.volume}%, muted: ${audioSource.muted})`);
    
    // Map tab to browser process
    await mapTabToProcess(tabId, sender.tab);
    
    // Only notify popup if this is a new source
    if (!hadSource) {
      console.log(`[Background] New audio source added, notifying popup`);
      chrome.runtime.sendMessage({
        action: 'audioSourcesUpdated',
        sources: Array.from(audioSources.values())
      }).catch(() => {
        // Popup might not be open, ignore error
        console.debug('Could not notify popup of audio source changes (popup might be closed)');
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
    console.log(`Audio stopped in tab ${tabId}`);
    
    // Only notify popup if we actually removed a source
    if (hadSource) {
      console.log(`[Background] Audio source removed, notifying popup`);
      chrome.runtime.sendMessage({
        action: 'audioSourcesUpdated',
        sources: Array.from(audioSources.values())
      }).catch(() => {
        // Popup might not be open, ignore error
        console.debug('Could not notify popup of audio source changes (popup might be closed)');
      });
    }
  }
}

// Map tab to browser process for system-level audio control
async function mapTabToProcess(tabId: number, _tab: chrome.tabs.Tab): Promise<void> {
  // Skip process mapping for now - content script control doesn't need it
  console.debug(`Skipping process mapping for tab ${tabId} - using content script only`);
}

// Query all tabs for current audio state to catch any sources we might have missed
async function refreshAllTabAudioState(): Promise<void> {
  try {
    console.log('[Background] Refreshing audio state for all tabs...');
    const tabs = await chrome.tabs.query({});
    
    // First, find tabs that Chrome already knows have audio
    const audioTabs = tabs.filter(tab => 
      tab.audible === true || // Chrome detected audio
      (tab as any).mutedInfo?.reason === 'user' // User has interacted with tab audio
    );
    
    console.log(`[Background] Chrome detected ${audioTabs.length} tabs with audio out of ${tabs.length} total tabs`);
    
    // Process all tabs, but prioritize the ones Chrome knows have audio
    const tabsToProcess = [...audioTabs, ...tabs.filter(tab => !audioTabs.includes(tab))];
    
    const promises = tabsToProcess.map(async (tab) => {
      if (!tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('moz-extension://')) {
        return; // Skip chrome internal pages and extension pages
      }
      
      try {
        // For tabs Chrome knows have audio, add them immediately as a fallback
        if (tab.audible === true) {
          console.log(`[Background] Chrome detected audio in tab ${tab.id}: ${tab.title}`);
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
          console.log(`[Background] Injected content script into tab ${tab.id}`);
          
          // Wait a moment for script to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (injectionError) {
          // Content script might already be injected, or tab doesn't support injection
          console.debug(`[Background] Could not inject into tab ${tab.id}:`, injectionError);
        }
        
        // Try to get detailed audio state from content script
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getAudioState' });
          if (response?.success && response?.hasAudio) {
            console.log(`[Background] Content script confirmed audio in tab ${tab.id}: ${tab.title}`);
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
          console.debug(`[Background] Could not get audio state from content script in tab ${tab.id}:`, messageError);
        }
      } catch (error) {
        console.debug(`[Background] Error processing tab ${tab.id}:`, error);
      }
    });
    
    await Promise.allSettled(promises);
    console.log(`[Background] Completed audio state refresh. Found ${audioSources.size} audio sources.`);
  } catch (error) {
    console.error('[Background] Failed to refresh tab audio state:', error);
  }
}


// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((message: VolumeMessage | AudioStateMessage | any, sender, sendResponse) => {
  console.log('Background received message:', message);

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
        console.error('Native messaging error:', error);
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
      console.log(`[Background] Sending setVolume message to tab ${tabId} with volume ${volume}`);
      chrome.tabs.sendMessage(tabId, {
        action: 'setVolume',
        volume: volume
      }).then((response) => {
        console.log(`[Background] Content script response:`, response);
        
        // Skip native host for now - content script should handle everything
        console.debug(`[Background] Content script handled volume control successfully`);
      }).catch((error) => {
        console.warn(`[Background] Failed to send volume command to content script:`, error);
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
      console.log(`[Background] Sending setMute message to tab ${tabId} with muted ${muted}`);
      chrome.tabs.sendMessage(tabId, {
        action: 'setMute',
        muted: muted
      }).then((response) => {
        console.log(`[Background] Content script mute response:`, response);
        
        // Skip native host for now - content script should handle everything
        console.debug(`[Background] Content script handled mute control successfully`);
      }).catch((error) => {
        console.warn(`[Background] Failed to send mute command to content script:`, error);
      });
        
      sendResponse({ success: true });
      return true;
    }
    sendResponse({ success: false, error: 'Tab not found' });
    return true;
  }

  if (message.action === 'setMode') {
    currentVolumeMode = message.mode || 'independent';
    console.log('Volume mode changed to:', currentVolumeMode);
    sendResponse({ success: true });
    return true;
  }

  // Handle shortcut actions
  if (message.action?.startsWith('shortcut-')) {
    handleShortcutAction(message)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Default case - unknown message
  sendResponse({ success: false, error: 'Unknown message action' });
  return true;
});

// Clean up audio sources when tabs are removed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (audioSources.has(tabId)) {
    console.log(`Cleaning up audio source for removed tab ${tabId}`);
    audioSources.delete(tabId);
  }
});

// Clean up audio sources when tabs are updated (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && audioSources.has(tabId)) {
    // Tab navigated to new URL, audio likely stopped
    console.log(`Tab ${tabId} navigated, removing audio source`);
    audioSources.delete(tabId);
  }
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Browser Volume Controller starting up - content script mode');
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Browser Volume Controller installed');
  // Initialize shortcuts manager
  shortcutsManager = new ShortcutsManager();
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  
  if (!shortcutsManager) {
    shortcutsManager = new ShortcutsManager();
  }
  
  await shortcutsManager.handleCommand(command);
});

// Shortcut action handlers
async function handleShortcutAction(message: any): Promise<any> {
  switch (message.action) {
    case 'shortcut-mute-all':
      return handleMuteAllShortcut();
      
    case 'shortcut-volume-all':
      return handleVolumeAllShortcut(message.delta);
      
    case 'shortcut-cycle-modes':
      return handleCycleModeShortcut();
      
    case 'shortcut-reset-volumes':
      return handleResetVolumesShortcut();
      
    case 'shortcut-focus-mode':
      return handleFocusModeShortcut();
      
    case 'shortcut-tab-control':
      return handleTabControlShortcut(message.tabIndex);
      
    default:
      throw new Error(`Unknown shortcut action: ${message.action}`);
  }
}

async function handleMuteAllShortcut(): Promise<string> {
  const sources = volumeController.toggleMuteAll();
  const isMuted = volumeController.isMasterMuted();
  
  // Apply to all audio sources
  for (const source of sources) {
    if (audioSources.has(source.tabId)) {
      const audioSource = audioSources.get(source.tabId)!;
      audioSource.muted = source.muted;
      audioSources.set(source.tabId, audioSource);
      
      // Send to native host
      try {
        const port = await connectToNativeHost();
        port.postMessage({
          action: 'setTabMute',
          tabId: source.tabId,
          muted: source.muted
        });
      } catch (error) {
        console.error('Failed to send mute command to native host:', error);
      }
    }
  }
  
  return isMuted ? 'All sources muted' : 'All sources unmuted';
}

async function handleVolumeAllShortcut(delta: number): Promise<string> {
  const sources = Array.from(audioSources.values());
  let updated = 0;
  
  for (const source of sources) {
    const newVolume = Math.max(0, Math.min(100, source.volume + delta));
    source.volume = newVolume;
    audioSources.set(source.tabId, source);
    
    // Send to native host
    try {
      const port = await connectToNativeHost();
      port.postMessage({
        action: 'setTabVolume',
        tabId: source.tabId,
        volume: newVolume
      });
      updated++;
    } catch (error) {
      console.error('Failed to send volume command to native host:', error);
    }
  }
  
  return `Volume ${delta > 0 ? 'increased' : 'decreased'} for ${updated} sources`;
}

async function handleCycleModeShortcut(): Promise<string> {
  const modes: VolumeMode[] = ['independent', 'linked', 'inverse'];
  const currentIndex = modes.indexOf(currentVolumeMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  const newMode = modes[nextIndex];
  
  volumeController.setMode(newMode);
  currentVolumeMode = newMode;
  
  return `Switched to ${newMode} mode`;
}

async function handleResetVolumesShortcut(): Promise<string> {
  const sources = Array.from(audioSources.values());
  let updated = 0;
  
  for (const source of sources) {
    source.volume = 50;
    audioSources.set(source.tabId, source);
    
    // Send to native host
    try {
      const port = await connectToNativeHost();
      port.postMessage({
        action: 'setTabVolume',
        tabId: source.tabId,
        volume: 50
      });
      updated++;
    } catch (error) {
      console.error('Failed to send volume reset to native host:', error);
    }
  }
  
  return `Reset ${updated} sources to 50% volume`;
}

async function handleFocusModeShortcut(): Promise<string> {
  // Get current active tab
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      return 'No active tab found';
    }
    
    const sources = Array.from(audioSources.values());
    let muted = 0;
    
    for (const source of sources) {
      const shouldMute = source.tabId !== activeTab.id;
      source.muted = shouldMute;
      audioSources.set(source.tabId, source);
      
      if (shouldMute) muted++;
      
      // Send to native host
      try {
        const port = await connectToNativeHost();
        port.postMessage({
          action: 'setTabMute',
          tabId: source.tabId,
          muted: shouldMute
        });
      } catch (error) {
        console.error('Failed to send focus mode command to native host:', error);
      }
    }
    
    return `Focus mode: muted ${muted} background sources`;
  } catch (error) {
    console.error('Focus mode failed:', error);
    return 'Focus mode failed';
  }
}

async function handleTabControlShortcut(tabIndex: number): Promise<string> {
  const sources = Array.from(audioSources.values());
  
  if (tabIndex >= sources.length) {
    return `No audio tab at position ${tabIndex + 1}`;
  }
  
  const targetSource = sources[tabIndex];
  
  // Toggle mute for the specific tab
  targetSource.muted = !targetSource.muted;
  audioSources.set(targetSource.tabId, targetSource);
  
  try {
    const port = await connectToNativeHost();
    port.postMessage({
      action: 'setTabMute',
      tabId: targetSource.tabId,
      muted: targetSource.muted
    });
    
    return `Tab ${tabIndex + 1} (${targetSource.title}) ${targetSource.muted ? 'muted' : 'unmuted'}`;
  } catch (error) {
    console.error('Failed to control tab:', error);
    return `Failed to control tab ${tabIndex + 1}`;
  }
}

export {};
