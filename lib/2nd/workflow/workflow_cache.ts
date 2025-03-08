import './redis/declaration.js';

import {
  FCancellationExecutionContext,
  FCancellationToken,
  FException,
  FExceptionInvalidOperation,
  FExecutionContext,
  FExecutionContextBase,
  FExecutionElement,
  FInitableBase,
  FLogger,
} from '@freemework/common';
import RedisClient, { ChainableCommander, Redis, RedisOptions } from 'ioredis';

import { data as LUA_lockNextWorkflowApplication_4 } from './redis/lockNextWorkflowApplication-4.js';
import { Activity } from './activities/index.js';
import { WorkflowModel } from './models.js';

export abstract class WorkflowCache extends FInitableBase {
  protected readonly log: FLogger;

  protected constructor() {
    super();
    this.log = FLogger.create(this.constructor.name);
  }

  public abstract cleanupWorkflowApplication(
    executionContext: FExecutionContext,
    lockInstance: string,
    workflowUuid: string,
  ): Promise<void>;

  public abstract getActiveWorkflowApplications(executionContext: FExecutionContext): Promise<Array<string>>;

  public abstract isApprovedBreakpoint(
    executionContext: FExecutionContext,
    workflowUuid: string,
    breakpointOid: string,
  ): Promise<boolean>;

  public abstract lockNextWorkflowApplication(
    executionContext: FExecutionContext,
    lockInstance: string,
    lockTimeout: number,
    workerTags: ReadonlyArray<string>,
  ): Promise<string | null>;

  /**
   * Interrupt breakpoint sleep and mark breakpoint as approved
   */
  public abstract resumeBreakpoint(
    executionContext: FExecutionContext,
    workflowUuid: string,
    breakpointOid: string,
  ): Promise<void>;

  public abstract unlockWorkflowApplication(
    executionContext: FExecutionContext,
    lockInstance: string,
    workflowAppUuid: string,
    removeFromProcessing: boolean,
  ): Promise<void>;

  public abstract updateAndLockWorkflowApplication(
    executionContext: FExecutionContext,
    lockInstance: string,
    workflowModel: WorkflowModel,
    breakpoint: null | { readonly oid: string; readonly waitTimeout: number },
  ): Promise<void>;
}

// export class WorkflowDataCacheFacadeExecutionContext extends FExecutionContextBase {
//   private readonly _workflowDataCacheFacade: WorkflowCache;

//   public static async create(
//     prevContext: FExecutionContext,
//     cacheConnectionURL: URL,
//   ): Promise<WorkflowDataCacheFacadeExecutionContext> {
//     let workflowDataCacheFacade: WorkflowCache;
//     switch (cacheConnectionURL.protocol) {
//       case 'redis:':
//         workflowDataCacheFacade = new WorkflowDataCacheFacadeRedis(cacheConnectionURL);
//         await workflowDataCacheFacade.init(prevContext);
//         break;
//       default:
//         throw new FExceptionInvalidOperation(
//           `Unsupported cache connectivity protocol '${cacheConnectionURL.protocol}' for '${WorkflowDataCacheFacadeExecutionContext.name}'`,
//         );
//     }

//     return new WorkflowDataCacheFacadeExecutionContext(prevContext, workflowDataCacheFacade);
//   }

//   public static of(executionContext: FExecutionContext): WorkflowDataCacheFacadeExecutionElement {
//     const wfDataCacheExecutionContext: WorkflowDataCacheFacadeExecutionContext = FExecutionContext.getExecutionContext(
//       executionContext,
//       WorkflowDataCacheFacadeExecutionContext,
//     );

//     return new WorkflowDataCacheFacadeExecutionElement(wfDataCacheExecutionContext);
//   }

//   private constructor(prevContext: FExecutionContext, wrap: WorkflowCache) {
//     super(prevContext);
//     this._workflowDataCacheFacade = wrap;
//   }

