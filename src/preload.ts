import { contextBridge } from 'electron';
import { coreApi }      from './preload/core';
import { seasonApi }    from './preload/season';
import { rosterApi }    from './preload/roster';
import { contractsApi } from './preload/contracts';
import { tradesApi }    from './preload/trades';
import { draftApi }     from './preload/draft';
import { statsApi }     from './preload/stats';
import { coachingApi }  from './preload/coaching';

contextBridge.exposeInMainWorld('api', {
  ...coreApi,
  ...seasonApi,
  ...rosterApi,
  ...contractsApi,
  ...tradesApi,
  ...draftApi,
  ...statsApi,
  ...coachingApi,
});
