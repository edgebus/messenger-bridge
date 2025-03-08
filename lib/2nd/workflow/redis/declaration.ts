import 'ioredis';

declare module 'ioredis' {
  interface Redis {
    lockNextWorkflowApplication(
      activityVersion: string,
      lockInstance: string,
      lockTimeout: number,
      lockTagsJsonArray: string,
      cb: (err: any, result: string | null) => void,
    ): void;
  }
}