//   public get workflowDataCacheFacade(): WorkflowCache {
//     return this._workflowDataCacheFacade;
//   }
// }
// export class WorkflowDataCacheFacadeExecutionElement<
//   TExecutionContext extends WorkflowDataCacheFacadeExecutionContext = WorkflowDataCacheFacadeExecutionContext,
// > extends FExecutionElement<TExecutionContext> {
//   public get workflowDataCacheFacade(): WorkflowCache {
//     return this.owner.workflowDataCacheFacade;
//   }
// }

export class WorkflowDataCacheFacadeRedis extends WorkflowCache {
  // Do not use Inject inside providers to prevents circular dependency
  private readonly _ioredis: Redis;
  private readonly _processingKey: string;

  public constructor(cacheConnectionURL: URL) {
    super();

    // const config: ConfigurationProvider = Container.get(ConfigurationProvider);
    const opts: RedisOptions = WorkflowDataCacheFacadeRedis.parseRedisURL(cacheConnectionURL);
    this._ioredis = new RedisClient(opts);
    this._processingKey = `workflow:processing:${Activity.appVersion}`;
  }

  public async cleanupWorkflowApplication(
    _executionContext: FExecutionContext,
    lockInstance: string,
    workflowUuid: string,
  ): Promise<void> {
    this.verifyInitializedAndNotDisposed();

    const duplicateRedis: Redis = this.ioredis.duplicate();
    try {
      const lockKey = `workflow:lock:${workflowUuid}`;
      const tickKey = `workflow:tick:${workflowUuid}`;
      const approvedBreakpointKey = `workflow:breakpoint:approved:${workflowUuid}`;

      await duplicateRedis.watch(lockKey, tickKey, this._processingKey, approvedBreakpointKey);
      try {
        const lockedInstance: string | null = await duplicateRedis.get(lockKey);
        if (lockedInstance !== lockInstance) {
          throw new FExceptionInvalidOperation(
            `Cannot cleanup non-owner workflow application ${workflowUuid}. The application is locked by '${lockedInstance}'.`,
          );
        }

        await this.ioredis
          .pipeline()
          .del(`workflow:lock:${workflowUuid}`)
          .del(`workflow:tick:${workflowUuid}`)
          .del(approvedBreakpointKey)
          .zrem(this._processingKey, workflowUuid)
          .exec();
      } finally {
        await duplicateRedis.unwatch();
      }
    } finally {
      await duplicateRedis.quit();
    }
  }

  public async getActiveWorkflowApplications(_executionContext: FExecutionContext): Promise<Array<string>> {
    this.verifyInitializedAndNotDisposed();

    const result: Array<string> = await this.ioredis.zrange(this._processingKey, 0, -1);

    return result;
  }

  public async isApprovedBreakpoint(
    _executionContext: FExecutionContext,
    workflowUuid: string,
    breakpointOid: string,
  ): Promise<boolean> {
    this.verifyInitializedAndNotDisposed();

    const keyToApprove = `workflow:breakpoint:approved:${workflowUuid}`;
    const isExists = await this.ioredis.sismember(keyToApprove, breakpointOid);
    return isExists === 1;
  }

  public lockNextWorkflowApplication(
    _executionContext: FExecutionContext,
    lockInstance: string,
    lockTimeout: number,
    workerTags: ReadonlyArray<string>,
  ): Promise<string | null> {
    this.verifyInitializedAndNotDisposed();

    return new Promise<string | null>((resolve, reject): void => {
      try {
        this.ioredis.lockNextWorkflowApplication(
          Activity.appVersion,
          lockInstance,
          lockTimeout,
          JSON.stringify(workerTags),
          (err: any, result: string | null) => {
            if (err) {
              return reject(FException.wrapIfNeeded(err));
            }
            return resolve(result);
          },
        );
      } catch (e) {
        reject(FException.wrapIfNeeded(e));
      }
    });
  }

