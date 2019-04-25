import * as nodePath from 'path';
import * as fs from 'fs-extra';
import log from 'log-formatter';

import { BaseStorageEnginePlugin, BaseStorageEngineConnection } from "./BaseStorageEnginePlugin";

/**
 * 本地文件存储引擎，该引擎主要是测试使用
 * 数据存放在：/data/cheap-db
 */
export = class LocalFileStorageEnginePlugin implements BaseStorageEnginePlugin {

    private static _dbPath = '/data/cheap-db';

    get name() { return 'local' }

    async getConnection(dbName: string): Promise<BaseStorageEngineConnection> {
        log.warn.location.yellow.text.yellow('warning', "存储引擎'local'只是在测试时使用，生成环境中请不要使用");

        const dbPath = nodePath.join(LocalFileStorageEnginePlugin._dbPath, dbName);
        await fs.ensureDir(dbPath);

        return {
            async disconnect() { },
            async checkConnection() { },
            set(path: string, data: any) {
                return fs.writeJSON(nodePath.join(dbPath, path), data);
            },
            get(path: string) {
                return fs.readJSON(nodePath.join(dbPath, path));
            },
            delete(path: string) {
                return fs.remove(nodePath.join(dbPath, path));
            }
        };
    }
}

