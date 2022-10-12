import Listener from '../listener';
import schedule from 'node-schedule';
import fetch from 'node-fetch';
import { MAIN_API_URL } from '../../constants';
import { firestoreConstants } from '@infinityxyz/lib/utils';

const PAUSE_BETWEEN_CALLS = 5 * 1000;
const STATS_BASE_URL = `${MAIN_API_URL}/collections/update-trending-stats`;
const TRENDING_STATS_TTS = 1000 * 60 * 60 * 20; // time to stale - 20 hrs

const statsEndpoints = [
  `${STATS_BASE_URL}?period=daily&queryBy=by_sales_volume`,
  `${STATS_BASE_URL}?period=weekly&queryBy=by_sales_volume`,
  `${STATS_BASE_URL}?period=monthly&queryBy=by_sales_volume`
];

export class TrendingStatsTrigger extends Listener<unknown> {
  constructor({}, db: FirebaseFirestore.Firestore) {
    super(db);
  }

  async setup() {}

  async monitor(handler?: unknown) {
    console.log(`Started TrendingStatsTrigger`);
    // run once
    this.run();

    // then run every 20 hours
    const job = schedule.scheduleJob('TrendingStatsTrigger', '0 */20 * * *', async () => {
      console.log(`Scheduled job [${job.name}] started at ${job.nextInvocation().toISOString()}`);
      this.run();
    });
  }

  async run() {
    // first delete stale trending collections
    const shouldFetchNew = await this.checkAndDeleteStaleTrendingCollections();

    if (shouldFetchNew) {
      let timer = 0;
      for (let i = 0; i < statsEndpoints.length; i++) {
        setTimeout(() => {
          const url = statsEndpoints[i];
          fetch(url, { method: 'PUT' })
            .then(() => {
              console.log('Fetched top collections stats', url);
            })
            .catch((err: any) => console.error(err));
        }, timer);
        timer = PAUSE_BETWEEN_CALLS;
      }
    } else {
      console.log('No need to fetch new trending collections');
    }
  }

  async checkAndDeleteStaleTrendingCollections(): Promise<boolean> {
    console.log('Checking and deleting stale trending collections');
    try {
      const MAX_RETRY_ATTEMPTS = 5;
      const bulkWriter = this.db.bulkWriter();
      bulkWriter.onWriteError((error) => {
        if (error.failedAttempts < MAX_RETRY_ATTEMPTS) {
          return true;
        } else {
          console.log('Failed delete at document: ', error.documentRef.path);
          return false;
        }
      });

      const trendingCollectionsRef = this.db.collection(firestoreConstants.TRENDING_COLLECTIONS_COLL);
      const trendingCollectionsByVolumeDocRef = trendingCollectionsRef.doc(firestoreConstants.TRENDING_BY_VOLUME_DOC);
      const lastUpdatedAt = (await trendingCollectionsByVolumeDocRef.get()).data()?.updatedAt;
      if (typeof lastUpdatedAt !== 'number' || Date.now() - lastUpdatedAt > TRENDING_STATS_TTS) {
        await this.db.recursiveDelete(trendingCollectionsRef, bulkWriter);
        await bulkWriter.flush();
        console.log('Deleted old trending collections');
        // add new updatedAt timestamp
        await trendingCollectionsByVolumeDocRef.set({ updatedAt: Date.now() });
        return true;
      }
    } catch (err) {
      console.error('Failed deleting old trending collection', err);
    }
    return false;
  }
}
