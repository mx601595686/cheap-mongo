import nodePath from 'path';
import fs from 'fs-extra';
import log from 'log-formatter';

import { IBaseStorageEnginePlugin, IBaseStorageEngineConnection } from './IBaseStorageEnginePlugin';

/**
 * 本地文件存储引擎，该引擎主要是测试使用
 * 数据存放在：/data/cheap-db
 */
export = class LocalFileStorageEnginePlugin implements IBaseStorageEnginePlugin {

    private static readonly _dbPath = '/data/cheap-db';

    get name(): string { return 'local' }

    async getConnection(): Promise<IBaseStorageEngineConnection> {
        log.warn.text.yellow('warning', "存储引擎'local'只是在测试时使用，生成环境中请不要使用");

        return {
            disconnect() { return Promise.resolve() },
            checkConnection() { return Promise.resolve() },
            set(path: string, data: any) {
                path = nodePath.join(LocalFileStorageEnginePlugin._dbPath, path);
                return fs.ensureFile(path).then(() => fs.writeJSON(path, data));
            },
            get(path: string) {
                return fs.readJSON(nodePath.join(LocalFileStorageEnginePlugin._dbPath, path));
            },
            delete(path: string) {
                return fs.remove(nodePath.join(LocalFileStorageEnginePlugin._dbPath, path));
            }
        };
    }
}

