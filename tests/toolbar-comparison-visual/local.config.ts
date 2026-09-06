import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'local.spec.ts',workers:1,retries:0,timeout:120000,expect:{timeout:15000},use:{viewport:{width:1600,height:1100},navigationTimeout:60000,actionTimeout:20000}});
