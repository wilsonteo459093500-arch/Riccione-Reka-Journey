// 有没有新版（lib/appVersion.js）—— React 用
import { useSyncExternalStore } from 'react';
import { onUpdateReady, updateReady } from './appVersion.js';

export const useUpdateReady = () => useSyncExternalStore(onUpdateReady, updateReady, () => false);
