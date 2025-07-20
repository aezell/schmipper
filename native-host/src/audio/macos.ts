import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { AudioController, AudioSource } from './index';
import { getLogger, Logger } from '../logger';

const execAsync = promisify(exec);

interface BrowserProcess {
  pid: number;
  name: string;
  browser: string;
}

export class MacOSAudioController implements AudioController {
  private readonly browserNames = {
    'Brave Browser': 'brave',
    'Google Chrome': 'chrome',
    'Chromium': 'chrome',
    'Firefox': 'firefox',
    'Safari': 'safari'
  };
  private logger: Logger = getLogger();

  async getAudioSources(): Promise<AudioSource[]> {
    return this.logger.timeAsync('getAudioSources', async () => {
      try {
        this.logger.debug('Getting browser processes', undefined, 'MacOSAudioController');
        const browserProcesses = await this.getBrowserProcesses();
        const audioSources: AudioSource[] = [];

        this.logger.debug('Processing browser processes', { 
          processCount: browserProcesses.length 
        }, 'MacOSAudioController');

        for (const process of browserProcesses) {
          try {
            const volume = await this.getProcessVolume(process.pid);
            const source: AudioSource = {
              id: `${process.browser}-${process.pid}`,
              name: `${process.name} (PID: ${process.pid})`,
              processId: process.pid,
              volume: volume,
              isMuted: volume === 0,
              browserType: this.getBrowserType(process.browser)
            };
            audioSources.push(source);
            this.logger.debug('Added audio source', { 
              sourceId: source.id, 
              volume: source.volume 
            }, 'MacOSAudioController');
          } catch (error) {
            // Skip processes that don't have audio or can't be controlled
            this.logger.debug('Skipping process without audio control', { 
              pid: process.pid, 
              error: error instanceof Error ? error.message : String(error) 
            }, 'MacOSAudioController');
          }
        }

        this.logger.info('Retrieved audio sources', { 
          sourceCount: audioSources.length 
        }, 'MacOSAudioController');
        return audioSources;
      } catch (error) {
        this.logger.error('Failed to get audio sources', error, 'MacOSAudioController');
        return [];
      }
    }, 'MacOSAudioController');
  }

  async setVolume(sourceId: string, volume: number): Promise<void> {
    const processId = this.extractProcessId(sourceId);
    if (!processId) {
      throw new Error(`Invalid source ID: ${sourceId}`);
    }

    // Clamp volume between 0 and 100
    const clampedVolume = Math.max(0, Math.min(100, volume));
    
    try {
      // Use osascript to control application volume via AppleScript
      const script = `
        tell application "System Events"
          set targetApp to first application process whose unix id is ${processId}
          if exists targetApp then
            -- Try to set volume using Audio MIDI Setup if available
            -- Fall back to loudness control
            do shell script "loudness set ${clampedVolume / 100} --id ${processId}" with administrator privileges
          end if
        end tell
      `;

      await this.executeAppleScript(script);
    } catch (error) {
      // Fallback: try using loudness npm package directly
      await this.setProcessVolumeWithLoudness(processId, clampedVolume);
    }
  }

  async getVolume(sourceId: string): Promise<number> {
    const processId = this.extractProcessId(sourceId);
    if (!processId) {
      throw new Error(`Invalid source ID: ${sourceId}`);
    }

    return await this.getProcessVolume(processId);
  }

  async setMute(sourceId: string, muted: boolean): Promise<void> {
    if (muted) {
      await this.setVolume(sourceId, 0);
    } else {
      // If unmuting, restore to 50% volume as default
      await this.setVolume(sourceId, 50);
    }
  }

  async getBrowserProcesses(): Promise<BrowserProcess[]> {
    try {
      // Get all running processes and filter for browsers
      const { stdout } = await execAsync('ps -eo pid,comm | grep -E "(Brave|Chrome|Firefox|Safari)"');
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      
      const processes: BrowserProcess[] = [];
      
      for (const line of lines) {
        const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
        if (match) {
          const pid = parseInt(match[1]);
          const name = match[2].trim();
          
          // Map process name to browser type
          const browserType = this.mapProcessNameToBrowser(name);
          if (browserType !== 'unknown') {
            processes.push({
              pid,
              name,
              browser: browserType
            });
          }
        }
      }

      return processes;
    } catch (error) {
      console.error('Failed to get browser processes:', error);
      return [];
    }
  }

  private async getProcessVolume(processId: number): Promise<number> {
    try {
      // Try to get volume using loudness package
      const { stdout } = await execAsync(`loudness get --id ${processId}`);
      const volume = parseFloat(stdout.trim());
      return Math.round(volume * 100); // Convert from 0-1 to 0-100
    } catch (error) {
      // Fallback: assume volume is 50% if we can't detect it
      return 50;
    }
  }

  private async setProcessVolumeWithLoudness(processId: number, volume: number): Promise<void> {
    try {
      const normalizedVolume = volume / 100; // Convert from 0-100 to 0-1
      await execAsync(`loudness set ${normalizedVolume} --id ${processId}`);
    } catch (error) {
      throw new Error(`Failed to set volume for process ${processId}: ${error}`);
    }
  }

  private async executeAppleScript(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const osascript = spawn('osascript', ['-e', script]);
      let output = '';
      let error = '';

      osascript.stdout.on('data', (data) => {
        output += data.toString();
      });

      osascript.stderr.on('data', (data) => {
        error += data.toString();
      });

      osascript.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`AppleScript failed: ${error}`));
        }
      });
    });
  }

  private extractProcessId(sourceId: string): number | null {
    const match = sourceId.match(/-(\d+)$/);
    return match ? parseInt(match[1]) : null;
  }

  private mapProcessNameToBrowser(processName: string): string {
    for (const [name, browser] of Object.entries(this.browserNames)) {
      if (processName.includes(name) || processName.toLowerCase().includes(browser)) {
        return browser;
      }
    }
    return 'unknown';
  }

  private getBrowserType(browser: string): 'chrome' | 'brave' | 'firefox' | 'safari' | 'unknown' {
    switch (browser.toLowerCase()) {
      case 'brave':
        return 'brave';
      case 'chrome':
      case 'chromium':
        return 'chrome';
      case 'firefox':
        return 'firefox';
      case 'safari':
        return 'safari';
      default:
        return 'unknown';
    }
  }
}
