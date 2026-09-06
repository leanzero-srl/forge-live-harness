import type {BrowserType, BrowserContext} from '@playwright/test';
export interface PortableReceipt {
 readonly mode: 'portable-chrome152'; readonly browserVersion: string; readonly principalSha256: string;
 readonly uiVersion: string; readonly appUrl: string; readonly executableSha256: string;
 readonly frameworkSha256: string; readonly admittedAt: string;
}
export interface PortableOptions {
 mode: 'portable-chrome152'; headed?: boolean; authFlow?: boolean;
 expected: {accountId: string; uiVersion: string}; viewport: {width:number;height:number}; recordVideoDir?: string;
}
export function getPortableReceipt(context: BrowserContext): PortableReceipt | null;
export function createPortableLauncher(dependencies: {chromium: BrowserType; installHostFlagSuppressor(context:BrowserContext):Promise<void>}): (options:PortableOptions)=>Promise<BrowserContext>;
