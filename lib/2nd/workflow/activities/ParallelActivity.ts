import { Activity } from './Activity.js';
import { SequenceActivity } from './SequenceActivity.js';

/**
 * Right now it is a fake implementation of parallel activity.
 * SequenceActivity has same interface......
 */
export class ParallelActivity extends SequenceActivity {
  public constructor(...children: ReadonlyArray<Activity>) {
    super(...children);
  }
}
