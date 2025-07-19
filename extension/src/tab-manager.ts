// Tab management system for Browser Volume Controller
// Tracks tab metadata and audio sources across all browser tabs

import { AudioPlaybackState } from './audio-detector';

export interface TabInfo {
  tabId: number;
  title: string;
  url: string;
  favicon?: string;
  windowId: number;
  index: number;
  active: boolean;
  audible: boolean;
  muted: boolean;
  lastUpdated: number;
}

export interface AudioSource {
  tabId: number;
  tabInfo: TabInfo;
  audioState: AudioPlaybackState;
  processId?: number;
  nativeStreamId?: string;
  lastSeen: number;
}

export interface VolumeControlRequest {
  tabId: number;
  volume: number;
  mode: 'independent' | 'linked' | 'inverse';
  groupId?: string;
}

export class TabManager {
  private tabs: Map<number, TabInfo> = new Map();
  private audioSources: Map<number, AudioSource> = new Map();
  private tabGroups: Map<string, Set<number>> = new Map();
  private cleanupInterval: number | null = null;
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
  private readonly MAX_INACTIVE_TIME = 60000; // 1 minute

  constructor() {
    this.initializeTabTracking();
    this.startCleanupTimer();
  }

  private initializeTabTracking(): void {
    // Listen for tab events
    chrome.tabs.onCreated.addListener((tab) => this.handleTabCreated(tab));
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => this.handleTabUpdated(tabId, changeInfo, tab));
    chrome.tabs.onRemoved.addListener((tabId) => this.handleTabRemoved(tabId));
    chrome.tabs.onActivated.addListener((activeInfo) => this.handleTabActivated(activeInfo));
    chrome.tabs.onMoved.addListener((tabId, moveInfo) => this.handleTabMoved(tabId, moveInfo));