  public async resumeBreakpoint(
    executionContext: FExecutionContext,
    workflowUuid: string,
    breakpointOid: string,
  ): Promise<void> {
    this.verifyInitializedAndNotDisposed();

    const cancellationToken: FCancellationToken = FCancellationExecutionContext.of(executionContext).cancellationToken;

    const keyToDelete = `workflow:breakpoint:wait:${workflowUuid}`;
    const keyToApprove = `workflow:breakpoint:approved:${workflowUuid}`;

    const duplicateRedis: Redis = this.ioredis.duplicate();
    try {
      try {
        await duplicateRedis.watch(keyToDelete, keyToApprove);

        cancellationToken.throwIfCancellationRequested();
        const keyValue: string | null = await duplicateRedis.get(keyToDelete);
        // if (keyValue === null) {
        // 	throw new FExceptionInvalidOperation(
        // 		`The workflow ${workflowUuid} cannot be resumed due it not sleeping.`
        // 	);
        // }

        const breakpointIdentifier = `0.${breakpointOid}`;
        if (keyValue !== null && keyValue !== breakpointIdentifier) {
          throw new FExceptionInvalidOperation(
            `The workflow ${workflowUuid} cannot be resumed due incorrect breakpointOid: ${breakpointOid}. Current breakpoint is ${keyValue}.`,
          );
        }

        cancellationToken.throwIfCancellationRequested();
        if (keyValue !== null) {
          await duplicateRedis
            .multi()
            .del(keyToDelete)
            .sadd(keyToApprove, keyValue)
            .expire(keyToApprove, 3600000)
            .exec();
        } else {
          await duplicateRedis.multi().sadd(keyToApprove, breakpointIdentifier).expire(keyToApprove, 3600000).exec();
        }
      } finally {
        await duplicateRedis.unwatch();
      }
    } finally {
      await duplicateRedis.quit();
    }
  }

  public async unlockWorkflowApplication(
    _executionContext: FExecutionContext,
    lockInstance: string,
    workflowAppUuid: string,
    removeFromProcessing: boolean,
  ): Promise<void> {
    this.verifyInitializedAndNotDisposed();

    const duplicateRedis: Redis = this.ioredis.duplicate();
    try {
      const lockKey = `workflow:lock:${workflowAppUuid}`;
      const tickKey = `workflow:tick:${workflowAppUuid}`;
      const approvedBreakpointKey = `workflow:breakpoint:approved:${workflowAppUuid}`;
      await duplicateRedis.watch(lockKey, tickKey, this._processingKey, approvedBreakpointKey);
      try {
        const lockedInstance: string | null = await duplicateRedis.get(lockKey);
        if (lockedInstance !== lockInstance) {
          throw new FExceptionInvalidOperation(
            `Cannot unlock non-owner workflow application ${workflowAppUuid}. The application is locked by '${lockedInstance}'.`,
          );
        }

        const pipeline: ChainableCommander = this.ioredis.pipeline().del(`workflow:lock:${workflowAppUuid}`);

        if (removeFromProcessing) {
          pipeline
            .del(`workflow:tick:${workflowAppUuid}`)
            .del(approvedBreakpointKey)
            .zrem(this._processingKey, workflowAppUuid);
        }

        await pipeline.exec();
      } finally {
        await duplicateRedis.unwatch();
      }
    } finally {
      await duplicateRedis.quit();
    }
  }

  public async updateAndLockWorkflowApplication(
    _executionContext: FExecutionContext,
    lockInstance: string,
    workflowModel: WorkflowModel,
    breakpoint: null | { readonly oid: string; readonly waitTimeout: number },
  ): Promise<void> {
    this.verifyInitializedAndNotDisposed();

    const redisPipeline: ChainableCommander = await this.ioredis.multi();

    redisPipeline.set(`workflow:lock:${workflowModel.workflowUuid}`, lockInstance, 'EX', 60);
    redisPipeline.set(
      `workflow:tick:${workflowModel.workflowUuid}`,
      JSON.stringify(
        {
          workflowVirtualMachineSnapshot: workflowModel.workflowVirtualMachineSnapshot,
          nextTickTags: workflowModel.nextTickTags,
        },
        null,
        '\t',
      ),
      'EX',
      3600000,
    );
    if (breakpoint !== null) {
      redisPipeline.set(
        `workflow:breakpoint:wait:${workflowModel.workflowUuid}`,
        breakpoint.oid,
        'EX',
        breakpoint.waitTimeout,
      ); // 3600000
    }
    redisPipeline.zadd(this._processingKey, Date.now().toFixed(), workflowModel.workflowUuid);
    redisPipeline.expire(this._processingKey, 3600000);
    await redisPipeline.exec();
  }

