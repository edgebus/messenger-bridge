export type AtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

export type KeysInBoth<T1, T2> = Extract<keyof T1, keyof T2>;

export type KeysOfUnion<T> = T extends T ? keyof T : never;

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type Nullable<T> = {
  readonly [P in keyof T]: T[P] | null;
};

export type OptionalMutable<T> = Partial<Mutable<T>>;

export type Override<T, U> = Omit<T, keyof U> & U;

export type StrictOverride<T1, T2> = Omit<T1, keyof T2> & Pick<T2, Extract<keyof T2, keyof T1>>;

export type OverrideExisting<T, U> = {
  [P in keyof T]: P extends keyof U ? U[P] : T[P];
};

export type OverrideOptionalMutable<T, U> = OptionalMutable<Override<T, U>>;

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