    // Initialize with existing tabs
    this.loadExistingTabs();
  }

  private async loadExistingTabs(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        if (tab.id) {
          this.updateTabInfo(tab);
        }
      });
    } catch (error) {
      console.error('Failed to load existing tabs:', error);
    }
  }

  private handleTabCreated(tab: chrome.tabs.Tab): void {
    if (tab.id) {
      this.updateTabInfo(tab);
    }
  }

  private handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
    // Update tab info on significant changes
    if (changeInfo.title || changeInfo.url || changeInfo.audible !== undefined || changeInfo.mutedInfo) {
      this.updateTabInfo(tab);
    }

    // Handle audio state changes
    if (changeInfo.audible !== undefined) {
      this.updateTabAudioability(tabId, changeInfo.audible);
    }

    if (changeInfo.mutedInfo) {
      this.updateTabMuteState(tabId, changeInfo.mutedInfo.muted);
    }
  }

  private handleTabRemoved(tabId: number): void {
    this.removeTab(tabId);
  }

  private handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): void {
    // Update active state for tabs
    this.tabs.forEach((tabInfo, id) => {
      tabInfo.active = (id === activeInfo.tabId);
      tabInfo.lastUpdated = Date.now();
    });
  }

  private handleTabMoved(tabId: number, moveInfo: chrome.tabs.TabMoveInfo): void {
    const tabInfo = this.tabs.get(tabId);
    if (tabInfo) {
      tabInfo.index = moveInfo.toIndex;
      tabInfo.windowId = moveInfo.windowId;
      tabInfo.lastUpdated = Date.now();
    }
  }

  private updateTabInfo(tab: chrome.tabs.Tab): void {
    if (!tab.id) return;

    const tabInfo: TabInfo = {
      tabId: tab.id,
      title: tab.title || '',
      url: tab.url || '',
      favicon: tab.favIconUrl,
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active || false,
      audible: tab.audible || false,
      muted: tab.mutedInfo?.muted || false,
      lastUpdated: Date.now()
    };

    this.tabs.set(tab.id, tabInfo);
    this.updateTabGrouping(tab.id, tabInfo.url);
  }

  private updateTabGrouping(tabId: number, url: string): void {
    try {
      const domain = new URL(url).hostname;
      
      // Remove tab from existing groups
      this.tabGroups.forEach((tabSet, groupId) => {
        tabSet.delete(tabId);
        if (tabSet.size === 0) {
          this.tabGroups.delete(groupId);
        }
      });

      // Add to domain-based group
      if (!this.tabGroups.has(domain)) {
        this.tabGroups.set(domain, new Set());
      }
      this.tabGroups.get(domain)!.add(tabId);
    } catch (error) {
      // Invalid URL, don't group
    }
  }

  private updateTabAudioability(tabId: number, audible: boolean): void {
    const tabInfo = this.tabs.get(tabId);
    if (tabInfo) {
      tabInfo.audible = audible;
      tabInfo.lastUpdated = Date.now();
    }
  }

  private updateTabMuteState(tabId: number, muted: boolean): void {
    const tabInfo = this.tabs.get(tabId);
    if (tabInfo) {
      tabInfo.muted = muted;
      tabInfo.lastUpdated = Date.now();
    }
  }

  private removeTab(tabId: number): void {
    this.tabs.delete(tabId);
    this.audioSources.delete(tabId);
    
    // Remove from groups
    this.tabGroups.forEach((tabSet, groupId) => {
      tabSet.delete(tabId);
      if (tabSet.size === 0) {
        this.tabGroups.delete(groupId);
      }
    });
  }

  public updateAudioState(tabId: number, audioState: AudioPlaybackState): void {
    const tabInfo = this.tabs.get(tabId);
    if (!tabInfo) {
      console.warn('Received audio state for unknown tab:', tabId);
      return;
    }

    const audioSource: AudioSource = {
      tabId,
      tabInfo,
      audioState,
      lastSeen: Date.now()
    };

    this.audioSources.set(tabId, audioSource);
  }

  public getTabInfo(tabId: number): TabInfo | undefined {
    return this.tabs.get(tabId);
  }

  public getAllTabs(): TabInfo[] {
    return Array.from(this.tabs.values());
  }

  public getAudioSources(): AudioSource[] {
    return Array.from(this.audioSources.values());
  }

  public getActiveAudioSources(): AudioSource[] {
    return this.getAudioSources().filter(source => 
      source.audioState.isPlaying || source.audioState.isPaused
    );
  }

  public getTabGroup(domain: string): number[] {
    const tabSet = this.tabGroups.get(domain);
    return tabSet ? Array.from(tabSet) : [];
  }

  public getAllTabGroups(): Map<string, number[]> {
    const groups = new Map<string, number[]>();
    this.tabGroups.forEach((tabSet, domain) => {
      groups.set(domain, Array.from(tabSet));
    });
    return groups;
  }

  public async setTabVolume(request: VolumeControlRequest): Promise<boolean> {
    try {
      const { tabId, volume, mode, groupId } = request;

      switch (mode) {
        case 'independent':
          return await this.setIndependentVolume(tabId, volume);
        
        case 'linked':
          return await this.setLinkedVolume(tabId, volume, groupId);
        
        case 'inverse':
          return await this.setInverseVolume(tabId, volume, groupId);
        
        default:
          return false;
      }
    } catch (error) {
      console.error('Failed to set tab volume:', error);
      return false;
    }
  }

  private async setIndependentVolume(tabId: number, volume: number): Promise<boolean> {
    try {
      const response = await this.sendMessageToTab(tabId, {
        action: 'setTabVolume',
        volume
      });
      return response?.success || false;
    } catch (error) {
      console.error('Failed to set independent volume:', error);
      return false;
    }
  }

  private async setLinkedVolume(tabId: number, volume: number, groupId?: string): Promise<boolean> {
    try {
      const targetTabs = groupId ? this.getTabGroup(groupId) : [tabId];
      const promises = targetTabs.map(id => 
        this.sendMessageToTab(id, { action: 'setTabVolume', volume })
      );
      
      const results = await Promise.allSettled(promises);
      return results.some(result => result.status === 'fulfilled' && result.value?.success);
    } catch (error) {
      console.error('Failed to set linked volume:', error);
      return false;
    }
  }

  private async setInverseVolume(tabId: number, volume: number, groupId?: string): Promise<boolean> {
    try {
      const targetTabs = groupId ? this.getTabGroup(groupId) : this.getAllTabs().map(tab => tab.tabId);
      const inverseVolume = 1 - volume;
      
      const promises = targetTabs.map(id => {
        const targetVolume = id === tabId ? volume : inverseVolume;
        return this.sendMessageToTab(id, { action: 'setTabVolume', volume: targetVolume });
      });
      
      const results = await Promise.allSettled(promises);
      return results.some(result => result.status === 'fulfilled' && result.value?.success);
    } catch (error) {
      console.error('Failed to set inverse volume:', error);
      return false;
    }
  }

  private async sendMessageToTab(tabId: number, message: any): Promise<any> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn(`Failed to send message to tab ${tabId}:`, chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = window.setInterval(() => {
      this.cleanupInactiveSources();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanupInactiveSources(): void {
    const now = Date.now();
    const toRemove: number[] = [];

    this.audioSources.forEach((source, tabId) => {
      if (now - source.lastSeen > this.MAX_INACTIVE_TIME) {
        toRemove.push(tabId);
      }
    });

    toRemove.forEach(tabId => {
      this.audioSources.delete(tabId);
    });
  }

  public getStatistics(): {
    totalTabs: number;
    audioTabs: number;
    playingTabs: number;
    groups: number;
  } {
    const audioSources = this.getAudioSources();
    return {
      totalTabs: this.tabs.size,
      audioTabs: audioSources.length,
      playingTabs: audioSources.filter(s => s.audioState.isPlaying).length,
      groups: this.tabGroups.size
    };
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.tabs.clear();
    this.audioSources.clear();
    this.tabGroups.clear();
  }
}