  protected async onInit(): Promise<void> {
    const executionContext: FExecutionContext = this.initExecutionContext;
    this.log.info(executionContext, 'Initializing...');

    try {
      this.log.debug(executionContext, 'Establishing connection to Redis...');
      await this._ioredis.connect();
      this.log.debug(executionContext, 'Define Redis Lua script...');
      try {
        this._ioredis.defineCommand('lockNextWorkflowApplication', {
          numberOfKeys: 4,
          lua: LUA_lockNextWorkflowApplication_4,
        });

        this.log.info(executionContext, 'Initialized');
      } catch (e) {
        try {
          // Right now "disconnect" is NOT async, but this changes release from release of ioredis lib,
          // so await call may help in future
          await this._ioredis.disconnect();
        } catch (rawDisconnectErr) {
          const disconnectErr: FException = FException.wrapIfNeeded(rawDisconnectErr);
          const errMessage = 'Unexpected error on disconnect.';
          this.log.warn(executionContext, () => `${errMessage} ${disconnectErr.name}: ${disconnectErr.message}`);
          this.log.debug(executionContext, errMessage, disconnectErr);
        }

        throw e;
      }
    } catch (e) {
      const err: FException = FException.wrapIfNeeded(e);

      const errMessage = `Cannot initialize ${this.constructor.name} due underlying error.`;
      this.log.warn(executionContext, () => `${errMessage} ${err.name}: ${err.message}`);
      this.log.debug(executionContext, errMessage, err);

      throw new FException(`${errMessage} ${err.message}`, err);
    }
  }

  protected async onDispose(): Promise<void> {
    const executionContext: FExecutionContext = this.initExecutionContext;
    this.log.info(executionContext, 'Disposing...');
    try {
      await this._ioredis.disconnect();
      this.log.debug(executionContext, 'Disposed');
    } catch (e) {
      if (this.log.isWarnEnabled || this.log.isDebugEnabled) {
        const ex: FException = FException.wrapIfNeeded(e);
        const errorMessage = `Unexpected error on disposing ioredis: ${ex.message}"`;
        this.log.warn(executionContext, errorMessage);
        this.log.debug(executionContext, errorMessage, ex);
      }
    }
  }

  private static parseRedisURL(redisUrl: URL): RedisOptions {
    // TODO Add SSL

    const host = redisUrl.hostname;
    const port = Number(redisUrl.port);
    const db = Number(redisUrl.pathname.slice(1));
    const family: 4 | 6 =
      redisUrl.searchParams.has('ip_family') && redisUrl.searchParams.get('ip_family') === '6' ? 6 : 4;
    const opts: RedisOptions = {
      host,
      port,
      db,
      family,
      lazyConnect: true,
    };

    if (redisUrl.searchParams.has('name')) {
      opts.connectionName = decodeURIComponent(redisUrl.searchParams.get('name') as string);
    }
    if (redisUrl.searchParams.has('prefix')) {
      opts.keyPrefix = decodeURIComponent(redisUrl.searchParams.get('prefix') as string);
    }
    if (redisUrl.searchParams.has('keepAlive')) {
      const keepAliveStr = decodeURIComponent(redisUrl.searchParams.get('keepAlive') as string);
      const keepAlive = Number.parseInt(keepAliveStr, 10);
      if (!Number.isSafeInteger(keepAlive) || keepAlive <= 0) {
        throw new Error(`Wrong keepAlive value: ${keepAliveStr}. Expected positive integer.`);
      }
      opts.keepAlive = keepAlive;
    }

    if (redisUrl.password !== "") {
      opts.password = decodeURIComponent(redisUrl.password);
    }
    if (redisUrl.username !== "") {
      opts.username = decodeURIComponent(redisUrl.username);
    }

    return opts;
  }

  private get ioredis(): Redis {
    this.verifyInitializedAndNotDisposed();
    return this._ioredis;
  }
}
