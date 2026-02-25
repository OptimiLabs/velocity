import BetterSqlite3 from "better-sqlite3";

type AnyFn = (...args: unknown[]) => unknown;

function wrapStatement<T extends object>(stmt: T): T {
  return new Proxy(stmt, {
    get(target, prop, receiver) {
      if (prop === "get") {
        return (...args: unknown[]) => {
          const row = (target as { get: AnyFn }).get(...args);
          return row === undefined ? null : row;
        };
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// Minimal runtime shim so Vitest (running on Node) can execute tests written
// against Bun's sqlite module API shape. Main difference we normalize: Bun's
// Statement#get() returns `null` for no row; better-sqlite3 returns `undefined`.
export class Database {
  private readonly db: InstanceType<typeof BetterSqlite3>;

  constructor(...args: ConstructorParameters<typeof BetterSqlite3>) {
    this.db = new BetterSqlite3(...args);
  }

  exec(...args: Parameters<InstanceType<typeof BetterSqlite3>["exec"]>) {
    return this.db.exec(...args);
  }

  prepare(...args: Parameters<InstanceType<typeof BetterSqlite3>["prepare"]>) {
    return wrapStatement(this.db.prepare(...args));
  }

  close(...args: Parameters<InstanceType<typeof BetterSqlite3>["close"]>) {
    return this.db.close(...args);
  }

  pragma(...args: Parameters<InstanceType<typeof BetterSqlite3>["pragma"]>) {
    return this.db.pragma(...args);
  }

  transaction(
    ...args: Parameters<InstanceType<typeof BetterSqlite3>["transaction"]>
  ) {
    return this.db.transaction(...args);
  }
}

export default Database;
